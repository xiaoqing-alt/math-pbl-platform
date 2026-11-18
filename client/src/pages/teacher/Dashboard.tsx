import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, formatDate } from '../../api';
import type { ClassInfo, Task } from '../../types';
import { BoardBadge } from '../../components/Bits';

interface ClassesResponse {
  classes: ClassInfo[];
}
interface TasksResponse {
  tasks: Task[];
}

export default function TeacherDashboard() {
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [classData, taskData] = await Promise.all([
          api<ClassesResponse>('/classes'),
          api<TasksResponse>('/tasks'),
        ]);
        if (!active) return;
        setClasses(classData.classes);
        setTasks(taskData.tasks);
      } catch (err: any) {
        if (active) setError(err.message || '加载失败');
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  const publishedCount = tasks.reduce((sum, item) => sum + (item.assignmentCount || 0), 0);
  const submissionCount = tasks.reduce((sum, item) => sum + (item.submissionCount || 0), 0);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>教师工作台</h1>
          <p>从官方模板出发，构建属于你班级的项目式学习任务。</p>
        </div>
        <div className="page-actions">
          <Link className="outline-btn" to="/teacher/classes">
            班级管理
          </Link>
          <Link className="primary-btn" to="/teacher/templates">
            浏览官方模板库
          </Link>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}

      <div className="stat-grid">
        <div className="stat-card">
          <div className="stat-label">我的班级</div>
          <div className="stat-value">{classes.length}</div>
          <div className="stat-foot">共 {classes.reduce((sum, item) => sum + item.studentCount, 0)} 名学生</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">我的任务单</div>
          <div className="stat-value">{tasks.length}</div>
          <div className="stat-foot">包含复制模板与自建任务单</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">已发布任务</div>
          <div className="stat-value">{publishedCount}</div>
          <div className="stat-foot">发布到不同班级的次数</div>
        </div>
        <div className="stat-card">
          <div className="stat-label">学生提交</div>
          <div className="stat-value">{submissionCount}</div>
          <div className="stat-foot">可进入批阅页查看详情</div>
        </div>
      </div>

      <div className="dashboard-grid">
        <div className="panel list-card">
          <div className="section-title">
            <h2>最近编辑的任务单</h2>
            <Link className="text-btn" to="/teacher/tasks">
              查看全部
            </Link>
          </div>
          {loading && <p className="muted">正在加载…</p>}
          {!loading && tasks.length === 0 && (
            <div className="empty-state">还没有任务单，先去官方模板库复制一份，或者新建空白任务单。</div>
          )}
          {tasks.slice(0, 5).map((task) => (
            <div className="list-row" key={task.id}>
              <div className="list-main">
                <strong>{task.title}</strong>
                <small>
                  {task.projectType || '项目式学习'} · 更新于 {formatDate(task.updatedAt)}
                </small>
              </div>
              <div className="list-meta">
                <BoardBadge board={task.board} />
                <Link className="ghost-btn small" to={`/teacher/tasks/${task.id}`}>
                  编辑
                </Link>
              </div>
            </div>
          ))}
        </div>

        <div className="panel list-card">
          <div className="section-title">
            <h2>我的班级</h2>
            <Link className="text-btn" to="/teacher/classes">
              管理班级
            </Link>
          </div>
          {!loading && classes.length === 0 && <div className="empty-state">还没有班级，先创建一个班级并添加学生。</div>}
          {classes.slice(0, 5).map((item) => (
            <div className="list-row" key={item.id}>
              <div className="list-main">
                <strong>{item.name}</strong>
                <small>{item.grade || '未设置年级'} · {item.studentCount} 名学生</small>
              </div>
              <div className="list-meta">
                <Link className="ghost-btn small" to={`/teacher/classes/${item.id}`}>
                  进入班级
                </Link>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
