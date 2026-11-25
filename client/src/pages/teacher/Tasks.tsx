import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, BOARD_META, BOARD_OPTIONS, formatDate } from '../../api';
import type { Board, Task } from '../../types';
import { BoardBadge, Modal } from '../../components/Bits';

interface TasksResponse {
  tasks: Task[];
}

export default function Tasks() {
  const navigate = useNavigate();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [title, setTitle] = useState('');
  const [board, setBoard] = useState<Board>('algebra');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const data = await api<TasksResponse>('/tasks');
      setTasks(data.tasks);
    } catch (err: any) {
      setError(err.message || '加载任务单失败');
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createTask(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setCreating(true);
    try {
      const data = await api<{ task: Task }>('/tasks', {
        method: 'POST',
        body: { title: title.trim() || '未命名任务单', board },
      });
      navigate(`/teacher/tasks/${data.task.id}`);
    } catch (err: any) {
      setError(err.message || '创建任务单失败');
    } finally {
      setCreating(false);
    }
  }

  async function removeTask(task: Task) {
    if (!window.confirm(`确定删除任务单「${task.title}」吗？删除后不可恢复。`)) return;
    setError('');
    setMessage('');
    try {
      await api(`/tasks/${task.id}`, { method: 'DELETE' });
      setMessage(`已删除任务单「${task.title}」`);
      await load();
    } catch (err: any) {
      setError(err.message || '删除失败');
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>我的任务单</h1>
          <p>这里的每一份任务单都是你的独立实例，可以自由编辑、发布与撤回。</p>
        </div>
        <div className="page-actions">
          <Link className="outline-btn" to="/teacher/templates">
            从模板复制
          </Link>
          <button className="primary-btn" type="button" onClick={() => setShowCreate(true)}>
            新建空白任务单
          </button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {tasks.length === 0 ? (
        <div className="empty-state">
          还没有任务单。你可以从官方模板库复制一份，或者新建一份空白任务单从零开始。
        </div>
      ) : (
        <div className="task-list">
          {tasks.map((task) => (
            <div className="task-row" key={task.id}>
              <div className="task-main">
                <div className="task-title-line">
                  <h3>{task.title}</h3>
                  <BoardBadge board={task.board} />
                  {task.templateId ? (
                    <span className="official-badge">来自官方模板</span>
                  ) : (
                    <span className="status-badge pending">自建任务单</span>
                  )}
                </div>
                <div className="task-sub">
                  {task.projectType || '项目式学习'} · {task.grade || '未设置年级'} · 更新于 {formatDate(task.updatedAt)}
                  {task.assignmentCount ? ` · 已发布到 ${task.assignmentCount} 个班级` : ''}
                  {task.submissionCount ? ` · 收到 ${task.submissionCount} 份提交` : ''}
                </div>
              </div>
              <div className="task-actions">
                <button className="ghost-btn" type="button" onClick={() => removeTask(task)}>
                  删除
                </button>
                <Link className="primary-btn" to={`/teacher/tasks/${task.id}`}>
                  编辑与发布
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={showCreate} title="新建空白任务单" onClose={() => setShowCreate(false)}>
        <form onSubmit={createTask}>
          <label className="field">
            <span>任务单标题</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="例如：校园测量项目"
              autoFocus
            />
          </label>
          <label className="field">
            <span>数学板块</span>
            <select value={board} onChange={(event) => setBoard(event.target.value as Board)}>
              {BOARD_OPTIONS.map((item) => (
                <option key={item} value={item}>
                  {BOARD_META[item].name}
                </option>
              ))}
            </select>
          </label>
          <div className="alert info">创建后可以补充学习目标、任务描述、项目进程、评价标准和参考范例。</div>
          <div className="modal-actions">
            <button className="outline-btn" type="button" onClick={() => setShowCreate(false)}>
              取消
            </button>
            <button className="primary-btn" type="submit" disabled={creating}>
              {creating ? '创建中…' : '创建并进入编辑'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
