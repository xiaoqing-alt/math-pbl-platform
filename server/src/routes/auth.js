import express from 'express';
import { db, serializeUser } from '../db.js';
import { hashPassword, verifyPassword, signToken, requireAuth } from '../auth.js';

const router = express.Router();

router.post('/register', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const displayName = String(req.body.displayName || '').trim() || username;
  const role = String(req.body.role || 'teacher');

  if (role !== 'teacher') {
    return res.status(403).json({ message: '学生账号由教师创建，平台不开放学生自助注册' });
  }
  if (!username) return res.status(400).json({ message: '用户名不能为空' });
  if (username.length > 32) return res.status(400).json({ message: '用户名不能超过 32 个字符' });
  if (password.length < 6) return res.status(400).json({ message: '密码至少需要 6 位' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ message: '该用户名已被使用，请换一个' });

  const result = db
    .prepare('INSERT INTO users (role, username, password, display_name, created_at) VALUES (?, ?, ?, ?, ?)')
    .run('teacher', username, hashPassword(password), displayName, new Date().toISOString());

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ token: signToken(user), user: serializeUser(user) });
});

router.post('/login', (req, res) => {
  const username = String(req.body.username || '').trim();
  const password = String(req.body.password || '');
  const role = String(req.body.role || '').trim();

  if (!username || !password) {
    return res.status(400).json({ message: '请输入用户名和密码' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ message: '用户名或密码不正确' });
  }
  if (role && user.role !== role) {
    return res.status(403).json({
      message: user.role === 'teacher' ? '这是教师账号，请从教师端登录' : '这是学生账号，请从学生端登录',
    });
  }

  return res.json({ token: signToken(user), user: serializeUser(user) });
});

router.get('/me', requireAuth, (req, res) => {
  return res.json({ user: req.userOut });
});

export default router;
