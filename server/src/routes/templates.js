import { db, BOARD_NAMES, isBoard, parseJson, normalizeContent, serializeTask } from '../db.js';
import { createRouter } from '../asyncRouter.js';
import { requireAuth, requireRole } from '../auth.js';

const router = createRouter();

router.use(requireAuth);

function serializeTemplate(row) {
  return {
    id: Number(row.id),
    board: row.board,
    boardName: BOARD_NAMES[row.board] || row.board,
    title: row.title,
    projectType: row.project_type || '',
    grade: row.grade || '',
    duration: row.duration || '',
    summary: row.summary || '',
    coverImage: row.cover_image || '',
    content: parseJson(row.content, normalizeContent({})),
    createdAt: row.created_at,
  };
}

router.get('/', async (req, res) => {
  const board = String(req.query.board || '').trim();
  let rows;
  if (board && isBoard(board)) {
    rows = await db.prepare('SELECT * FROM templates WHERE board = ? ORDER BY id').all(board);
  } else {
    rows = await db.prepare('SELECT * FROM templates ORDER BY id').all();
  }
  res.json({ templates: rows.map(serializeTemplate) });
});

router.get('/:id', async (req, res) => {
  const id = Number(req.params.id);
  const row = Number.isInteger(id) ? await db.prepare('SELECT * FROM templates WHERE id = ?').get(id) : null;
  if (!row) return res.status(404).json({ message: '模板不存在' });
  res.json({ template: serializeTemplate(row) });
});

router.post('/:id/copy', requireRole('teacher'), async (req, res) => {
  const id = Number(req.params.id);
  const template = Number.isInteger(id)
    ? await db.prepare('SELECT * FROM templates WHERE id = ?').get(id)
    : null;
  if (!template) return res.status(404).json({ message: '模板不存在或已被移除' });

  const title = String(req.body.title || '').trim() || `${template.title}（副本）`;
  const now = new Date().toISOString();
  const content = normalizeContent(parseJson(template.content, {}));

  const inserted = await db
    .prepare(
      `INSERT INTO tasks (teacher_id, template_id, board, title, project_type, grade, duration, summary, cover_image, content, ai_enabled, ai_skills, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, '[]', ?, ?) RETURNING id`,
    )
    .get(
      req.user.id,
      Number(template.id),
      template.board,
      title,
      template.project_type || '',
      template.grade || '',
      template.duration || '',
      template.summary || '',
      template.cover_image || '',
      JSON.stringify(content),
      now,
      now,
    );

  const task = await db.prepare('SELECT * FROM tasks WHERE id = ?').get(inserted.id);
  res.status(201).json({
    task: serializeTask(task),
    message: '已复制为你的独立任务单，原始官方模板保持不变',
  });
});

export { router as templatesRouter, serializeTemplate };
