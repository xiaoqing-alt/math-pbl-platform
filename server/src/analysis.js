function countCharacters(text) {
  return Array.from(String(text || '').replace(/\s/g, '')).length;
}

function countParagraphs(text) {
  return String(text || '')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean).length;
}

const SIGNAL_RULES = [
  { key: 'data', name: '数据与计算', test: /(\d|数据|统计|测量|计算|算出|结果)/, keywords: ['数据', '计算', '测量', '统计'] },
  { key: 'chart', name: '图表表达', test: /(图|表|折线|柱状|扇形|统计图)/, keywords: ['图', '表', '统计图'] },
  { key: 'conclusion', name: '结论与建议', test: /(结论|建议|因此|所以|发现|说明)/, keywords: ['结论', '建议', '说明'] },
  { key: 'reflection', name: '反思与改进', test: /(反思|不足|改进|收获|下次)/, keywords: ['反思', '不足', '改进'] },
  { key: 'cooperation', name: '合作与分工', test: /(小组|合作|分工|成员)/, keywords: ['小组', '合作', '分工'] },
];

function matchesSignal(text, signal) {
  return signal.test.test(text);
}

// 学生作答与上传内容都视为不可信输入：去掉零宽字符、HTML 标签并限制长度，避免影响规则判断
export function sanitizeUntrustedText(value, maxLength = 20000) {
  return String(value || '')
    .replace(/[\u200b-\u200f\u202a-\u202e\ufeff]/g, '')
    .replace(/<[^>]*>/g, ' ')
    .slice(0, maxLength);
}

function criteriaSignal(criterion) {
  const text = `${criterion.name || ''}${criterion.description || ''}`;
  return SIGNAL_RULES.find((signal) => signal.keywords.some((kw) => text.includes(kw))) || null;
}

export function worksheetToText(worksheet) {
  const data = worksheet || {};
  const parts = [];
  for (const stage of data.stages || []) {
    if (stage.text && String(stage.text).trim()) parts.push(String(stage.text));
    for (const row of stage.rows || []) {
      if ((row || []).some((cell) => String(cell || '').trim())) {
        parts.push((row || []).map((cell) => String(cell || '').trim()).join(' '));
      }
    }
  }
  if (data.gains && String(data.gains).trim()) parts.push(String(data.gains));
  if (data.difficulties && String(data.difficulties).trim()) parts.push(String(data.difficulties));
  return parts.join('\n');
}

function worksheetStats(worksheet) {
  const stages = (worksheet && worksheet.stages) || [];
  const filledStages = stages.filter(
    (stage) =>
      String((stage && stage.text) || '').trim().length > 0 ||
      (stage.rows || []).some((row) => (row || []).some((cell) => String(cell || '').trim())),
  ).length;
  const tableRows = stages.reduce(
    (sum, stage) =>
      sum + (stage.rows || []).filter((row) => (row || []).some((cell) => String(cell || '').trim())).length,
    0,
  );
  const selfScores = (worksheet && worksheet.selfScores) || [];
  const selfRated = selfScores.filter((score) => score).length;
  return { stageCount: stages.length, filledStages, tableRows, selfRated };
}

export function analyzeSubmission({ content, worksheet, files, criteria }) {
  const worksheetText = worksheetToText(worksheet);
  const text = sanitizeUntrustedText(`${String(content || '')}\n${worksheetText}`);
  const stats = worksheetStats(worksheet);
  const charCount = countCharacters(text);
  const paragraphCount = countParagraphs(text);
  const fileCount = Array.isArray(files) ? files.length : 0;

  const flags = {};
  for (const signal of SIGNAL_RULES) {
    flags[signal.key] = matchesSignal(text, signal);
  }
  flags.hasStructure = /^(?:\s*(?:\d+[.、)]|[-*•]))/m.test(text);

  let lengthScore = 0;
  if (charCount >= 600) lengthScore = 30;
  else if (charCount >= 400) lengthScore = 26;
  else if (charCount >= 250) lengthScore = 20;
  else if (charCount >= 150) lengthScore = 14;
  else if (charCount >= 60) lengthScore = 8;
  else if (charCount > 0) lengthScore = 4;

  const score =
    20 +
    lengthScore +
    (flags.hasStructure ? 8 : 0) +
    (flags.data ? 12 : 0) +
    (flags.conclusion ? 10 : 0) +
    (flags.reflection ? 8 : 0) +
    Math.min(12, fileCount * 6) +
    (stats.stageCount > 0 ? Math.round((10 * stats.filledStages) / stats.stageCount) : 0);

  const base = Math.max(0, Math.min(100, Math.round(score)));

  const normalizedCriteria = (criteria || []).filter((c) => c && c.name);
  let dimensions = [];

  if (normalizedCriteria.length > 0) {
    const totalWeight =
      normalizedCriteria.reduce((sum, item) => sum + (Number(item.weight) || 0), 0) ||
      normalizedCriteria.length;

    dimensions = normalizedCriteria.map((criterion) => {
      const weight = Number(criterion.weight) || 1;
      const signal = criteriaSignal(criterion);
      const hitKeywords = signal ? signal.keywords.filter((kw) => text.includes(kw)) : [];
      let value = base;
      if (signal) {
        value += hitKeywords.length > 0 ? 4 : -10;
      }
      value = Math.max(35, Math.min(100, Math.round(value)));
      const reason = signal
        ? hitKeywords.length > 0
          ? `检测到“${hitKeywords.join('、')}”等证据，按任务单「${criterion.name}」维度加分`
          : `未检测到与「${criterion.name}」直接相关的证据，建议补充对应内容`
        : `按内容完整度（${charCount} 字）、结构、附件（${fileCount} 个）与阶段填写情况估算`;
      return {
        name: criterion.name,
        score: value,
        weight,
        weightPercent: Math.round((weight / totalWeight) * 100),
        evidence: hitKeywords,
        reason,
      };
    });
  } else {
    dimensions = [
      {
        name: '任务理解',
        score: Math.min(100, 55 + (charCount >= 150 ? 15 : 0) + (flags.conclusion ? 10 : 0)),
        weight: 1,
        weightPercent: 25,
      },
      {
        name: '过程完整',
        score: Math.min(100, 50 + (charCount >= 250 ? 20 : 0) + (flags.hasStructure ? 10 : 0)),
        weight: 1,
        weightPercent: 25,
      },
      {
        name: '结果表达',
        score: Math.min(100, 50 + (flags.data ? 15 : 0) + (flags.chart ? 10 : 0) + (flags.conclusion ? 10 : 0)),
        weight: 1,
        weightPercent: 25,
      },
      {
        name: '反思改进',
        score: Math.min(100, 45 + (flags.reflection ? 30 : 0) + (fileCount > 0 ? 5 : 0)),
        weight: 1,
        weightPercent: 25,
      },
    ];
  }

  const weightSum = dimensions.reduce((sum, item) => sum + (item.weight || 1), 0);
  const weighted = dimensions.reduce((sum, item) => sum + item.score * (item.weight || 1), 0) / weightSum;
  const finalScore = normalizedCriteria.length > 0 ? Math.round(weighted) : base;

  const strengths = [];
  const improvements = [];

  if (charCount >= 250) strengths.push('提交内容较为完整，能较充分地记录探究过程');
  else improvements.push('内容偏短，建议补充探究过程、数据与结论');

  if (flags.data) strengths.push('能使用数据或计算支撑自己的观点');
  else improvements.push('缺少数据或计算过程，结论说服力不足');

  if (flags.chart) strengths.push('有图表辅助表达，信息呈现更直观');
  else improvements.push('可以尝试用表格或统计图整理关键信息');

  if (flags.conclusion) strengths.push('有明确的结论或建议');
  else improvements.push('建议增加明确的结论，并回应任务最初的问题');

  if (flags.reflection) strengths.push('包含反思或改进思路，学习过程较完整');
  else improvements.push('可补充“遇到的困难、如何改进”的反思');

  if (flags.cooperation) strengths.push('体现了小组合作与分工');

  if (fileCount > 0) strengths.push(`上传了 ${fileCount} 个附件，成果形式较丰富`);

  if (stats.stageCount > 0) {
    if (stats.filledStages === stats.stageCount) {
      strengths.push(`项目进程 ${stats.stageCount} 个阶段均有作答，过程完整`);
    } else if (stats.filledStages > 0) {
      improvements.push(`项目进程还有 ${stats.stageCount - stats.filledStages} 个阶段未填写，建议补齐`);
    } else {
      improvements.push('尚未填写项目进程中的阶段任务，建议按阶段记录过程');
    }
  }
  if (stats.tableRows > 0) strengths.push(`填写了 ${stats.tableRows} 行数据记录表`);
  if (stats.selfRated > 0) strengths.push('完成了自我评价量表');

  return {
    version: 'rules-v3',
    generatedAt: new Date().toISOString(),
    suggestedScore: Math.max(0, Math.min(100, finalScore)),
    wordCount: charCount,
    paragraphCount,
    fileCount,
    worksheet: stats,
    flags,
    dimensions,
    ruleFacts: [
      `正文约 ${charCount} 字、${paragraphCount} 个段落`,
      flags.data ? '包含数据或计算线索' : '未识别到数据或计算线索',
      flags.chart ? '包含图表表达线索' : '未识别到图表表达线索',
      flags.conclusion ? '包含结论或建议线索' : '未识别到结论或建议线索',
      flags.reflection ? '包含反思或改进线索' : '未识别到反思线索',
      `附件 ${fileCount} 个，阶段填写 ${stats.filledStages}/${stats.stageCount || 0}`,
    ],
    strengths: strengths.slice(0, 4),
    improvements: improvements.slice(0, 4),
    note: '本分析由平台规则（rules-v3）生成：按任务单评价维度权重估算，并给出每个维度的依据；仅供教师批阅参考，教师终评可以逐项修改。',
  };
}

export function buildClassReport({ students, submissions, criteria }) {
  const submitted = submissions.filter((item) => item.status === 'submitted');
  const scored = submitted.filter((item) => item.score !== null && item.score !== undefined);
  const scores = scored.map((item) => Number(item.score));
  const average = scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : 0;

  const distribution = [
    { label: '90-100', count: 0 },
    { label: '80-89', count: 0 },
    { label: '70-79', count: 0 },
    { label: '60-69', count: 0 },
    { label: '60以下', count: 0 },
  ];

  for (const score of scores) {
    if (score >= 90) distribution[0].count += 1;
    else if (score >= 80) distribution[1].count += 1;
    else if (score >= 70) distribution[2].count += 1;
    else if (score >= 60) distribution[3].count += 1;
    else distribution[4].count += 1;
  }

  const criteriaList = (criteria || []).filter((item) => item && item.name);
  const teacherScored = submitted.filter(
    (item) => Array.isArray(item.criteriaScores) && item.criteriaScores.length > 0,
  );

  let dimensions = [];
  let dimensionSource = 'analysis';

  if (teacherScored.length > 0) {
    dimensionSource = 'teacher';
    const names = criteriaList.length
      ? criteriaList.map((item) => item.name)
      : Array.from(new Set(teacherScored.flatMap((item) => item.criteriaScores.map((entry) => entry.name))));
    dimensions = names
      .map((name) => {
        const values = teacherScored
          .map((item) => (item.criteriaScores || []).find((entry) => entry.name === name))
          .filter(Boolean)
          .map((entry) => Number(entry.score) || 0);
        return {
          name,
          average: values.length ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10 : 0,
          count: values.length,
        };
      })
      .filter((item) => item.count > 0);
  } else {
    const dimensionMap = new Map();
    for (const item of submitted) {
      const analysisDimensions =
        item.analysis && Array.isArray(item.analysis.dimensions) ? item.analysis.dimensions : [];
      for (const dim of analysisDimensions) {
        if (!dimensionMap.has(dim.name)) dimensionMap.set(dim.name, []);
        dimensionMap.get(dim.name).push(Number(dim.score) || 0);
      }
    }

    dimensions = Array.from(dimensionMap.entries()).map(([name, values]) => ({
      name,
      average: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10,
      count: values.length,
    }));
  }

  const strengthCount = new Map();
  const improvementCount = new Map();
  for (const item of submitted) {
    const analysis = item.analysis || {};
    for (const text of analysis.strengths || []) {
      strengthCount.set(text, (strengthCount.get(text) || 0) + 1);
    }
    for (const text of analysis.improvements || []) {
      improvementCount.set(text, (improvementCount.get(text) || 0) + 1);
    }
  }

  const top = (map) =>
    Array.from(map.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([text, count]) => ({ text, count }));

  return {
    totalStudents: students.length,
    submittedCount: submitted.length,
    gradedCount: scored.length,
    submissionRate: students.length ? Math.round((submitted.length / students.length) * 100) : 0,
    averageScore: average,
    distribution,
    dimensions,
    dimensionSource,
    criteria: criteriaList.map((item) => ({ name: item.name, weight: Number(item.weight) || 0 })),
    topStrengths: top(strengthCount),
    topImprovements: top(improvementCount),
    criteriaCount: (criteria || []).length,
    students: students.map((student) => {
      const submission = submissions.find((item) => Number(item.studentId) === Number(student.id));
      return {
        studentId: student.id,
        displayName: student.displayName,
        username: student.username,
        submitted: Boolean(submission && submission.status === 'submitted'),
        returned: Boolean(submission && submission.status === 'returned'),
        score: submission && submission.score !== null ? submission.score : null,
        suggestedScore: submission && submission.analysis ? submission.analysis.suggestedScore : null,
        graded: Boolean(submission && submission.gradedAt),
        criteriaScores: submission && Array.isArray(submission.criteriaScores) ? submission.criteriaScores : [],
        updatedAt: submission ? submission.updatedAt : '',
      };
    }),
  };
}
