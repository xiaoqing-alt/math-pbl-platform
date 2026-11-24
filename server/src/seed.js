import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db, get, run, initSchema } from './db.js';
import { hashPassword } from './auth.js';
import { TEMPLATE_SEED } from './templateData.js';
import { TOOL_SEED } from './toolData.js';

async function insertReturningId(sql, params) {
  const row = await get(`${sql} RETURNING id`, params);
  return row ? Number(row.id) : null;
}

async function ensureUser({ role, username, password, displayName }) {
  const existing = await db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return Number(existing.id);
  return insertReturningId(
    'INSERT INTO users (role, username, password, display_name, created_at) VALUES (?, ?, ?, ?, ?)',
    [role, username, hashPassword(password), displayName, new Date().toISOString()],
  );
}

async function ensureTemplate(template) {
  const existing = await db
    .prepare('SELECT id FROM templates WHERE board = ? AND title = ?')
    .get(template.board, template.title);
  if (existing) return;
  await db
    .prepare(
      `INSERT INTO templates (board, title, project_type, grade, duration, summary, cover_image, content, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      template.board,
      template.title,
      template.projectType || '',
      template.grade || '',
      template.duration || '',
      template.summary || '',
      template.coverImage || '',
      JSON.stringify(template.content || {}),
      new Date().toISOString(),
    );
}

async function ensureClass(teacherId, name, grade, studentIds) {
  let row = await db
    .prepare('SELECT id FROM classes WHERE teacher_id = ? AND name = ?')
    .get(teacherId, name);
  if (!row) {
    const id = await insertReturningId(
      'INSERT INTO classes (teacher_id, name, grade, created_at) VALUES (?, ?, ?, ?)',
      [teacherId, name, grade, new Date().toISOString()],
    );
    row = { id };
  }
  const classId = Number(row.id);
  for (const studentId of studentIds) {
    const exists = await db
      .prepare('SELECT id FROM class_members WHERE class_id = ? AND student_id = ?')
      .get(classId, studentId);
    if (!exists) {
      await db
        .prepare('INSERT INTO class_members (class_id, student_id, joined_at) VALUES (?, ?, ?)')
        .run(classId, studentId, new Date().toISOString());
    }
  }
  return classId;
}

async function ensureTool(tool) {
  const existing = await db.prepare('SELECT id FROM tools WHERE tool_key = ?').get(tool.key);
  const category = tool.category === 'inquiry' ? 'inquiry' : 'assist';
  if (existing) {
    await db
      .prepare('UPDATE tools SET name = ?, description = ?, boards = ?, file_name = ?, category = ? WHERE id = ?')
      .run(
        tool.name,
        tool.description || '',
        JSON.stringify(tool.boards || []),
        tool.fileName,
        category,
        existing.id,
      );
    return;
  }
  await db
    .prepare(
      `INSERT INTO tools (tool_key, owner_id, name, description, boards, file_name, builtin, category, created_at)
       VALUES (?, NULL, ?, ?, ?, ?, 1, ?, ?)`,
    )
    .run(
      tool.key,
      tool.name,
      tool.description || '',
      JSON.stringify(tool.boards || []),
      tool.fileName,
      category,
      new Date().toISOString(),
    );
}

export async function runSeed() {
  for (const template of TEMPLATE_SEED) {
    await ensureTemplate(template);
  }
  for (const tool of TOOL_SEED) {
    await ensureTool(tool);
  }

  const teacherId = await ensureUser({
    role: 'teacher',
    username: 'teacher',
    password: '123456',
    displayName: '张老师',
  });

  const students = [
    { username: 'student', displayName: '李小明' },
    { username: 's2', displayName: '王雨欣' },
    { username: 's3', displayName: '陈浩' },
    { username: 's4', displayName: '赵悦' },
  ];

  const studentIds = [];
  for (const item of students) {
    studentIds.push(
      await ensureUser({
        role: 'student',
        username: item.username,
        password: '123456',
        displayName: item.displayName,
      }),
    );
  }

  const classId = await ensureClass(teacherId, '八年级(1)班', '八年级', studentIds);

  return {
    teacherId,
    classId,
    studentCount: studentIds.length,
    templateCount: TEMPLATE_SEED.length,
    toolCount: TOOL_SEED.length,
  };
}

const thisFile = fileURLToPath(import.meta.url);
const runDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === path.resolve(thisFile);

if (runDirectly) {
  await initSchema();
  const result = await runSeed();
  console.log('演示数据初始化完成：');
  console.log(`  官方模板：${result.templateCount} 份`);
  console.log(`  内置AI工具：${result.toolCount} 个`);
  console.log(`  教师账号：teacher / 123456（张老师）`);
  console.log(`  学生账号：student / 123456（李小明）等 ${result.studentCount} 人`);
  console.log(`  演示班级：八年级(1)班（ID: ${result.classId}）`);
}
