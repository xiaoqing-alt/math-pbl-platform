import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, getToken, formatDate, API_BASE } from '../../api';
import type { AssignmentBrief, ClassInfo, ClassReport, StudentInfo } from '../../types';
import { BoardBadge, EmptyState, StatusBadge } from '../../components/Bits';
import ReportView from '../../components/ReportView';

interface ClassDetailResponse {
  class: ClassInfo;
  students: StudentInfo[];
  assignments: AssignmentBrief[];
}

export default function ClassDetail() {
  const { id } = useParams();
  const classId = Number(id);
  const [data, setData] = useState<ClassDetailResponse | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('123456');
  const [displayName, setDisplayName] = useState('');
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [reportAssignment, setReportAssignment] = useState<number | ''>('');
  const [report, setReport] = useState<ClassReport | null>(null);
  const [reportTitle, setReportTitle] = useState('');

  async function load() {
    try {
      const result = await api<ClassDetailResponse>(`/classes/${classId}`);
      setData(result);
      const published = result.assignments.filter((item) => item.status === 'published');
      if (!reportAssignment && published.length > 0) setReportAssignment(published[0].id);
    } catch (err: any) {
      setError(err.message || '加载班级失败');
    }
  }

  useEffect(() => {
    load();
  }, [classId]);

  async function addStudent(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    try {
      const result = await api<{ student: StudentInfo & { isNewAccount: boolean } }>(
        `/classes/${classId}/students`,
        { method: 'POST', body: { username, password, displayName } },
      );
      setMessage(
        result.student.isNewAccount
          ? `已创建学生账号「${result.student.username}」并加入班级`
          : `已把「${result.student.displayName}」加入班级`,
      );
      setUsername('');
      setDisplayName('');
      await load();
    } catch (err: any) {
      setError(err.message || '添加学生失败');
    }
  }

  async function removeStudent(student: StudentInfo) {
    if (!window.confirm(`确定把「${student.displayName}」移出班级吗？学生账号仍会保留。`)) return;
    try {
      await api(`/classes/${classId}/students/${student.id}`, { method: 'DELETE' });
      setMessage(`已将「${student.displayName}」移出班级`);
      await load();
    } catch (err: any) {
      setError(err.message || '移除失败');
    }
  }

  async function importStudents() {
    setError('');
    setMessage('');
    if (!importFile) {
      setError('请先选择填好的 Excel 文件');
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', importFile);
      const response = await fetch(`${API_BASE}/classes/${classId}/students/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || '导入失败');
      const info = payload.result as { added: number; joined: number; skipped: { line: string; reason: string }[] };
      setMessage(`导入完成：新建账号 ${info.added} 人，加入班级 ${info.joined} 人，跳过 ${info.skipped.length} 行`);
      if (info.skipped.length > 0) {
        setError(info.skipped.map((item) => `${item.line}：${item.reason}`).join('；'));
      }
      setImportFile(null);
      await load();
    } catch (err: any) {
      setError(err.message || '导入失败');
    } finally {
      setImporting(false);
    }
  }

  async function downloadTemplate() {
    setError('');
    try {
      const response = await fetch(`${API_BASE}/classes/${classId}/students/template`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error('模板下载失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${data?.class.name || '班级'}-学生导入模板.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || '模板下载失败');
    }
  }

  async function exportStudents() {
    try {
      const response = await fetch(`${API_BASE}/classes/${classId}/students/export`, {
        headers: { Authorization: `Bearer ${getToken()}` },
      });
      if (!response.ok) throw new Error('导出失败');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${data?.class.name || '班级'}-学生名单.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || '导出失败');
    }
  }

  async function loadReport() {
    if (!reportAssignment) return;
    setError('');
    try {
      const result = await api<{ assignment: { taskTitle: string }; report: ClassReport }>(
        `/assignments/${reportAssignment}/report`,
      );
      setReport(result.report);
      setReportTitle(result.assignment.taskTitle);
    } catch (err: any) {
      setError(err.message || '加载分析报告失败');
    }
  }

  if (!data) {
    return <div className="empty-state">{error || '正在加载班级信息…'}</div>;
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link className="text-btn" to="/teacher/classes">
            ← 返回班级列表
          </Link>
          <h1>{data.class.name}</h1>
          <p>
            {data.class.grade || '未设置年级'} · {data.students.length} 名学生 · 已发布 {data.assignments.filter((item) => item.status === 'published').length} 个任务
          </p>
        </div>
        <div className="page-actions">
          <button className="outline-btn" type="button" onClick={exportStudents}>
            导出名单
          </button>
          <button className="outline-btn" type="button" onClick={() => setShowImport(!showImport)}>
            {showImport ? '收起导入' : '批量导入'}
          </button>
          <button className="primary-btn" type="button" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? '收起' : '添加学生'}
          </button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {showAdd && (
        <form className="panel create-panel" onSubmit={addStudent}>
          <div className="section-title">
            <h2>添加学生</h2>
            <span className="muted small-text">用户名全局唯一，支持中文、字母与数字</span>
          </div>
          <div className="grid-3">
            <label className="field">
              <span>用户名</span>
              <input value={username} onChange={(event) => setUsername(event.target.value)} placeholder="例如：李小明 或 lixm01" />
            </label>
            <label className="field">
              <span>姓名</span>
              <input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="学生姓名" />
            </label>
            <label className="field">
              <span>初始密码</span>
              <input value={password} onChange={(event) => setPassword(event.target.value)} placeholder="至少 6 位" />
            </label>
          </div>
          <p className="muted small-text">若用户名已存在且为学生账号，将直接把该学生加入班级，无需重复设置密码。</p>
          <div className="editor-actions">
            <button className="primary-btn" type="submit">
              添加学生
            </button>
          </div>
        </form>
      )}

      {showImport && (
        <div className="panel create-panel">
          <div className="section-title">
            <h2>批量导入学生名单</h2>
            <span className="muted small-text">下载 Excel 模板 → 填写 → 上传导入</span>
          </div>
          <ol className="muted small-text" style={{ margin: '0 0 12px 18px', lineHeight: 2 }}>
            <li>点击「下载 Excel 模板」，用 Excel / WPS 打开；</li>
            <li>按列填写：用户名、姓名、初始密码（新账号密码至少 6 位）；</li>
            <li>保存后上传该文件，系统自动创建账号并加入本班。</li>
          </ol>
          <div className="page-actions" style={{ marginBottom: 12 }}>
            <button className="outline-btn" type="button" onClick={downloadTemplate}>
              下载 Excel 模板
            </button>
          </div>
          <label className="field">
            <span>选择填好的 Excel 文件（.xlsx / .xls / .csv）</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={(event) => setImportFile(event.target.files?.[0] || null)}
            />
          </label>
          {importFile && <p className="muted small-text">已选择：{importFile.name}</p>}
          <div className="editor-actions">
            <button className="primary-btn" type="button" onClick={importStudents} disabled={importing || !importFile}>
              {importing ? '导入中…' : '开始导入'}
            </button>
          </div>
        </div>
      )}

      <div className="dashboard-grid">
        <div className="panel list-card">
          <div className="section-title">
            <h2>学生名单</h2>
            <span className="muted small-text">{data.students.length} 人</span>
          </div>
          {data.students.length === 0 ? (
            <EmptyState>还没有学生，请添加学生账号或批量导入名单。</EmptyState>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>姓名</th>
                    <th>用户名</th>
                    <th>加入时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.students.map((student) => (
                    <tr key={student.id}>
                      <td>{student.displayName}</td>
                      <td className="muted">{student.username}</td>
                      <td className="muted small-text">{formatDate(student.joinedAt)}</td>
                      <td>
                        <button className="tiny-btn" type="button" onClick={() => removeStudent(student)}>
                          移出班级
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="panel list-card">
          <div className="section-title">
            <h2>班级任务</h2>
            <Link className="text-btn" to="/teacher/tasks">
              去发布任务
            </Link>
          </div>
          {data.assignments.length === 0 ? (
            <EmptyState>这个班级还没有发布任务。进入任务单编辑页即可发布。</EmptyState>
          ) : (
            data.assignments.map((item) => (
              <div className="list-row" key={item.id}>
                <div className="list-main">
                  <strong>{item.taskTitle}</strong>
                  <small>
                    <BoardBadge board={item.board || 'algebra'} /> {item.status === 'published' ? '已发布' : '已撤回'}
                    {item.dueAt ? ` · 截止 ${formatDate(item.dueAt)}` : ''}
                  </small>
                </div>
                <div className="list-meta">
                  <span>
                    {item.submittedCount}/{item.studentCount} 份
                  </span>
                  <Link className="ghost-btn small" to={`/teacher/assignments/${item.id}`}>
                    批阅
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="report-panel">
        <div className="section-title">
          <h2>成果分析报告</h2>
          <div className="page-actions">
            <select
              className="input"
              style={{ width: 260 }}
              value={reportAssignment}
              onChange={(event) => {
                setReportAssignment(event.target.value ? Number(event.target.value) : '');
                setReport(null);
              }}
            >
              <option value="">选择已发布任务</option>
              {data.assignments
                .filter((item) => item.status === 'published')
                .map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.taskTitle}
                  </option>
                ))}
            </select>
            <button className="primary-btn" type="button" onClick={loadReport} disabled={!reportAssignment}>
              生成分析
            </button>
          </div>
        </div>

        {report ? (
          <>
            <p className="muted small-text" style={{ marginBottom: 14 }}>
              任务：{reportTitle} · 依据任务单评价标准与提交内容自动分析
            </p>
            <ReportView report={report} />
          </>
        ) : (
          <EmptyState>选择一项已发布任务，点击「生成分析」查看班级提交情况与学习分析。</EmptyState>
        )}
      </div>
    </div>
  );
}
