import express from 'express';
import {
  db,
  serializeSubmission,
  serializeTask,
  BOARD_NAMES,
  normalizeWorksheet,
} from '../db.js';
import { requireAuth, requireRole } from '../auth.js';
import { buildGuide, resolveSkills } from '../aiSkills.js';
import { analyzeSubmission, worksheetToText } from '../analysis.js';
import { serializeTools } from './tools.js';

const router = express.Router();

router.use(requireAuth, requireRole('student'));

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function listVersionSummaries(submissionId) {
  return db
    .prepare(
      'SELECT id, version_no, content, files, created_at FROM submission_versions WHERE submission_id = ? ORDER BY version_no DESC',
    )
    .all(submissionId)
    .map((row) => ({
      id: Number(row.id),
      versionNo: Number(row.version_no),
      createdAt: row.created_at,
      wordCount: Array.from(String(row.content || '').replace(/\s/g, '')).length,
      fileCount: JSON.parse(row.files || '[]').length,
    }));
}

function getStudentAssignment(assignmentId, studentId) {
  return db
    .prepare(
      `SELECT a.*, c.name AS class_name, t.title AS task_title, t.board AS board,
        u.display_name AS teacher_name
       FROM assignments a
       JOIN classes c ON c.id = a.class_id
       JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
       JOIN tasks t ON t.id = a.task_id
       JOIN users u ON u.id = t.teacher_id
       WHERE a.id = ?`,
    )
    .get(studentId, assignmentId);
}

router.get('/summary', (req, res) => {
  const classRows = db
    .prepare(
      `SELECT c.id, c.name, c.grade, u.display_name AS teacher_name
       FROM class_members m
       JOIN classes c ON c.id = m.class_id
       JOIN users u ON u.id = c.teacher_id
       WHERE m.student_id = ? ORDER BY c.id`,
    )
    .all(req.user.id)
    .map((item) => ({
      id: Number(item.id),
      name: item.name,
      grade: item.grade || '',
      teacherName: item.teacher_name,
    }));

  const assignmentRows = db
    .prepare(
      `SELECT a.id, a.status, s.status AS submission_status, s.graded_at
       FROM assignments a
       JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
       WHERE a.status = 'published'`,
    )
    .all(req.user.id, req.user.id);

  const pending = assignmentRows.filter(
    (item) => !item.submission_status || item.submission_status === 'draft' || item.submission_status === 'returned',
  ).length;
  const submitted = assignmentRows.filter((item) => item.submission_status === 'submitted').length;
  const graded = assignmentRows.filter((item) => item.graded_at).length;

  res.json({
    classes: classRows,
    stats: {
      published: assignmentRows.length,
      pending,
      submitted,
      graded,
    },
  });
});

router.get('/tasks', (req, res) => {
  const rows = db
    .prepare(
      `SELECT a.id AS assignment_id, a.due_at, a.published_at, a.status AS assignment_status,
        t.id AS task_id, t.title, t.board, t.summary, t.project_type, t.grade, t.duration, t.cover_image,
        t.ai_enabled, t.ai_skills, t.content,
        c.name AS class_name, u.display_name AS teacher_name,
        s.id AS submission_id, s.status AS submission_status, s.score, s.graded_at, s.submitted_at
       FROM assignments a
       JOIN class_members m ON m.class_id = a.class_id AND m.student_id = ?
       JOIN classes c ON c.id = a.class_id
       JOIN tasks t ON t.id = a.task_id
       JOIN users u ON u.id = t.teacher_id
       LEFT JOIN submissions s ON s.assignment_id = a.id AND s.student_id = ?
       WHERE a.status = 'published'
       ORDER BY a.published_at DESC`,
    )
    .all(req.user.id, req.user.id);

  res.json({
    tasks: rows.map((row) => ({
      assignmentId: Number(row.assignment_id),
      taskId: Number(row.task_id),
      title: row.title,
      board: row.board,
      boardName: BOARD_NAMES[row.board] || row.board,
      summary: row.summary || '',
      projectType: row.project_type || '',
      grade: row.grade || '',
      duration: row.duration || '',
      coverImage: row.cover_image || '',
      className: row.class_name,
      teacherName: row.teacher_name,
      dueAt: row.due_at || '',
      publishedAt: row.published_at,
      aiEnabled: Boolean(row.ai_enabled),
      submission: row.submission_id
        ? {
            id: Number(row.submission_id),
            status: row.submission_status,
            score: row.score === null || row.score === undefined ? null : Number(row.score),
            gradedAt: row.graded_at || '',
            submittedAt: row.submitted_at || '',
          }
        : null,
    })),
  });
});

router.get('/assignments/:id', (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });

  const row = getStudentAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务不存在或未发布给你的班级' });
  if (row.status !== 'published') {
    return res.status(403).json({ message: '该任务已被教师撤回，暂时无法查看' });
  }

  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.task_id);
  const task = serializeTask(taskRow);

  const submissionRow = db
    .prepare(
      `SELECT s.*, u.display_name AS student_name, u.username AS username
       FROM submissions s JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = ? AND s.student_id = ?`,
    )
    .get(assignmentId, req.user.id);

  const submission = submissionRow ? serializeSubmission(submissionRow) : null;

  const enabledSkills = task.aiEnabled ? resolveSkills(task) : [];

  res.json({
    assignment: {
      id: Number(row.id),
      classId: Number(row.class_id),
      className: row.class_name,
      status: row.status,
      dueAt: row.due_at || '',
      publishedAt: row.published_at,
    },
    task,
    teacherName: row.teacher_name,
    submission,
    versions: submissionRow ? listVersionSummaries(submissionRow.id) : [],
    ai: {
      enabled: task.aiEnabled,
      skills: enabledSkills,
      tools: task.aiEnabled ? serializeTools(task.content.toolKeys) : [],
    },
  });
});

router.put('/assignments/:id/submission', (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });

  const row = getStudentAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务不存在或未发布给你的班级' });
  if (row.status !== 'published') {
    return res.status(403).json({ message: '该任务已被撤回，无法提交' });
  }

  const existing = db
    .prepare('SELECT * FROM submissions WHERE assignment_id = ? AND student_id = ?')
    .get(assignmentId, req.user.id);
  if (existing && existing.graded_at) {
    return res.status(409).json({ message: '教师已完成批阅，不能再修改提交内容' });
  }

  const content = String(req.body.content || '');
  if (content.length > 30000) {
    return res.status(400).json({ message: '成果文字过长，请压缩到 30000 字以内' });
  }

  const rawFiles = Array.isArray(req.body.files) ? req.body.files : [];
  const files = rawFiles
    .slice(0, 8)
    .map((file) => ({
      name: String((file && file.name) || '附件'),
      url: String((file && file.url) || ''),
      size: Number((file && file.size) || 0),
    }))
    .filter((file) => file.url.startsWith('/uploads/'));

  const worksheet = normalizeWorksheet(req.body.worksheet);
  const worksheetText = worksheetToText(worksheet);

  const submit = Boolean(req.body.submit);
  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.task_id);
  const task = serializeTask(taskRow);

  const now = new Date().toISOString();
  let analysis = null;
  if (content.trim() || files.length > 0 || worksheetText.trim()) {
    analysis = analyzeSubmission({
      content,
      worksheet,
      files,
      criteria: (task.content && task.content.criteria) || [],
    });
  }

  const status = submit ? 'submitted' : existing ? existing.status : 'draft';
  const submittedAt = submit ? now : existing ? existing.submitted_at || '' : '';
  const filesJson = JSON.stringify(files);
  const worksheetJson = JSON.stringify(worksheet);
  const analysisJson = analysis ? JSON.stringify(analysis) : '';

  let submissionId = existing ? Number(existing.id) : 0;
  if (existing) {
    db.prepare(
      `UPDATE submissions SET content = ?, worksheet = ?, files = ?, status = ?, analysis = ?, submitted_at = ?, updated_at = ?
       WHERE id = ?`,
    ).run(content, worksheetJson, filesJson, status, analysisJson, submittedAt, now, existing.id);
  } else {
    const inserted = db.prepare(
      `INSERT INTO submissions (assignment_id, student_id, content, worksheet, files, status, analysis, submitted_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(assignmentId, req.user.id, content, worksheetJson, filesJson, status, analysisJson, submittedAt, now);
    submissionId = Number(inserted.lastInsertRowid);
  }

  // 每次正式提交都留存一个版本，便于教师追溯修改过程
  if (submit) {
    const latest = db
      .prepare('SELECT MAX(version_no) AS version_no FROM submission_versions WHERE submission_id = ?')
      .get(submissionId);
    const nextVersion = Number((latest && latest.version_no) || 0) + 1;
    db.prepare(
      `INSERT INTO submission_versions (submission_id, version_no, content, worksheet, files, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(submissionId, nextVersion, content, worksheetJson, filesJson, now);
  }

  const saved = db
    .prepare(
      `SELECT s.*, u.display_name AS student_name, u.username AS username
       FROM submissions s JOIN users u ON u.id = s.student_id
       WHERE s.assignment_id = ? AND s.student_id = ?`,
    )
    .get(assignmentId, req.user.id);

  const resubmitted = submit && existing && existing.status === 'returned';
  res.json({
    submission: serializeSubmission(saved),
    versions: listVersionSummaries(submissionId),
    message: submit
      ? resubmitted
        ? '已按教师建议重新提交，教师端可以查看新版本'
        : '成果已提交，教师端可以查看并批阅'
      : '草稿已保存',
  });
});

router.post('/assignments/:id/ai/guide', (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });

  const row = getStudentAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务不存在或未发布给你的班级' });
  if (row.status !== 'published') {
    return res.status(403).json({ message: '该任务已被撤回，无法使用AI辅助' });
  }

  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.task_id);
  const task = serializeTask(taskRow);
  if (!task.aiEnabled) {
    return res.status(403).json({ message: '教师未开启这份任务单的AI辅助功能' });
  }

  const skills = resolveSkills(task);
  const requestedKey = String(req.body.skillKey || '').trim();
  const allowed = skills.some((skill) => skill.key === requestedKey);

  const guide = buildGuide(task, allowed ? requestedKey : skills[0] ? skills[0].key : '');
  res.json({ guide });
});

// AI 成果评价：对当前草稿做规则版评分与自检，未提交前即可反复使用
router.post('/assignments/:id/ai/evaluate', (req, res) => {
  const assignmentId = parseId(req.params.id);
  if (!assignmentId) return res.status(400).json({ message: '任务编号无效' });

  const row = getStudentAssignment(assignmentId, req.user.id);
  if (!row) return res.status(404).json({ message: '任务不存在或未发布给你的班级' });
  if (row.status !== 'published') {
    return res.status(403).json({ message: '该任务已被教师撤回，无法使用AI辅助' });
  }

  const taskRow = db.prepare('SELECT * FROM tasks WHERE id = ?').get(row.task_id);
  const task = serializeTask(taskRow);
  if (!task.aiEnabled) {
    return res.status(403).json({ message: '教师未开启这份任务单的AI辅助功能' });
  }

  const content = String(req.body.content || '').slice(0, 30000);
  const worksheet = normalizeWorksheet(req.body.worksheet);
  const files = Array.isArray(req.body.files) ? req.body.files : [];

  const evaluation = analyzeSubmission({
    content,
    worksheet,
    files,
    criteria: (task.content && task.content.criteria) || [],
  });

  const checklist = [];
  (task.content.stages || []).forEach((stage, index) => {
    const answer = (worksheet.stages || [])[index] || { text: '', rows: [] };
    const done =
      String(answer.text || '').trim().length > 0 ||
      (answer.rows || []).some((cells) => (cells || []).some((cell) => String(cell || '').trim()));
    checklist.push({ label: `阶段${index + 1}：${stage.title || '阶段任务'}`, done });
  });
  checklist.push({
    label: '完成自我评价量表',
    done: (worksheet.selfScores || []).some((score) => Boolean(score)),
  });
  checklist.push({
    label: '填写总结与反思',
    done: Boolean(String(worksheet.gains || '').trim() || String(worksheet.difficulties || '').trim()),
  });
  checklist.push({ label: '上传成果附件（如图片、文档）', done: files.length > 0 });

  res.json({ evaluation, checklist });
});

export { router as studentRouter };
