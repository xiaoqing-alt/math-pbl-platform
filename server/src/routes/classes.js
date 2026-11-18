import express from 'express';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { db } from '../db.js';
import { requireAuth, requireRole, hashPassword } from '../auth.js';

const router = express.Router();

const excelUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 },
});

router.use(requireAuth, requireRole('teacher'));

function parseId(value) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function serializeClass(row) {
  return {
    id: Number(row.id),
    name: row.name,
    grade: row.grade || '',
    studentCount: Number(row.student_count || 0),
    assignmentCount: Number(row.assignment_count || 0),
    createdAt: row.created_at,
  };
}

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS student_count,
        (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.status = 'published') AS assignment_count
       FROM classes c WHERE c.teacher_id = ? ORDER BY c.id DESC`,
    )
    .all(req.user.id);
  res.json({ classes: rows.map(serializeClass) });
});

router.post('/', (req, res) => {
  const name = String(req.body.name || '').trim();
  const grade = String(req.body.grade || '').trim();
  if (!name) return res.status(400).json({ message: '请输入班级名称' });
  if (name.length > 40) return res.status(400).json({ message: '班级名称不能超过 40 个字符' });

  const duplicate = db
    .prepare('SELECT id FROM classes WHERE teacher_id = ? AND name = ?')
    .get(req.user.id, name);
  if (duplicate) return res.status(409).json({ message: '你已经创建了同名班级' });

  const result = db
    .prepare('INSERT INTO classes (teacher_id, name, grade, created_at) VALUES (?, ?, ?, ?)')
    .run(req.user.id, name, grade, new Date().toISOString());
  const row = db.prepare('SELECT * FROM classes WHERE id = ?').get(result.lastInsertRowid);
  res.status(201).json({ class: serializeClass(row) });
});

router.get('/:id', (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const row = db
    .prepare(
      `SELECT c.*,
        (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS student_count,
        (SELECT COUNT(*) FROM assignments a WHERE a.class_id = c.id AND a.status = 'published') AS assignment_count
       FROM classes c WHERE c.id = ? AND c.teacher_id = ?`,
    )
    .get(classId, req.user.id);
  if (!row) return res.status(404).json({ message: '班级不存在或无权访问' });

  const students = db
    .prepare(
      `SELECT u.id, u.username, u.display_name, m.joined_at
       FROM class_members m JOIN users u ON u.id = m.student_id
       WHERE m.class_id = ? ORDER BY u.id`,
    )
    .all(classId)
    .map((item) => ({
      id: Number(item.id),
      username: item.username,
      displayName: item.display_name,
      joinedAt: item.joined_at,
    }));

  const assignments = db
    .prepare(
      `SELECT a.*, t.title AS task_title, t.board AS board,
        (SELECT COUNT(*) FROM class_members m WHERE m.class_id = a.class_id) AS student_count,
        (SELECT COUNT(*) FROM submissions s WHERE s.assignment_id = a.id AND s.status = 'submitted') AS submitted_count
       FROM assignments a JOIN tasks t ON t.id = a.task_id
       WHERE a.class_id = ? ORDER BY a.published_at DESC`,
    )
    .all(classId)
    .map((item) => ({
      id: Number(item.id),
      taskId: Number(item.task_id),
      taskTitle: item.task_title,
      board: item.board,
      status: item.status,
      dueAt: item.due_at || '',
      publishedAt: item.published_at,
      studentCount: Number(item.student_count || 0),
      submittedCount: Number(item.submitted_count || 0),
    }));

  res.json({ class: serializeClass(row), students, assignments });
});

router.patch('/:id', (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const row = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!row) return res.status(404).json({ message: '班级不存在或无权访问' });

  const name = req.body.name === undefined ? row.name : String(req.body.name || '').trim();
  const grade = req.body.grade === undefined ? row.grade : String(req.body.grade || '').trim();
  if (!name) return res.status(400).json({ message: '班级名称不能为空' });

  db.prepare('UPDATE classes SET name = ?, grade = ? WHERE id = ?').run(name, grade, classId);
  const updated = db.prepare('SELECT * FROM classes WHERE id = ?').get(classId);
  res.json({ class: serializeClass(updated) });
});

router.delete('/:id', (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const row = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!row) return res.status(404).json({ message: '班级不存在或无权访问' });

  const assignmentCount = db
    .prepare('SELECT COUNT(*) AS count FROM assignments WHERE class_id = ?')
    .get(classId).count;
  if (Number(assignmentCount) > 0) {
    return res.status(409).json({ message: '该班级已有任务发布记录，暂不能删除班级' });
  }

  db.prepare('DELETE FROM class_members WHERE class_id = ?').run(classId);
  db.prepare('DELETE FROM classes WHERE id = ?').run(classId);
  res.json({ ok: true });
});

router.post('/:id/students', (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const classRow = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!classRow) return res.status(404).json({ message: '班级不存在或无权访问' });

  const username = String(req.body.username || '').trim();
  const displayName = String(req.body.displayName || '').trim() || username;
  const password = String(req.body.password || '');

  if (!username) return res.status(400).json({ message: '学生用户名不能为空' });
  if (username.length > 32) return res.status(400).json({ message: '学生用户名不能超过 32 个字符' });

  let student = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (student && student.role !== 'student') {
    return res.status(409).json({ message: '该用户名属于教师账号，不能添加为学生' });
  }
  let isNewAccount = false;
  if (!student) {
    if (password.length < 6) {
      return res.status(400).json({ message: '新建学生账号时，密码至少需要 6 位' });
    }
    const result = db
      .prepare('INSERT INTO users (role, username, password, display_name, created_at) VALUES (?, ?, ?, ?, ?)')
      .run('student', username, hashPassword(password), displayName, new Date().toISOString());
    student = db.prepare('SELECT * FROM users WHERE id = ?').get(result.lastInsertRowid);
    isNewAccount = true;
  }

  const exists = db
    .prepare('SELECT id FROM class_members WHERE class_id = ? AND student_id = ?')
    .get(classId, student.id);
  if (exists) return res.status(409).json({ message: '该学生已在本班中' });

  db.prepare('INSERT INTO class_members (class_id, student_id, joined_at) VALUES (?, ?, ?)').run(
    classId,
    student.id,
    new Date().toISOString(),
  );

  res.status(201).json({
    student: {
      id: Number(student.id),
      username: student.username,
      displayName: student.display_name,
      isNewAccount,
    },
  });
});

router.delete('/:id/students/:studentId', (req, res) => {
  const classId = parseId(req.params.id);
  const studentId = parseId(req.params.studentId);
  if (!classId || !studentId) return res.status(400).json({ message: '参数无效' });
  const classRow = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!classRow) return res.status(404).json({ message: '班级不存在或无权访问' });

  db.prepare('DELETE FROM class_members WHERE class_id = ? AND student_id = ?').run(classId, studentId);
  res.json({ ok: true });
});

// 下载批量导入用的 Excel 模板
router.get('/:id/students/template', (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const classRow = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!classRow) return res.status(404).json({ message: '班级不存在或无权访问' });

  const rows = [
    { 用户名: 'zhangsan01', 姓名: '张三', 初始密码: '123456' },
    { 用户名: 'lisi02', 姓名: '李四', 初始密码: '123456' },
  ];
  const sheet = XLSX.utils.json_to_sheet(rows, { header: ['用户名', '姓名', '初始密码'] });
  sheet['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 14 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '学生名单');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${classRow.name}-学生导入模板.xlsx`)}`,
  );
  res.send(buffer);
});

// 上传填好的 Excel 批量导入学生
router.post('/:id/students/import', excelUpload.single('file'), (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const classRow = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!classRow) return res.status(404).json({ message: '班级不存在或无权访问' });

  const rows = [];
  if (req.file) {
    try {
      const book = XLSX.read(req.file.buffer, { type: 'buffer' });
      const sheet = book.Sheets[book.SheetNames[0]];
      if (!sheet) return res.status(400).json({ message: 'Excel 中没有可读取的工作表' });
      const json = XLSX.utils.sheet_to_json(sheet, { header: 1, blankrows: false, defval: '' });
      for (const row of json) {
        const cells = (row || []).map((cell) => String(cell ?? '').trim());
        const first = cells[0] || '';
        if (!first || /^(用户名|username|学号)$/i.test(first)) continue;
        rows.push({ username: first, displayName: cells[1] || first, password: cells[2] || '' });
      }
    } catch (error) {
      return res.status(400).json({ message: 'Excel 解析失败：' + error.message });
    }
  } else {
    // 兼容纯文本粘贴（历史接口）
    const csv = String(req.body.csv || '').replace(/\r/g, '');
    if (!csv.trim()) return res.status(400).json({ message: '请上传填好的 Excel 文件' });
    for (const line of csv.split('\n')) {
      const parts = line.split(',').map((part) => part.trim());
      if (!parts[0] || /^(用户名|username)\s*,/i.test(line)) continue;
      rows.push({ username: parts[0], password: parts[1] || '', displayName: parts.slice(2).join(' ') || parts[0] });
    }
  }

  if (rows.length === 0) return res.status(400).json({ message: '文件中没有学生数据，请按模板填写' });

  const result = { added: 0, joined: 0, skipped: [] };
  db.exec('BEGIN');
  try {
    for (const item of rows) {
      const { username, displayName, password } = item;
      const line = `${username} / ${displayName}`;
      if (username.length > 32) {
        result.skipped.push({ line, reason: '用户名超过 32 个字符' });
        continue;
      }
      let student = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (student && student.role !== 'student') {
        result.skipped.push({ line, reason: '该用户名属于教师账号' });
        continue;
      }
      if (!student) {
        if (password.length < 6) {
          result.skipped.push({ line, reason: '新账号初始密码至少 6 位' });
          continue;
        }
        const inserted = db
          .prepare('INSERT INTO users (role, username, password, display_name, created_at) VALUES (?, ?, ?, ?, ?)')
          .run('student', username, hashPassword(password), displayName || username, new Date().toISOString());
        student = db.prepare('SELECT * FROM users WHERE id = ?').get(inserted.lastInsertRowid);
        result.added += 1;
      }
      const member = db
        .prepare('SELECT id FROM class_members WHERE class_id = ? AND student_id = ?')
        .get(classId, student.id);
      if (member) {
        result.skipped.push({ line, reason: '该学生已在本班中' });
        continue;
      }
      db.prepare('INSERT INTO class_members (class_id, student_id, joined_at) VALUES (?, ?, ?)').run(
        classId,
        student.id,
        new Date().toISOString(),
      );
      result.joined += 1;
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    return res.status(500).json({ message: '导入失败：' + error.message });
  }

  res.json({ result });
});

router.get('/:id/students/export', (req, res) => {
  const classId = parseId(req.params.id);
  if (!classId) return res.status(400).json({ message: '班级编号无效' });
  const classRow = db
    .prepare('SELECT * FROM classes WHERE id = ? AND teacher_id = ?')
    .get(classId, req.user.id);
  if (!classRow) return res.status(404).json({ message: '班级不存在或无权访问' });

  const students = db
    .prepare(
      `SELECT u.username, u.display_name FROM class_members m JOIN users u ON u.id = m.student_id
       WHERE m.class_id = ? ORDER BY u.id`,
    )
    .all(classId);

  const sheet = XLSX.utils.json_to_sheet(
    students.map((item) => ({ 用户名: item.username, 姓名: item.display_name })),
    { header: ['用户名', '姓名'] },
  );
  sheet['!cols'] = [{ wch: 18 }, { wch: 14 }];
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, '学生名单');
  const buffer = XLSX.write(book, { type: 'buffer', bookType: 'xlsx' });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename*=UTF-8''${encodeURIComponent(`${classRow.name}-学生名单.xlsx`)}`,
  );
  res.send(buffer);
});

export { router as classesRouter, serializeClass };
