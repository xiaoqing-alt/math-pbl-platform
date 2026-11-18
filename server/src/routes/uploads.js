import express from 'express';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { UPLOAD_DIR } from '../db.js';
import { requireAuth } from '../auth.js';

const router = express.Router();

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

router.post('/', requireAuth, upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ message: '请选择要上传的文件' });

  const ext = path.extname(req.file.filename).toLowerCase();
  if (!ALLOWED_EXT.has(ext)) {
    return res.status(415).json({ message: '暂不支持该文件格式' });
  }

  const originalName = decodeFileName(req.file.originalname);

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
