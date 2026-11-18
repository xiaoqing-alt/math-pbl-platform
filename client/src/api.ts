import type { Board, Role, User } from './types';

// VITE_API_BASE 填后端服务根地址（不含 /api）；本地开发留空，走 Vite 代理同源请求
const API_ROOT = (import.meta.env.VITE_API_BASE || '').replace(/\/$/, '');
const API_BASE = `${API_ROOT}/api`;
const TOKEN_KEY = 'mathpbl_token';
const USER_KEY = 'mathpbl_user';

export const BOARD_META: Record<Board, { name: string; icon: string; tone: string; desc: string }> = {
  algebra: { name: '数与代数', icon: 'ƒ', tone: 'algebra', desc: '方程 · 函数 · 建模' },
  geometry: { name: '图形与几何', icon: '△', tone: 'geometry', desc: '图形 · 测量 · 推理' },
  stats: { name: '统计与概率', icon: '▦', tone: 'stats', desc: '调查 · 数据 · 推断' },
};

export const BOARD_OPTIONS: Board[] = ['algebra', 'geometry', 'stats'];

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

export function saveAuth(token: string, user: User) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  auth?: boolean;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, auth = true } = options;
  const headers: Record<string, string> = {};
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let response: Response;
  try {
    response = await fetch(API_BASE + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('无法连接服务器，请确认后端服务已启动', 0);
  }

  let data: any = null;
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }

  if (!response.ok) {
    if (response.status === 401) clearAuth();
    throw new ApiError((data && data.message) || `请求失败（${response.status}）`, response.status);
  }
  return data as T;
}

export async function uploadFile(file: File): Promise<{ name: string; url: string; size: number }> {
  const form = new FormData();
  form.append('file', file);
  const token = getToken();
  let response: Response;
  try {
    response = await fetch(`${API_BASE}/uploads`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: form,
    });
  } catch {
    throw new ApiError('无法连接服务器，上传失败', 0);
  }
  let data: any = null;
  try {
    data = await response.json();
  } catch {
    data = null;
  }
  if (!response.ok) {
    throw new ApiError((data && data.message) || '文件上传失败', response.status);
  }
  return data.file;
}

export function fileUrl(url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return API_ROOT + url;
}

export function formatDate(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function formatDateTime(value: string | undefined | null): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${formatDate(value)} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function formatFileSize(size: number | undefined | null): string {
  const value = Number(size) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(0)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

export function roleHome(role: Role): string {
  return role === 'teacher' ? '/teacher' : '/student';
}

export { API_BASE };

export type { Role, Board };
