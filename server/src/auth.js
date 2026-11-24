import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DATA_DIR, db, serializeUser } from './db.js';

const SECRET_FILE = path.join(DATA_DIR, '.auth-secret');

function loadSecret() {
  try {
    const saved = fs.readFileSync(SECRET_FILE, 'utf8').trim();
    if (saved) return saved;
  } catch {
    // ignore
  }
  const secret = crypto.randomBytes(48).toString('hex');
  fs.writeFileSync(SECRET_FILE, secret, 'utf8');
  return secret;
}

const SECRET = process.env.AUTH_SECRET || loadSecret();
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signData(data) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
}

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

export function signToken(user) {
  const payload = base64url(
    JSON.stringify({
      uid: Number(user.id),
      role: user.role,
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    }),
  );
  return `${payload}.${signData(payload)}`;
}

export function verifyToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, signature] = token.split('.');
  const expected = signData(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || !data.uid || !data.role) return null;
    if (Number(data.exp) < Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch {
    return null;
  }
}

export async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ message: '登录状态已失效，请重新登录' });
  }
  const user = await db
    .prepare('SELECT id, role, username, display_name FROM users WHERE id = ?')
    .get(payload.uid);
  if (!user || user.role !== payload.role) {
    return res.status(401).json({ message: '账号不存在或身份已变更，请重新登录' });
  }
  req.user = user;
  req.userOut = serializeUser(user);
  return next();
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) {
      return res.status(403).json({ message: '没有访问该功能的权限' });
    }
    return next();
  };
}
