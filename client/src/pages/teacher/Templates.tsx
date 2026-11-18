import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, BOARD_META, BOARD_OPTIONS } from '../../api';
import type { Board, Task, Template } from '../../types';
import { BoardBadge, Modal } from '../../components/Bits';
import TaskContentView from '../../components/TaskContentView';

interface TemplatesResponse {
  templates: Template[];
}

export default function Templates() {
  const navigate = useNavigate();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [board, setBoard] = useState<Board | 'all'>('all');
  const [preview, setPreview] = useState<Template | null>(null);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [copying, setCopying] = useState<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const data = await api<TemplatesResponse>('/templates');
        setTemplates(data.templates);
      } catch (err: any) {
        setError(err.message || '加载模板库失败');
      }
    })();
  }, []);

  async function copyTemplate(template: Template) {
    setError('');
    setCopying(template.id);
    try {
      const data = await api<{ task: Task }>(`/templates/${template.id}/copy`, { method: 'POST', body: {} });
      setMessage(`已复制「${template.title}」，原始模板保持不变`);
      navigate(`/teacher/tasks/${data.task.id}`);
    } catch (err: any) {
      setError(err.message || '复制模板失败');
    } finally {
      setCopying(null);
    }
  }

  const visible = board === 'all' ? templates : templates.filter((item) => item.board === board);

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>官方模板库</h1>
          <p>团队预设的优质项目式学习任务单。原始模板只读，复制后就是你自己的任务单副本。</p>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="board-tabs">
        <button
          className={`board-tab${board === 'all' ? ' active' : ''}`}
          type="button"
          onClick={() => setBoard('all')}
        >
          全部模板
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

      {visible.length === 0 ? (
        <div className="empty-state">该板块暂无模板</div>
      ) : (
        <div className="template-grid">
          {visible.map((template) => (
            <div className="template-card" key={template.id}>
              <div className="template-head">
                <BoardBadge board={template.board} />
                <span className="official-badge">官方 · 只读</span>
              </div>
              <h3>{template.title}</h3>
              <p className="template-summary">{template.summary}</p>
              <div className="template-meta">
                {template.projectType} · {template.grade} · {template.duration}
              </div>
              <div className="template-foot">
                <button className="outline-btn small" type="button" onClick={() => setPreview(template)}>
                  查看模板
                </button>
                <button
                  className="primary-btn small"
                  type="button"
                  disabled={copying === template.id}
                  onClick={() => copyTemplate(template)}
                >
                  {copying === template.id ? '复制中…' : '复制并编辑'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        title={preview ? preview.title : ''}
        onClose={() => setPreview(null)}
        wide
      >
        {preview && (
          <>
            <div className="task-meta-line" style={{ marginBottom: 16 }}>
              <BoardBadge board={preview.board} />
              <span>项目类型：{preview.projectType || '—'}</span>
              <span>适用年级：{preview.grade || '—'}</span>
              <span>建议课时：{preview.duration || '—'}</span>
            </div>
            <div className="alert info">官方模板为只读内容，复制后生成的副本可自由编辑，不会影响原始模板。</div>
            <TaskContentView content={preview.content} />
            <div className="modal-actions">
              <button className="outline-btn" type="button" onClick={() => setPreview(null)}>
                关闭
              </button>
              <button className="primary-btn" type="button" onClick={() => copyTemplate(preview)}>
                复制并编辑
              </button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
