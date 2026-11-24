import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
export const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', 'uploads');

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

export const db = new DatabaseSync(path.join(DATA_DIR, 'math-pbl.db'));

db.exec(`
PRAGMA journal_mode = WAL;

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
`);

const submissionColumns = db.prepare('PRAGMA table_info(submissions)').all();
if (!submissionColumns.some((column) => column.name === 'worksheet')) {
  db.exec("ALTER TABLE submissions ADD COLUMN worksheet TEXT NOT NULL DEFAULT '{}'");
}

const toolColumns = db.prepare('PRAGMA table_info(tools)').all();
if (!toolColumns.some((column) => column.name === 'category')) {
  db.exec("ALTER TABLE tools ADD COLUMN category TEXT NOT NULL DEFAULT 'assist'");
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
  return {
    id: Number(row.id),
    assignmentId: Number(row.assignment_id),
    studentId: Number(row.student_id),
    content: row.content || '',
    worksheet: normalizeWorksheet(parseJson(row.worksheet, {})),
    files: parseJson(row.files, []),
    status: row.status,
    analysis: parseJson(row.analysis, null),
    submittedAt: row.submitted_at || '',
    score: row.score === null || row.score === undefined ? null : Number(row.score),
    feedback: row.feedback || '',
    gradedAt: row.graded_at || '',
    updatedAt: row.updated_at,
    studentName: row.student_name || '',
    username: row.username || '',
  };
}
