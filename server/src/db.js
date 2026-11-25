import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const DATABASE_URL = String(process.env.DATABASE_URL || '').trim();
export const USE_POSTGRES = Boolean(DATABASE_URL);

// 临时调试：报告运行时实际使用的数据库模式与目标主机（定位持久化问题用，验证后移除）
export function getDbInfo() {
  let host = '';
  if (DATABASE_URL) {
    try {
      const u = new URL(DATABASE_URL);
      host = u.host;
    } catch {
      host = '(无法解析)';
    }
  }
  return {
    usePostgres: USE_POSTGRES,
    hasDatabaseUrl: Boolean(DATABASE_URL),
    databaseUrlRawPreview: DATABASE_URL ? `${DATABASE_URL.slice(0, 12)}...` : '(空)',
    host,
  };
}

let sqlite = null;
let pool = null;

// 创建 Postgres 连接池。managed 数据库（Railway/Neon/Supabase）通常需要 SSL；
// 用 rejectUnauthorized:false 兼容自签证书。sslmode=disable 时显式关闭。
function createPool(useSsl) {
  return new pg.Pool({
    connectionString: DATABASE_URL,
    max: Number(process.env.PG_POOL_MAX || 5),
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

if (USE_POSTGRES) {
  const useSsl = !DATABASE_URL.includes('sslmode=disable');
  // 启动时打印运行时拿到的真实主机名，便于排查 Railway 服务引用/DNS 问题
  try {
    const parsed = new URL(DATABASE_URL);
    console.log('[pg] connecting to host=', parsed.host, 'ssl=', useSsl);
  } catch {
    console.log('[pg] DATABASE_URL 无法解析:', DATABASE_URL.slice(0, 30));
  }
  pool = createPool(useSsl);
  pool.on('error', (err) => {
    console.error('[pg pool error]', err && err.message ? err.message : err);
  });
} else {
  sqlite = new DatabaseSync(path.join(DATA_DIR, 'math-pbl.db'));
  sqlite.exec('PRAGMA journal_mode = WAL;');
}

// 启动时先做一次连通性探测；若 SSL 握手失败，自动回退到不使用 SSL 再试一次。
export async function probePostgresConnection() {
  if (!USE_POSTGRES) return;
  const tryQuery = async () => {
    const client = await pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  };
  try {
    await tryQuery();
    console.log('[pg] connection OK (ssl enabled)');
    return;
  } catch (error) {
    const msg = String((error && error.message) || '');
    console.error('[pg] first connect failed:', msg);
    if (!/ssl|tls|encrypted|self[- ]signed|certificate/i.test(msg) || DATABASE_URL.includes('sslmode=disable')) {
      throw error;
    }
  }
  // 回退：关闭 SSL 重试
  try {
    await pool.end();
  } catch {
    // ignore
  }
  pool = createPool(false);
  pool.on('error', (err) => console.error('[pg pool error]', err && err.message ? err.message : err));
  await tryQuery();
  console.log('[pg] connection OK (ssl disabled, fallback)');
}

// SQLite 使用 ? 占位符，Postgres 使用 $1、$2；这里做统一转换（跳过单引号内的内容）
function toPostgresSql(sql) {
  let index = 0;
  let inQuote = false;
  let result = '';
  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    if (char === "'") {
      inQuote = !inQuote;
      result += char;
      continue;
    }
    if (char === '?' && !inQuote) {
      index += 1;
      result += `$${index}`;
      continue;
    }
    result += char;
  }
  return result;
}

export async function all(sql, params = []) {
  if (!USE_POSTGRES) return sqlite.prepare(sql).all(...params);
  const result = await pool.query(toPostgresSql(sql), params);
  return result.rows;
}

export async function get(sql, params = []) {
  const rows = await all(sql, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function run(sql, params = []) {
  if (!USE_POSTGRES) {
    const result = sqlite.prepare(sql).run(...params);
    return {
      changes: Number(result.changes || 0),
      lastInsertRowid: result.lastInsertRowid === undefined ? null : Number(result.lastInsertRowid),
    };
  }
  const result = await pool.query(toPostgresSql(sql), params);
  const first = result.rows[0] || {};
  return {
    changes: Number(result.rowCount || 0),
    lastInsertRowid: first.id === undefined ? null : Number(first.id),
  };
}

export async function exec(sql) {
  if (!USE_POSTGRES) return sqlite.exec(sql);
  await pool.query(sql);
}

// 兼容原有同步写法：调用方统一加 await 即可
export const db = {
  prepare(sql) {
    return {
      get: (...params) => get(sql, params),
      all: (...params) => all(sql, params),
      run: (...params) => run(sql, params),
    };
  },
};

export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
  }
  if (sqlite) {
    sqlite.close();
    sqlite = null;
  }
}

function buildFacade(queryRunner) {
  return {
    prepare(sql) {
      return {
        get: (...params) => queryRunner.get(sql, params),
        all: (...params) => queryRunner.all(sql, params),
        run: (...params) => queryRunner.run(sql, params),
      };
    },
  };
}

// 在一个事务里执行一组数据库操作：SQLite 用 BEGIN/COMMIT，Postgres 使用同一个连接
export async function runTransaction(work) {
  if (!USE_POSTGRES) {
    sqlite.exec('BEGIN');
    try {
      const result = await work(db);
      sqlite.exec('COMMIT');
      return result;
    } catch (error) {
      sqlite.exec('ROLLBACK');
      throw error;
    }
  }
  const client = await pool.connect();
  const scoped = buildFacade({
    get: async (sql, params) => {
      const result = await client.query(toPostgresSql(sql), params);
      return result.rows[0] || null;
    },
    all: async (sql, params) => {
      const result = await client.query(toPostgresSql(sql), params);
      return result.rows;
    },
    run: async (sql, params) => {
      const result = await client.query(toPostgresSql(sql), params);
      const first = result.rows[0] || {};
      return {
        changes: Number(result.rowCount || 0),
        lastInsertRowid: first.id === undefined ? null : Number(first.id),
      };
    },
  });
  try {
    await client.query('BEGIN');
    const result = await work(scoped);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  role TEXT NOT NULL CHECK (role IN ('teacher', 'student')),
  username TEXT NOT NULL UNIQUE,
  password TEXT NOT NULL,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS classes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  grade TEXT DEFAULT '',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS class_members (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  class_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  joined_at TEXT NOT NULL,
  UNIQUE (class_id, student_id)
);

CREATE TABLE IF NOT EXISTS templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  board TEXT NOT NULL,
  title TEXT NOT NULL,
  project_type TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id INTEGER NOT NULL,
  template_id INTEGER,
  board TEXT NOT NULL,
  title TEXT NOT NULL,
  project_type TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  duration TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  cover_image TEXT DEFAULT '',
  content TEXT NOT NULL,
  ai_enabled INTEGER NOT NULL DEFAULT 0,
  ai_skills TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task_id INTEGER NOT NULL,
  class_id INTEGER NOT NULL,
  teacher_id INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'published',
  due_at TEXT DEFAULT '',
  published_at TEXT NOT NULL,
  withdrawn_at TEXT DEFAULT '',
  UNIQUE (task_id, class_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  assignment_id INTEGER NOT NULL,
  student_id INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  files TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'draft',
  analysis TEXT DEFAULT '',
  submitted_at TEXT DEFAULT '',
  score REAL,
  feedback TEXT DEFAULT '',
  graded_at TEXT DEFAULT '',
  updated_at TEXT NOT NULL,
  UNIQUE (assignment_id, student_id)
);

CREATE INDEX IF NOT EXISTS idx_tasks_teacher ON tasks (teacher_id);
CREATE INDEX IF NOT EXISTS idx_assignments_class ON assignments (class_id);
CREATE INDEX IF NOT EXISTS idx_assignments_task ON assignments (task_id);
CREATE INDEX IF NOT EXISTS idx_submissions_assignment ON submissions (assignment_id);
CREATE INDEX IF NOT EXISTS idx_members_class ON class_members (class_id);

CREATE TABLE IF NOT EXISTS tools (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tool_key TEXT NOT NULL UNIQUE,
  owner_id INTEGER,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  boards TEXT NOT NULL DEFAULT '[]',
  file_name TEXT NOT NULL,
  builtin INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT 'assist',
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS upload_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  file_name TEXT NOT NULL,
  original_name TEXT DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_upload_files_user ON upload_files (user_id);

CREATE TABLE IF NOT EXISTS submission_versions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  version_no INTEGER NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  worksheet TEXT NOT NULL DEFAULT '{}',
  files TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL,
  UNIQUE (submission_id, version_no)
);

CREATE INDEX IF NOT EXISTS idx_versions_submission ON submission_versions (submission_id);
`;

async function ensureColumn(table, column, definition) {
  if (USE_POSTGRES) {
    const existing = await pool.query(
      'SELECT 1 FROM information_schema.columns WHERE table_name = $1 AND column_name = $2',
      [table, column],
    );
    if (existing.rowCount === 0) {
      await pool.query(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    }
    return;
  }
  const columns = sqlite.prepare(`PRAGMA table_info(${table})`).all();
  if (!columns.some((item) => item.name === column)) {
    sqlite.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
  }
}

export async function initSchema() {
  if (USE_POSTGRES) {
    await pool.query(SCHEMA.replace(/INTEGER PRIMARY KEY AUTOINCREMENT/g, 'SERIAL PRIMARY KEY'));
  } else {
    sqlite.exec(SCHEMA);
  }
  await ensureColumn('submissions', 'worksheet', "TEXT NOT NULL DEFAULT '{}'");
  await ensureColumn('tools', 'category', "TEXT NOT NULL DEFAULT 'assist'");
  await ensureColumn('submissions', 'criteria_scores', "TEXT NOT NULL DEFAULT '[]'");
  await ensureColumn('submissions', 'returned_at', "TEXT DEFAULT ''");
  await ensureColumn('submissions', 'return_note', "TEXT DEFAULT ''");
}

export const BOARD_NAMES = {
  algebra: '数与代数',
  geometry: '图形与几何',
  stats: '统计与概率',
};

export function isBoard(value) {
  return Object.prototype.hasOwnProperty.call(BOARD_NAMES, value);
}

export function parseJson(value, fallback) {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function normalizeContent(raw) {
  const content = raw && typeof raw === 'object' ? raw : {};
  const list = (v) => (Array.isArray(v) ? v : []);

  return {
    background: String(content.background || ''),
    objectives: list(content.objectives).map((x) => String(x || '').trim()).filter(Boolean),
    knowledgeTags: list(content.knowledgeTags).map((x) => String(x || '').trim()).filter(Boolean),
    description: String(content.description || ''),
    steps: list(content.steps)
      .map((step) => ({
        title: String((step && step.title) || '').trim(),
        content: String((step && step.content) || ''),
      }))
      .filter((step) => step.title || step.content),
    stages: list(content.stages)
      .map((stage) => ({
        title: String((stage && stage.title) || '').trim(),
        intro: String((stage && stage.intro) || ''),
        items: list(stage && stage.items).map((x) => String(x || '').trim()).filter(Boolean),
        columns: list(stage && stage.columns).map((x) => String(x || '').trim()).filter(Boolean),
        prompt: String((stage && stage.prompt) || ''),
      }))
      .filter((stage) => stage.title || stage.intro || stage.items.length),
    tool: String(content.tool || ''),
    toolKeys: list(content.toolKeys || (content.tool ? [content.tool] : []))
      .map((x) => String(x || '').trim())
      .filter(Boolean),
    criteria: list(content.criteria)
      .map((item) => ({
        name: String((item && item.name) || '').trim(),
        weight: Number((item && item.weight) || 0),
        description: String((item && item.description) || '').trim(),
      }))
      .filter((item) => item.name),
    rubric: list(content.rubric)
      .map((item) => ({
        name: String((item && item.name) || '').trim(),
        a: String((item && item.a) || '').trim(),
        b: String((item && item.b) || '').trim(),
        c: String((item && item.c) || '').trim(),
        d: String((item && item.d) || '').trim(),
      }))
      .filter((item) => item.name),
    reflections: list(content.reflections).map((x) => String(x || '').trim()).filter(Boolean),
    references: list(content.references)
      .map((item) => ({
        title: String((item && item.title) || '').trim(),
        content: String((item && item.content) || ''),
        images: list(item && item.images).map((x) => String(x || '')).filter(Boolean),
        files: list(item && item.files)
          .map((file) => ({
            name: String((file && file.name) || '附件'),
            url: String((file && file.url) || ''),
            size: Number((file && file.size) || 0),
          }))
          .filter((file) => file.url),
      }))
      .filter((item) => item.title || item.content || item.images.length || item.files.length),
  };
}

export function normalizeWorksheet(raw) {
  const worksheet = raw && typeof raw === 'object' ? raw : {};
  const list = (v) => (Array.isArray(v) ? v : []);
  return {
    stages: list(worksheet.stages).map((stage) => ({
      text: String((stage && stage.text) || ''),
      rows: list(stage && stage.rows).map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => String(cell ?? '')),
      ),
    })),
    selfScores: list(worksheet.selfScores).map((value) =>
      ['A', 'B', 'C', 'D'].includes(String(value || '').toUpperCase())
        ? String(value).toUpperCase()
        : '',
    ),
    gains: String(worksheet.gains || ''),
    difficulties: String(worksheet.difficulties || ''),
  };
}

export function serializeUser(user) {
  return {
    id: Number(user.id),
    role: user.role,
    username: user.username,
    displayName: user.display_name,
  };
}

export function serializeTask(row) {
  if (!row) return null;
  return {
    id: Number(row.id),
    teacherId: Number(row.teacher_id),
    templateId: row.template_id === null || row.template_id === undefined ? null : Number(row.template_id),
    board: row.board,
    boardName: BOARD_NAMES[row.board] || row.board,
    title: row.title,
    projectType: row.project_type || '',
    grade: row.grade || '',
    duration: row.duration || '',
    summary: row.summary || '',
    coverImage: row.cover_image || '',
    content: normalizeContent(parseJson(row.content, {})),
    aiEnabled: Boolean(row.ai_enabled),
    aiSkills: parseJson(row.ai_skills, []),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    teacherName: row.teacher_name || '',
  };
}

export function serializeSubmission(row) {
  if (!row) return null;
  const analysis = parseJson(row.analysis, null);
  return {
    id: Number(row.id),
    assignmentId: Number(row.assignment_id),
    studentId: Number(row.student_id),
    content: row.content || '',
    worksheet: normalizeWorksheet(parseJson(row.worksheet, {})),
    files: parseJson(row.files, []),
    status: row.status,
    analysis,
    aiCriteriaScores:
      analysis && Array.isArray(analysis.dimensions)
        ? analysis.dimensions.map((item) => ({
            name: item.name,
            score: Number(item.score) || 0,
            weight: Number(item.weight) || 0,
            reason: item.reason || '',
          }))
        : [],
    submittedAt: row.submitted_at || '',
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    feedback: row.feedback || '',
    gradedAt: row.graded_at || '',
    criteriaScores: parseJson(row.criteria_scores, []),
    returnedAt: row.returned_at || '',
    returnNote: row.return_note || '',
    updatedAt: row.updated_at,
    studentName: row.student_name || '',
    username: row.username || '',
  };
}
