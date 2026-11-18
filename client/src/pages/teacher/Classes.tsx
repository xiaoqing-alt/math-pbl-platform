import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../../api';
import type { ClassInfo } from '../../types';

interface ClassesResponse {
  classes: ClassInfo[];
}

export default function Classes() {
  const navigate = useNavigate();
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [grade, setGrade] = useState('八年级');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const load = async () => {
    try {
      const data = await api<ClassesResponse>('/classes');
      setClasses(data.classes);
    } catch (err: any) {
      setError(err.message || '加载班级失败');
    }
  };

  useEffect(() => {
    load();
  }, []);

  async function createClass(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await api<{ class: ClassInfo }>('/classes', {
        method: 'POST',
        body: { name, grade },
      });
      setMessage(`班级「${data.class.name}」已创建`);
      setName('');
      setShowCreate(false);
      await load();
      navigate(`/teacher/classes/${data.class.id}`);
    } catch (err: any) {
      setError(err.message || '创建班级失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>班级管理</h1>
          <p>创建班级、维护学生名单，并把任务单发布到指定班级。</p>
        </div>
        <div className="page-actions">
          <button className="primary-btn" type="button" onClick={() => setShowCreate(!showCreate)}>
            {showCreate ? '收起' : '新建班级'}
          </button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      {showCreate && (
        <form className="panel create-panel" onSubmit={createClass}>
          <div className="section-title">
            <h2>新建班级</h2>
          </div>
          <div className="grid-2">
            <label className="field">
              <span>班级名称</span>
              <input value={name} onChange={(event) => setName(event.target.value)} placeholder="例如：八年级(1)班" />
            </label>
            <label className="field">
              <span>年级</span>
              <input value={grade} onChange={(event) => setGrade(event.target.value)} placeholder="例如：八年级" />
            </label>
          </div>
          <div className="editor-actions">
            <button className="primary-btn" type="submit" disabled={loading}>
              {loading ? '创建中…' : '创建班级'}
            </button>
          </div>
        </form>
      )}

      {classes.length === 0 ? (
        <div className="empty-state">还没有班级。创建一个班级后，就可以添加学生账号并发布任务单。</div>
      ) : (
        <div className="class-grid">
          {classes.map((item) => (
            <div className="class-card" key={item.id}>
              <div className="template-head">
                <h3>{item.name}</h3>
                <span className="status-badge submitted">{item.studentCount} 人</span>
              </div>
              <div className="class-meta">{item.grade || '未设置年级'}</div>
              <div className="class-meta">已发布 {item.assignmentCount} 个任务</div>
              <div className="class-foot">
                <span className="muted small-text">班级编号 #{item.id}</span>
                <Link className="primary-btn small" to={`/teacher/classes/${item.id}`}>
                  进入班级
                </Link>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
