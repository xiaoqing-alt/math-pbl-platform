import express from 'express';
import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { db, parseJson, UPLOAD_DIR } from '../db.js';
import { requireAuth, requireRole, verifyToken } from '../auth.js';

const router = express.Router();
const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const builtinDir = path.join(serverRoot, 'tools');
const uploadDir = path.join(UPLOAD_DIR, 'tools');
fs.mkdirSync(uploadDir, { recursive: true });

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

function serialize(row) {
  return {
    key: row.tool_key,
    name: row.name,
    description: row.description,
    boards: parseJson(row.boards, []),
    builtin: Boolean(row.builtin),
    category: row.category === 'inquiry' ? 'inquiry' : 'assist',
    ownerId: row.owner_id ? Number(row.owner_id) : null,
    createdAt: row.created_at,
  };
}

function filePathOf(row) {
  return row.builtin ? path.join(builtinDir, row.file_name) : path.join(uploadDir, row.file_name);
}

export function serializeTools(keys) {
  if (!Array.isArray(keys) || keys.length === 0) return [];
  const placeholders = keys.map(() => '?').join(',');
  return db
    .prepare(`SELECT * FROM tools WHERE tool_key IN (${placeholders})`)
    .all(...keys)
    .map(serialize);
}

// 教师可选工具：内置 + 自己上传
router.get('/', requireAuth, (req, res) => {
  const rows = db
    .prepare('SELECT * FROM tools WHERE builtin = 1 OR owner_id = ? ORDER BY builtin DESC, id ASC')
    .all(req.user.id);
  res.json({ tools: rows.map(serialize) });
});

// 教师上传自己的 HTML 工具
router.post('/', requireAuth, requireRole('teacher'), upload.single('file'), (req, res) => {
  const name = String(req.body.name || '').trim();
  const description = String(req.body.description || '').trim();
  const boards = String(req.body.boards || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const category = req.body.category === 'inquiry' ? 'inquiry' : 'assist';
  if (!name) return res.status(400).json({ message: '请填写工具名称' });
  if (!req.file) return res.status(400).json({ message: '请选择 HTML 文件' });
  if (!/\.html?$/i.test(req.file.originalname || '')) {
    return res.status(400).json({ message: '仅支持 .html 或 .htm 文件' });
  }
  const text = req.file.buffer.toString('utf8');
  if (!/<html|<!doctype/i.test(text)) {
    return res.status(400).json({ message: '文件内容不是有效的 HTML' });
  }

  const fileName = `${randomUUID()}.html`;
  fs.writeFileSync(path.join(uploadDir, fileName), req.file.buffer);
  const toolKey = `u_${randomUUID().slice(0, 8)}`;
  db.prepare(
    `INSERT INTO tools (tool_key, owner_id, name, description, boards, file_name, builtin, category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)`,
  ).run(
    toolKey,
    req.user.id,
    name,
    description,
    JSON.stringify(boards),
    fileName,
    category,
    new Date().toISOString(),
  );

  const row = db.prepare('SELECT * FROM tools WHERE tool_key = ?').get(toolKey);
  res.status(201).json({ tool: serialize(row) });
});

// 删除自己上传的工具（内置不可删）
router.delete('/:key', requireAuth, requireRole('teacher'), (req, res) => {
  const row = db.prepare('SELECT * FROM tools WHERE tool_key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ message: '工具不存在' });
  if (row.builtin) return res.status(403).json({ message: '内置工具不可删除' });
  if (Number(row.owner_id) !== req.user.id) return res.status(404).json({ message: '工具不存在' });

  try {
    fs.unlinkSync(filePathOf(row));
  } catch {
    // 文件已不存在时忽略
  }
  db.prepare('DELETE FROM tools WHERE id = ?').run(row.id);
  res.json({ ok: true });
});

// iframe 加载工具文件：使用查询参数 token 鉴权，文件以沙箱 CSP 返回
router.get('/:key/file', (req, res) => {
  let user = null;
  try {
    user = verifyToken(String(req.query.token || ''));
  } catch {
    return res.status(401).json({ message: '登录状态已失效，请重新登录' });
  }
  if (!user) return res.status(401).json({ message: '请先登录' });

  const row = db.prepare('SELECT * FROM tools WHERE tool_key = ?').get(req.params.key);
  if (!row) return res.status(404).json({ message: '工具不存在' });
  if (!row.builtin && Number(row.owner_id) !== Number(user.uid)) {
    return res.status(403).json({ message: '无权使用该工具' });
  }
  const filePath = filePathOf(row);
  if (!fs.existsSync(filePath)) return res.status(404).json({ message: '工具文件缺失' });

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  // 即使被直接打开也强制进入沙箱，无法访问平台站点存储与 Cookie
  res.setHeader('Content-Security-Policy', "sandbox allow-scripts allow-forms allow-popups");
  res.sendFile(filePath);
});

export default router;
