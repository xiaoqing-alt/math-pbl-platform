import express from 'express';
import cors from 'cors';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSchema, closeDatabase, UPLOAD_DIR, getDbInfo } from './db.js';
import { runSeed } from './seed.js';
import authRouter from './routes/auth.js';
import { classesRouter } from './routes/classes.js';
import { templatesRouter } from './routes/templates.js';
import { tasksRouter } from './routes/tasks.js';
import { assignmentsRouter, submissionRouter } from './routes/assignments.js';
import { studentRouter } from './routes/student.js';
import { uploadsRouter } from './routes/uploads.js';
import toolsRouter from './routes/tools.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3001);

await initSchema();
await runSeed();

const app = express();

const allowedOrigins = String(process.env.CORS_ORIGIN || '')
  .split(',')
  .map((item) => item.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      return callback(new Error('该来源未被允许访问接口'));
    },
  }),
);

app.use(express.json({ limit: '6mb' }));

app.get('/api/health', (req, res) => {
  res.json({ ok: true, service: 'math-pbl-platform', time: new Date().toISOString() });
});

app.get('/api/debug/db', (req, res) => {
  res.json(getDbInfo());
});

app.use('/api/auth', authRouter);
app.use('/api/classes', classesRouter);
app.use('/api/templates', templatesRouter);
app.use('/api/tasks', tasksRouter);
app.use('/api/assignments', assignmentsRouter);
app.use('/api/submissions', submissionRouter);
app.use('/api/student', studentRouter);
app.use('/api/uploads', uploadsRouter);
app.use('/api/tools', toolsRouter);

app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/uploads/')) return next();
    return res.sendFile(path.join(clientDist, 'index.html'));
  });
}

app.use('/api', (req, res) => {
  res.status(404).json({ message: '接口不存在' });
});

app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: '文件不能超过 20MB' });
  }
  if (err && err.name === 'MulterError') {
    return res.status(400).json({ message: '文件上传失败：' + err.message });
  }
  console.error('[server error]', err);
  return res.status(500).json({ message: '服务器内部错误，请稍后再试' });
});

const server = app.listen(PORT, () => {
  console.log(`初中数学项目式学习平台服务已启动：http://localhost:${PORT}`);
  console.log('演示账号：教师 teacher / 123456；学生 student / 123456');
});

function shutdown() {
  server.close(async () => {
    try {
      await closeDatabase();
    } catch {
      // ignore
    }
    process.exit(0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
