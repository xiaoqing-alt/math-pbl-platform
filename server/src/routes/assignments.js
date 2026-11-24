import { db, parseJson, serializeSubmission, serializeTask, normalizeContent } from '../db.js';
import { createRouter } from '../asyncRouter.js';
import { requireAuth, requireRole } from '../auth.js';
import { buildClassReport } from '../analysis.js';

const router = createRouter();

router.use(requireAuth, requireRole('teacher'));

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

async function listVersionSummaries(submissionId) {
  const rows = await db
    .prepare(
      'SELECT id, version_no, content, files, created_at FROM submission_versions WHERE submission_id = ? ORDER BY version_no DESC',
    )
    .all(submissionId);
  return rows.map((row) => ({
    id: Number(row.id),
    versionNo: Number(row.version_no),
    createdAt: row.created_at,
    wordCount: Array.from(String(row.content || '').replace(/\s/g, '')).length,
    fileCount: parseJson(row.files, []).length,
  }));
}

function normalizeCriteriaScores(raw, criteria) {
  if (!Array.isArray(raw)) return [];
  const allowed = new Map((criteria || []).map((item) => [item.name, item]));
  const result = [];
  for (const item of raw) {
    const name = String((item && item.name) || '').trim();
    if (!name) continue;
    if (allowed.size > 0 && !allowed.has(name)) continue;
    const value = Number(item && item.score);
    if (!Number.isFinite(value)) continue;
    result.push({
      name,
      score: Math.max(0, Math.min(100, Math.round(value * 10) / 10)),
      comment: String((item && item.comment) || '').trim(),
      weight: Number((allowed.get(name) || {}).weight) || 0,
    });
  }
  return result;
}

function weightedScore(criteria, scores) {
  if (!Array.isArray(criteria) || criteria.length === 0) return null;
  const map = new Map(scores.map((item) => [item.name, item.score]));
  if (criteria.some((item) => !map.has(item.name))) return null;
  const totalWeight = criteria.reduce((sum, item) => sum + (Number(item.weight) || 1), 0);
  const sum = criteria.reduce((acc, item) => acc + map.get(item.name) * (Number(item.weight) || 1), 0);
  return Math.round((sum / totalWeight) * 10) / 10;
}

async function getOwnedAssignment(assignmentId, teacherId) {
  return db
    .prepare(
      `SELECT a.*, c.name AS class_name, t.title AS task_title, t.board AS board
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       JOIN tasks t ON t.id = a.task_id
       WHERE a.id = ? AND a.teacher_id = ?`,
    )
    .get(assignmentId, teacherId);
}

router.get('/:id', async (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });
  const row = await getOwnedAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '发布任务不存在或无权访问' });

  const taskRow = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.task_id);
  const members = await db
    .prepare(
      `SELECT u.id, u.username, u.display_name
       FROM class_members m JOIN users u ON u.id = m.student_id
       WHERE m.class_id = ? ORDER BY u.id`,
    )
    .all(row.class_id);

  const submissionRows = await db
    .prepare(
      `SELECT s.*, u.display_name AS student_name, u.username AS username
       FROM submissions s JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = ?`,
    )
    .all(assignmentId);

  const submissionMap = new Map(submissionRows.map((item) => [Number(item.student_id), item]));

  const students = members.map((member) => {
    const submission = submissionMap.get(Number(member.id));
    const analysis = submission ? parseJson(submission.analysis, null) : null;
    return {
      id: Number(member.id),
      username: member.username,
      displayName: member.display_name,
      submission: submission
        ? {
            id: Number(submission.id),
            status: submission.status,
            submittedAt: submission.submitted_at || '',
            updatedAt: submission.updated_at,
            score: submission.score === null || submission.score === undefined ? null : Number(submission.score),
            gradedAt: submission.graded_at || '',
            returned: submission.status === 'returned',
            hasFeedback: Boolean(submission.feedback),
            wordCount: analysis ? analysis.wordCount : 0,
            fileCount: analysis ? analysis.fileCount : 0,
            suggestedScore: analysis ? analysis.suggestedScore : null,
          }
        : null,
    };
  });

  res.json({
    assignment: {
      id: Number(row.id),
      taskId: Number(row.task_id),
      classId: Number(row.class_id),
      className: row.class_name,
      taskTitle: row.task_title,
      board: row.board,
      status: row.status,
      dueAt: row.due_at || '',
      publishedAt: row.published_at,
      withdrawnAt: row.withdrawn_at || '',
    },
    task: serializeTask(taskRow),
    students,
  });
});

router.post('/:id/withdraw', async (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });
  const row = await getOwnedAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '发布任务不存在或无权访问' });

  await db.prepare(`UPDATE assignments SET status = 'withdrawn', withdrawn_at = ? WHERE id = ?`).run(
    new Date().toISOString(),
    assignmentId,
  );
  res.json({ ok: true, message: '已撤回该班级的发布任务' });
});

router.get('/:id/report', async (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });
  const row = await getOwnedAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '发布任务不存在或无权访问' });

  const taskRow = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.task_id);
  const task = serializeTask(taskRow);

  const members = (
    await db
      .prepare(
        `SELECT u.id, u.username, u.display_name
         FROM class_members m JOIN users u ON u.id = m.student_id
         WHERE m.class_id = ? ORDER BY u.id`,
      )
      .all(row.class_id)
  ).map((item) => ({
    id: Number(item.id),
    username: item.username,
    displayName: item.display_name,
  }));

  const submissionRows = (
    await db
      .prepare(
        `SELECT s.*, u.display_name AS student_name, u.username AS username
         FROM submissions s JOIN users u ON u.id = s.student_id
         WHERE s.assignment_id = ?`,
      )
      .all(assignmentId)
  ).map(serializeSubmission);

  const report = buildClassReport({
    students: members,
    submissions: submissionRows,
    criteria: (task.content && task.content.criteria) || [],
  });

  res.json({
    assignment: {
      id: Number(row.id),
      className: row.class_name,
      taskTitle: row.task_title,
      board: row.board,
      status: row.status,
      dueAt: row.due_at || '',
    },
    report,
  });
});

const submissionRouter = createRouter();
submissionRouter.use(requireAuth, requireRole('teacher'));

submissionRouter.get('/:id', async (req, res) => {
  const submissionId = parseId(req.params.id);
  if (!submissionId) return res.status(400).json({ message: '提交记录编号无效' });

  const row = await db
    .prepare(
      `SELECT s.*, u.display_name AS student_name, u.username AS username,
        a.task_id, a.class_id, a.status AS assignment_status,
        t.title AS task_title, t.board AS board, t.content AS task_content
       FROM submissions s
       JOIN users u ON u.id = s.student_id
       JOIN assignments a ON a.id = s.assignment_id
       JOIN tasks t ON t.id = a.task_id
       WHERE s.id = ? AND a.teacher_id = ?`,
    )
    .get(submissionId, req.user.id);

  if (!row) return res.status(404).json({ message: '提交记录不存在或无权访问' });

  const submission = serializeSubmission(row);
  res.json({
    submission,
    student: {
      id: Number(row.student_id),
      username: row.username,
      displayName: row.student_name,
    },
    task: {
      id: Number(row.task_id),
      title: row.task_title,
      board: row.board,
      content: parseJson(row.task_content, {}),
    },
    versions: await listVersionSummaries(submissionId),
    assignmentStatus: row.assignment_status,
  });
});

submissionRouter.patch('/:id', async (req, res) => {
  const submissionId = parseId(req.params.id);
  if (!submissionId) return res.status(400).json({ message: '提交记录编号无效' });

  const row = await db
    .prepare(
      `SELECT s.*, a.teacher_id, a.task_id FROM submissions s JOIN assignments a ON a.id = s.assignment_id
       WHERE s.id = ? AND a.teacher_id = ?`,
    )
    .get(submissionId, req.user.id);
  if (!row) return res.status(404).json({ message: '提交记录不存在或无权访问' });
  if (row.status !== 'submitted') {
    return res.status(409).json({ message: '学生尚未正式提交，暂不能批阅' });
  }

  const body = req.body || {};
  const taskRow = await db.prepare('SELECT content FROM tasks WHERE id = ?').get(row.task_id);
  const taskContent = normalizeContent(parseJson(taskRow && taskRow.content, {}));
  const criteria = taskContent.criteria || [];
  const now = new Date().toISOString();
  const feedback = body.feedback === undefined ? row.feedback : String(body.feedback || '');

  if (body.action === 'return') {
    if (!String(feedback).trim()) {
      return res.status(400).json({ message: '退回修改需要填写具体原因或修改建议' });
    }
    await db.prepare(
      `UPDATE submissions SET status = 'returned', return_note = ?, returned_at = ?,
        score = NULL, criteria_scores = '[]', graded_at = '' WHERE id = ?`,
    ).run(String(feedback).trim(), now, submissionId);

    const updated = await db
      .prepare(
        'SELECT s.*, u.display_name AS student_name, u.username AS username FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.id = ?',
      )
      .get(submissionId);
    return res.json({ submission: serializeSubmission(updated), message: '已退回给学生修改，学生可重新提交' });
  }

  const criteriaScores = normalizeCriteriaScores(body.criteriaScores, criteria);
  let score = row.score;
  if (body.score !== undefined && body.score !== null && body.score !== '') {
    const value = Number(body.score);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return res.status(400).json({ message: '分数需在 0—100 之间' });
    }
    score = value;
  } else if (criteriaScores.length > 0) {
    const computed = weightedScore(criteria, criteriaScores);
    if (computed === null) {
      return res.status(400).json({ message: '请完成全部评价维度的打分，或直接填写总分' });
    }
    score = computed;
  } else if (body.score === null || body.score === '') {
    score = null;
  }

  await db.prepare(
    `UPDATE submissions SET score = ?, feedback = ?, criteria_scores = ?, graded_at = ?,
      status = 'submitted', returned_at = '' WHERE id = ?`,
  ).run(score, feedback, JSON.stringify(criteriaScores), now, submissionId);

  const updated = await db
    .prepare('SELECT s.*, u.display_name AS student_name, u.username AS username FROM submissions s JOIN users u ON u.id = s.student_id WHERE s.id = ?')
    .get(submissionId);

  res.json({ submission: serializeSubmission(updated), message: '批阅结果已保存，学生端可查看' });
});

export { router as assignmentsRouter, submissionRouter };
