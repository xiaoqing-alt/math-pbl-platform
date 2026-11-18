import { BOARD_NAMES } from './db.js';

export const AI_SKILL_CATALOG = {
  algebra: [
    {
      key: 'modeling',
      name: '建模思路拆解',
      tool: 'modeling-board',
      description: '把现实情境拆成变量、数量关系与数学模型',
      keywords: ['建模', '变量', '关系', '成本', '利润', '方案', '函数', '方程', '不等式'],
      action: '用一个字母表示关键数量并写出它与另一个量的关系',
      tips: ['先明确“已知什么、要求什么”', '变量要带单位，关系式要检验是否符合实际'],
    },
    {
      key: 'function_explore',
      name: '函数图像探究',
      tool: 'data-organizer',
      description: '借助图像观察变化趋势，解释实际问题',
      keywords: ['图像', '图象', '函数', '变化', '趋势', '最值', '交点'],
      action: '画出函数图像并找到关键点、变化趋势',
      tips: ['先确定自变量的取值范围', '图像的拐点、交点往往对应实际结论'],
    },
    {
      key: 'estimate',
      name: '数据估算与检验',
      tool: 'leak-estimator',
      description: '对模型结果做合理估算，并回到情境检验',
      keywords: ['估算', '检验', '误差', '合理', '数据', '计算'],
      action: '用估算判断结果是否合理，并说明误差来源',
      tips: ['先估算数量级，再精确计算', '把计算结果代回原情境检验'],
    },
    {
      key: 'conclusion',
      name: '结论表达引导',
      tool: 'conclusion-builder',
      description: '把数学结果转化为可交流的项目结论',
      keywords: ['结论', '建议', '方案', '汇报', '展示', '说明'],
      action: '用“数据 + 数学依据 + 建议”的结构表达结论',
      tips: ['结论要回应任务最初的问题', '避免只写计算过程，不写实际意义'],
    },
  ],
  geometry: [
    {
      key: 'conjecture',
      name: '几何猜想引导',
      tool: 'conjecture-board',
      description: '从观察、测量中提出猜想，再寻找验证方法',
      keywords: ['猜想', '观察', '测量', '探究', '发现', '规律', '相似', '全等'],
      action: '先观察图形特征，再提出一个可以用数学方法验证的猜想',
      tips: ['猜想要有依据：从测量数据或图形特征出发', '区分“看起来成立”和“已经证明”'],
    },
    {
      key: 'construction',
      name: '作图步骤检查',
      tool: 'checklist',
      description: '梳理解作图步骤，检查条件是否满足',
      keywords: ['作图', '尺规', '画图', '设计图', '展开图', '对称'],
      action: '按“已知条件—作图—检验”的顺序梳理操作',
      tips: ['每一步作图要说明依据', '完成后用条件逐条检验图形'],
    },
    {
      key: 'proof',
      name: '证明思路提示',
      tool: 'checklist',
      description: '从已知与目标倒推，寻找全等、相似或特殊图形',
      keywords: ['证明', '理由', '因为', '所以', '全等', '相似', '定理'],
      action: '从结论倒推需要哪些条件，再与已知条件建立联系',
      tips: ['先找“桥梁”：公共边、公共角、平行线', '每一步推理都要写清依据'],
    },
    {
      key: 'rubric',
      name: '量表生成助手',
      tool: 'checklist',
      description: '把几何探究成果拆成可观察的评价维度',
      keywords: ['评价', '量表', '标准', '展示', '汇报'],
      action: '把成果拆成“图形准确、推理清楚、表达完整”等可观察指标',
      tips: ['每个维度用可观察的行为描述', '评价标准要能区分不同水平'],
    },
  ],
  stats: [
    {
      key: 'questionnaire',
      name: '问卷设计助手',
      tool: 'questionnaire-builder',
      description: '围绕调查目的设计清晰、可统计的问题',
      keywords: ['问卷', '调查', '问题', '选项', '访谈'],
      action: '把调查目的转化为可统计的问题与选项',
      tips: ['一题只问一件事，避免诱导性表述', '选项要互斥且覆盖全部可能情况'],
    },
    {
      key: 'data_organize',
      name: '数据梳理与图表',
      tool: 'data-organizer',
      description: '整理数据、选择合适的统计图并读出信息',
      keywords: ['数据', '统计图', '频数', '图表', '样本', '平均数', '中位数', '众数'],
      action: '先分类整理数据，再选择能突出结论的统计图',
      tips: ['先检查数据是否完整、是否有异常值', '图表要标注标题、单位和数据来源'],
    },
    {
      key: 'sampling',
      name: '抽样方案检查',
      tool: 'checklist',
      description: '检查样本的代表性与调查方式的合理性',
      keywords: ['抽样', '样本', '随机', '调查', '总体'],
      action: '说明样本如何选取，并判断它能否代表总体',
      tips: ['尽量避免只调查方便接触到的人群', '样本量过小时结论要谨慎'],
    },
    {
      key: 'wording',
      name: '结论表述优化',
      tool: 'conclusion-builder',
      description: '用数据说话，区分“数据事实”与“推测”',
      keywords: ['结论', '建议', '概率', '估计', '预测', '推断'],
      action: '用数据支撑结论，并说明结论的适用范围',
      tips: ['写清楚数据来源与样本范围', '区分“调查结果显示”与“我推测”'],
    },
  ],
};

// 与板块无关的通用AI能力：交互式工具由前端渲染，成果评价由后端规则引擎生成
export const UNIVERSAL_SKILLS = [
  {
    key: 'ai_eval',
    name: 'AI 成果评价',
    tool: 'ai-eval',
    description: '依据本任务的评价标准与自评量表，自动分析当前成果并给出建议分、维度得分与改进点',
    keywords: [],
    action: '对照评价标准逐项检查成果',
    tips: ['评价只看证据，不替学生补写内容', '建议分供参考，最终成绩由教师确认'],
  },
  {
    key: 'ai_check',
    name: '成果自检清单',
    tool: 'checklist',
    description: '根据任务单的阶段任务与提交要求，逐条检查是否完成',
    keywords: [],
    action: '逐条核对任务要求是否完成',
    tips: ['先补未完成的阶段，再润色表达'],
  },
];

function buildTaskText(task) {
  const content = task.content || {};
  const parts = [
    task.title || '',
    task.summary || '',
    content.background || '',
    content.description || '',
    ...(content.objectives || []),
    ...(content.knowledgeTags || []),
    ...(content.steps || []).map((s) => `${s.title || ''} ${s.content || ''}`),
    ...(content.stages || []).map(
      (stage) => `${stage.title || ''} ${stage.intro || ''} ${(stage.items || []).join(' ')} ${stage.prompt || ''}`,
    ),
    ...(content.criteria || []).map((c) => `${c.name || ''} ${c.description || ''}`),
  ];
  return parts.join('\n');
}

export function recommendSkills(task) {
  const board = task.board;
  const catalog = AI_SKILL_CATALOG[board] || [];
  const text = buildTaskText(task).toLowerCase();

  const boardSkills = catalog.map((skill) => {
    const matched = (skill.keywords || []).filter((kw) => text.includes(String(kw).toLowerCase()));
    return {
      key: skill.key,
      name: skill.name,
      tool: skill.tool,
      description: skill.description,
      action: skill.action,
      tips: skill.tips,
      board,
      boardName: BOARD_NAMES[board] || board,
      universal: false,
      recommended: matched.length > 0,
      reason: matched.length > 0 ? `任务内容涉及“${matched.slice(0, 2).join('、')}”` : '通用辅助能力',
    };
  });

  const universalSkills = UNIVERSAL_SKILLS.map((skill) => ({
    ...skill,
    board,
    boardName: BOARD_NAMES[board] || board,
    universal: true,
    recommended: true,
    reason: '每份任务单都可使用',
  }));

  return [...boardSkills, ...universalSkills];
}

export function resolveSkills(task) {
  const available = recommendSkills(task);
  const chosen = Array.isArray(task.aiSkills) ? task.aiSkills : [];
  const universal = available.filter((item) => item.universal);
  if (chosen.length === 0) {
    const recommendedBoard = available.filter((item) => !item.universal && item.recommended).slice(0, 3);
    return [...recommendedBoard, ...universal];
  }
  const selectedBoard = available.filter((item) => !item.universal && chosen.includes(item.key));
  return [...selectedBoard, ...universal];
}

function stepQuestion(skill, step, index) {
  const title = step.title || `第 ${index + 1} 步`;
  return `第 ${index + 1} 步「${title}」：你打算怎样${skill.action}？完成后用什么证据说明这一步已经做好？`;
}

export function buildGuide(task, skillKey) {
  const available = recommendSkills(task);
  const skill = available.find((item) => item.key === skillKey) || available[0];
  if (!skill) {
    return {
      title: '暂无匹配的辅助能力',
      intro: '请先完善任务单内容，平台会依据板块与内容自动匹配。',
      steps: [],
      tips: [],
    };
  }

  const content = task.content || {};
  const stages = (content.stages || []).length
    ? content.stages.map((stage, index) => ({
        index: index + 1,
        title: stage.title || `阶段${index + 1}`,
        question: `${(stage.items || []).length ? `本阶段要做：${stage.items.map((item, i) => `${i + 1}) ${item}`).join(' ')} ` : ''}你准备怎样${skill.action}？${stage.prompt || ''}`,
      }))
    : (content.steps || []).map((step, index) => ({
        index: index + 1,
        title: step.title || `第 ${index + 1} 步`,
        question: stepQuestion(skill, step, index),
      }));

  const objectiveQuestions = (content.objectives || []).map(
    (item) => `对照学习目标“${item}”，你目前完成到哪一步？还缺哪些证据？`,
  );

  return {
    title: `${task.title} · ${skill.name}`,
    skillName: skill.name,
    intro: `${skill.description}。以下提示由平台根据当前任务单内容即时生成，用于启发思考，不直接给出答案。`,
    steps: stages,
    objectives: objectiveQuestions,
    tips: skill.tips,
    note: '当前为规则版引导；侧栏中的交互式工具可直接计算、整理数据，成果评价会对照本任务单的评价标准给出建议分。',
  };
}

