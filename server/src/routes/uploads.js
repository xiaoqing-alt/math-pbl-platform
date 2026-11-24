import multer from 'multer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, UPLOAD_DIR } from '../db.js';
import { createRouter } from '../asyncRouter.js';
import { requireAuth } from '../auth.js';

const router = createRouter();

const ALLOWED_EXT = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.bmp',
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.txt',
  '.csv',
  '.zip',
]);

// 每个账号允许占用的附件总空间
const USER_QUOTA = 100 * 1024 * 1024;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    cb(null, `${crypto.randomUUID()}${ALLOWED_EXT.has(ext) ? ext : ''}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
});

function decodeFileName(name) {
  const raw = String(name || '附件');
  try {
    const decoded = Buffer.from(raw, 'latin1').toString('utf8');
    if (decoded.includes('\uFFFD')) return raw;
    return decoded;
  } catch {
    return raw;
  }
}

/** 通过文件头字节判断真实类型，防止改扩展名绕过白名单 */
function sniff(buf) {
  const startsWith = (bytes, offset = 0) => bytes.every((byte, index) => buf[offset + index] === byte);
  if (startsWith([0x89, 0x50, 0x4e, 0x47])) return 'png';
  if (startsWith([0xff, 0xd8, 0xff])) return 'jpg';
  if (startsWith([0x47, 0x49, 0x46, 0x38])) return 'gif';
  if (startsWith([0x42, 0x4d])) return 'bmp';
  if (startsWith([0x25, 0x50, 0x44, 0x46])) return 'pdf';
  if (startsWith([0x50, 0x4b, 0x03, 0x04])) return 'zip';
  if (startsWith([0xd0, 0xcf, 0x11, 0xe0])) return 'ole';
  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) return 'webp';
  if (!buf.slice(0, 512).includes(0x00)) return 'text';
  return 'binary';
}

const EXT_KIND = {
  '.png': ['png'],
  '.jpg': ['jpg'],
  '.jpeg': ['jpg'],
  '.gif': ['gif'],
  '.bmp': ['bmp'],
  '.webp': ['webp'],
  '.pdf': ['pdf'],
  '.doc': ['ole'],
  '.ppt': ['ole'],
  '.xls': ['ole'],
  '.docx': ['zip'],
  '.pptx': ['zip'],
  '.xlsx': ['zip'],
  '.zip': ['zip'],
  '.txt': ['text'],
  '.csv': ['text'],
};

function readHeader(filePath) {
  const fd = fs.openSync(filePath, 'r');
  try {
    const buffer = Buffer.alloc(16);
    fs.readSync(fd, buffer, 0, 16, 0);
    return buffer;
  } finally {
    fs.closeSync(fd);
  }
}

function removeQuietly(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch {
    // 文件不存在时忽略
  }
}

router.post('/', requireAuth, upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请选择要上传的文件' });

  const ext = path.extname(req.file.filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    removeQuietly(req.file.path);
    return res.status(415).json({ message: '暂不支持该文件格式' });
  }

  const header = readHeader(req.file.path);
  const kind = sniff(header);
  const expected = EXT_KIND[ext] || [];
  if (!expected.includes(kind)) {
    removeQuietly(req.file.path);
    return res.status(415).json({ message: '文件内容与扩展名不一致，已拒绝上传' });
  }

  const used = await db
    .prepare('SELECT COALESCE(SUM(size), 0) AS total FROM upload_files WHERE user_id = ?')
    .get(req.user.id);
  if (Number(used.total) + req.file.size > USER_QUOTA) {
    removeQuietly(req.file.path);
    return res.status(413).json({ message: '附件空间已用完（每人 100MB），请先删除部分历史附件' });
  }

  const originalName = decodeFileName(req.file.originalname);
  await db.prepare(
    'INSERT INTO upload_files (user_id, file_name, original_name, size, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(req.user.id, req.file.filename, originalName, req.file.size, new Date().toISOString());

  res.status(201).json({
    file: {
      name: originalName,
      url: `/uploads/${req.file.filename}`,
      size: req.file.size,
      mime: req.file.mimetype,
    },
  });
});

export { router as uploadsRouter, UPLOAD_DIR };
