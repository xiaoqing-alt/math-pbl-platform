import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, BOARD_META, BOARD_OPTIONS, formatDate, getUser } from '../../api';
import type { Board, ClassInfo, StudentTaskCard } from '../../types';
import { BoardBadge, EmptyState, StatusBadge } from '../../components/Bits';

interface SummaryResponse {
  classes: (ClassInfo & { teacherName: string })[];
  stats: { published: number; pending: number; submitted: number; graded: number };
}

interface TasksResponse {
  tasks: StudentTaskCard[];
}

function submissionStatus(task: StudentTaskCard): string {
  if (task.submission?.gradedAt) return 'graded';
  if (task.submission?.status === 'submitted') return 'submitted';
  if (task.submission?.status === 'draft') return 'draft';
  return 'pending';
}

export default function StudentHome() {
  const user = getUser();
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [tasks, setTasks] = useState<StudentTaskCard[]>([]);
  const [board, setBoard] = useState<Board | 'all'>('all');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [summaryData, taskData] = await Promise.all([
          api<SummaryResponse>('/student/summary'),
          api<TasksResponse>('/student/tasks'),
        ]);
        if (!active) return;
        setSummary(summaryData);
        setTasks(taskData.tasks);
      } catch (err: any) {
        if (active) setError(err.message || '加载学习任务失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const visible = board === 'all' ? tasks : tasks.filter((task) => task.board === board);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>你好，{user?.displayName || '同学'}</h1>
          <p>这里是你所在班级的项目式学习任务。打开任务单，完成探究并提交成果。</p>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {loading && <p className="muted">正在加载…</p>}

      
      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">布置给我的任务</div>
          <div className="stat-value">{summary?.stats.published ?? 0}</div>
          <div className="stat-foot">来自 {summary?.classes.length ?? 0} 个班级</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">待完成</div>
          <div className="stat-value">{summary?.stats.pending ?? 0}</div>
          <div className="stat-foot">尚未提交或仅有草稿</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">已提交</div>
          <div className="stat-value">{summary?.stats.submitted ?? 0}</div>
          <div className="stat-foot">等待教师批阅</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">已批阅</div>
          <div className="stat-value">{summary?.stats.graded ?? 0}</div>
          <div className="stat-foot">可查看教师评分与评语</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel list-card">
          <div className="section-title">
            <h2>我的任务</h2>
            <span className="muted small-text">{visible.length} 项</span>
          </div>

          <div className="board-tabs">
            <button
              className={`board-tab${board === 'all' ? ' active' : ''}`}
              type="button"
              onClick={() => setBoard('all')}
            >
              全部
            </button>
            {BOARD_OPTIONS.map((item) => (
              <button
                key={item}
                className={`board-tab${board === item ? ' active' : ''}`}
                type="button"
                onClick={() => setBoard(item)}
              >
                {BOARD_META[item].icon} {BOARD_META[item].name}
              </button>
            ))}
          </div>

          {!loading && visible.length === 0 && (
            <EmptyState>当前没有任务。等老师发布任务后，这里会出现任务单。</EmptyState>
          )}

          <div className="task-list">
            {visible.map((task) => (
              <div className="task-row" key={task.assignmentId}>
                <div className="task-main">
                  <div className="task-title-line">
                    <h3>{task.title}</h3>
                    <BoardBadge board={task.board} />
                    <StatusBadge status={submissionStatus(task)} />
                  </div>
                  <div className="task-sub">
                    {task.teacherName} · {task.className} · {task.projectType || '项目式学习'}
                    {task.dueAt ? ` · 截止 ${formatDate(task.dueAt)}` : ''}
                  </div>
                </div>
                <div className="list-meta">
                  {task.submission?.gradedAt && task.submission.score !== null && (
                    <span className="status-badge graded">{task.submission.score}分</span>
                  )}
                  <Link className="primary-btn small" to={`/student/tasks/${task.assignmentId}`}>
                    {submissionStatus(task) === 'pending' ? '开始完成' : '进入任务'}
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel list-card">
          <div className="section-title">
            <h2>我的班级</h2>
          </div>
          {(summary?.classes || []).map((item) => (
            <div className="list-row" key={item.id}>
              <div className="list-main">
                <strong>{item.name}</strong>
                <small>{item.teacherName} · {item.grade || '未设置年级'}</small>
              </div>
              <span className="muted small-text">#{item.id}</span>
            </div>
          ))}
          {summary && summary.classes.length === 0 && <EmptyState>还没有加入班级，请联系教师。</EmptyState>}
        </div>
      </div>
    </div>
  );
}
