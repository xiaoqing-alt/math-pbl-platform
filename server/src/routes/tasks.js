import express from 'express';
import {
  db,
  isBoard,
  normalizeContent,
  parseJson,
  serializeTask,
} from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { recommendSkills } from '../aiSkills.js';
import { serializeTools } from './tools.js';

const router = express.Router();

router.use(requireAuth, requireRole('teacher'));

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function emptyContent() {
  return {
    objectives: ['能围绕真实情境提出问题，并制定可执行的探究计划'],
    description: '请在此填写任务情境、驱动问题与对学生的具体要求。',
    steps: [
      { title: '任务导入', content: '明确项目要解决的问题与最终成果形式。' },
      { title: '探究实践', content: '分组收集信息、动手实践并记录过程。' },
      { title: '成果展示', content: '整理成果并面向全班展示交流。' },
    ],
    criteria: [
      { name: '任务完成度', weight: 30, description: '是否完整完成各项任务要求' },
      { name: '数学表达', weight: 30, description: '数学语言、计算与推理是否准确' },
      { name: '成果质量', weight: 25, description: '成果是否完整、清晰、有说服力' },
      { name: '反思改进', weight: 15, description: '是否能反思不足并提出改进' },
    ],
    references: [],
  };
}

function getOwnedTask(taskId, teacherId) {
  return db.prepare('SELECT * FROM tasks WHERE id = ? AND teacher_id = ?').get(taskId, teacherId);
}

function serializeAssignment(row) {
  return {
    id: Number(row.id),
    taskId: Number(row.task_id),
    classId: Number(row.class_id),
    status: row.status,
    dueAt: row.due_at || '',
    publishedAt: row.published_at,
    withdrawnAt: row.withdrawn_at || '',
    className: row.class_name || '',
    taskTitle: row.task_title || '',
    board: row.board || '',
    studentCount: Number(row.student_count || 0),
    submittedCount: Number(row.submitted_count || 0),
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*,
        (SELECT COUNT(*) FROM assignments a WHERE a.task_id = t.id AND a.status = 'published') AS assignment_count,
        (SELECT COUNT(*) FROM submissions s JOIN assignments a ON a.id = s.assignment_id
           WHERE a.task_id = t.id AND s.status = 'submitted') AS submission_count
       FROM tasks t WHERE t.teacher_id = ? ORDER BY t.updated_at DESC`,
    )
    .all(req.user.id);

  res.json({
    tasks: rows.map((row) => ({
      ...serializeTask(row),
      assignmentCount: Number(row.assignment_count || 0),
      submissionCount: Number(row.submission_count || 0),
    })),
  });
});

router.post('/', (req, res) => {
  const title = String(req.body.title || '').trim() || '未命名任务单';
  const board = String(req.body.board || '');
  if (!isBoard(board)) return res.status(400).json({ message: '请选择有效的数学板块' });

  const now = new Date().toISOString();
  const content = normalizeContent(emptyContent());
  const result = db
    .prepare(
      `INSERT INTO tasks (teacher_id, template_id, board, title, project_type, grade, duration, summary, cover_image, content, ai_enabled, ai_skills, created_at, updated_at)
       VALUES (?, NULL, ?, ?, '', '', '', '', '', ?, 0, '[]', ?, ?)`,
    )
    .run(req.user.id, board, title, JSON.stringify(content), now, now);

  const task = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ task: serializeTask(task) });
});

router.get('/:id', (req, res) => {
  const taskId = parseId(req.params.id);
  if (!taskId) return res.status(400).json({ message: '任务单编号无效' });
  const row = getOwnedTask(taskId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务单不存在或无权访问' });

  const task = serializeTask(row);
  const assignmentRows = db
    .prepare(
      `SELECT a.*, c.name AS class_name, t.title AS task_title, t.board AS board,
        (SELECT COUNT(*) FROM class_members m WHERE m.class_id = a.class_id) AS student_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status = 'submitted') AS submitted_count
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       JOIN tasks t ON t.id = a.task_id
       WHERE a.task_id = ? ORDER BY a.published_at DESC`,
    )
    .all(taskId);

  res.json({
    task,
    assignments: assignmentRows.map(serializeAssignment),
    availableSkills: recommendSkills(task),
    taskTools: serializeTools(task.content.toolKeys),
  });
});

router.patch('/:id', (req, res) => {
  const taskId = parseId(req.params.id);
  if (!taskId) return res.status(400).json({ message: '任务单编号无效' });
  const row = getOwnedTask(taskId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务单不存在或无权访问' });

  const title = req.body.title === undefined ? row.title : String(req.body.title || '').trim();
  if (!title) return res.status(400).json({ message: '任务单标题不能为空' });

  const board = req.body.board === undefined ? row.board : String(req.body.board || '').trim();
  if (!isBoard(board)) return res.status(400).json({ message: '请选择有效的数学板块' });

  const content =
    req.body.content === undefined
      ? parseJson(row.content, normalizeContent({}))
      : normalizeContent(req.body.content);

  const projectType = req.body.projectType === undefined ? row.project_type : String(req.body.projectType || '').trim();
  const grade = req.body.grade === undefined ? row.grade : String(req.body.grade || '').trim();
  const duration = req.body.duration === undefined ? row.duration : String(req.body.duration || '').trim();
  const summary = req.body.summary === undefined ? row.summary : String(req.body.summary || '');
  const coverImage = req.body.coverImage === undefined ? row.cover_image : String(req.body.coverImage || '');

  db.prepare(
    `UPDATE tasks SET title = ?, board = ?, project_type = ?, grade = ?, duration = ?, summary = ?, cover_image = ?, content = ?, updated_at = ?
     WHERE id = ?`,
  ).run(
    title,
    board,
    projectType,
    grade,
    duration,
    summary,
    coverImage,
    JSON.stringify(content),
    new Date().toISOString(),
    taskId,
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  const task = serializeTask(updated);
  res.json({ task, availableSkills: recommendSkills(task) });
});

router.delete('/:id', (req, res) => {
  const taskId = parseId(req.params.id);
  if (!taskId) return res.status(400).json({ message: '任务单编号无效' });
  const row = getOwnedTask(taskId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务单不存在或无权访问' });

  const submissionCount = db
    .prepare(
      `SELECT COUNT(*) AS count FROM submissions s JOIN assignments a ON a.id = s.assignment_id WHERE a.task_id = ?`,
    )
    .get(taskId).count;
  if (Number(submissionCount) > 0) {
    return res.status(409).json({ message: '已有学生提交成果，不能删除该任务单' });
  }

  db.prepare('DELETE FROM assignments WHERE task_id = ?').run(taskId);
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
  res.json({ ok: true });
});

router.patch('/:id/ai', (req, res) => {
  const taskId = parseId(req.params.id);
  if (!taskId) return res.status(400).json({ message: '任务单编号无效' });
  const row = getOwnedTask(taskId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务单不存在或无权访问' });

  const task = serializeTask(row);
  const available = recommendSkills(task);
  const allowedKeys = new Set(available.map((item) => item.key));

  const aiEnabled = Boolean(req.body.aiEnabled);
  const rawSkills = Array.isArray(req.body.aiSkills) ? req.body.aiSkills : task.aiSkills;
  const aiSkills = rawSkills
    .map((key) => String(key || '').trim())
    .filter((key) => allowedKeys.has(key));

  db.prepare('UPDATE tasks SET ai_enabled = ?, ai_skills = ?, updated_at = ? WHERE id = ?').run(
    aiEnabled ? 1 : 0,
    JSON.stringify(aiSkills),
    new Date().toISOString(),
    taskId,
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  const next = serializeTask(updated);
  res.json({ task: next, availableSkills: recommendSkills(next) });
});

router.get('/:id/ai/skills', (req, res) => {
  const taskId = parseId(req.params.id);
  if (!taskId) return res.status(400).json({ message: '任务单编号无效' });
  const row = getOwnedTask(taskId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务单不存在或无权访问' });
  const task = serializeTask(row);
  res.json({ availableSkills: recommendSkills(task), aiEnabled: task.aiEnabled, aiSkills: task.aiSkills });
});

router.post('/:id/publish', (req, res) => {
  const taskId = parseId(req.params.id);
  const classId = parseId(req.body.classId);
  if (!taskId || !classId) return res.status(400).json({ message: '任务单或班级编号无效' });

  const taskRow = getOwnedTask(taskId, req.user.id);
  if (!taskRow) return res.status(404).json({ message: '任务单不存在或无权访问' });
  const classRow = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!classRow) return res.status(404).json({ message: '班级不存在或无权访问' });

  const dueAt = String(req.body.dueAt || '').trim();
  const now = new Date().toISOString();
  const existing = db
    .prepare('SELECT * FROM assignments WHERE task_id = ? AND class_id = ?')
    .get(taskId, classId);

  let assignmentId;
  if (existing) {
    db.prepare(
      `UPDATE assignments SET status = 'published', due_at = ?, published_at = ?, withdrawn_at = '' WHERE id = ?`,
    ).run(dueAt, now, existing.id);
    assignmentId = Number(existing.id);
  } else {
    const result = db
      .prepare(
        `INSERT INTO assignments (task_id, class_id, teacher_id, status, due_at, published_at, withdrawn_at)
         VALUES (?, ?, ?, 'published', ?, ?, '')`,
      )
      .run(taskId, classId, req.user.id, dueAt, now);
    assignmentId = Number(result.lastInsertRowid);
  }

  const assignment = db.prepare('SELECT * FROM assignments WHERE id = ?').get(assignmentId);
  res.status(201).json({
    assignment: serializeAssignment({ ...assignment, class_name: classRow.name, task_title: taskRow.title, board: taskRow.board }),
    message: `已发布到「${classRow.name}」`,
  });
});

export { router as tasksRouter, serializeAssignment };
