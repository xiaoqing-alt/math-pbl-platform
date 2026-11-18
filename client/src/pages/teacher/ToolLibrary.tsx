import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { BOARD_META, BOARD_OPTIONS, API_BASE, api, getToken } from '../../api';
import { EmptyState, Modal } from '../../components/Bits';
import { ToolFrame } from '../../components/AiTools';
import type { Board, ToolInfo } from '../../types';

const CATEGORY_LABEL: Record<string, string> = {
  inquiry: '交互探究教具',
  assist: '辅助工具',
};

export default function ToolLibrary() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [category, setCategory] = useState<'all' | 'inquiry' | 'assist'>('all');
  const [board, setBoard] = useState<'all' | Board>('all');
  const [keyword, setKeyword] = useState('');
  const [preview, setPreview] = useState<ToolInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [form, setForm] = useState({
    name: '',
    description: '',
    category: 'inquiry' as 'inquiry' | 'assist',
    boards: [] as Board[],
    file: null as File | null,
  });

  async function loadTools() {
    try {
      const data = await api<{ tools: ToolInfo[] }>('/tools');
      setTools(data.tools);
    } catch (err: any) {
      setError(err.message || '工具加载失败');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTools();
  }, []);

  function toggleBoard(value: Board) {
    setForm((current) => ({
      ...current,
      boards: current.boards.includes(value)
        ? current.boards.filter((item) => item !== value)
        : [...current.boards, value],
    }));
  }

  async function upload(event: React.FormEvent) {
    event.preventDefault();
    setError('');
    setMessage('');
    if (!form.name.trim()) return setError('请填写工具名称');
    if (!form.file) return setError('请选择 HTML 文件');
    setUploading(true);
    try {
      const body = new FormData();
      body.append('name', form.name.trim());
      body.append('description', form.description.trim());
      body.append('category', form.category);
      body.append('boards', form.boards.join(','));
      body.append('file', form.file);
      const token = getToken();
      const response = await fetch(`${API_BASE}/tools`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body,
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) throw new Error((data && data.message) || '上传失败');
      setMessage('上传成功，已保存到平台，可在任意任务单中勾选使用');
      setForm({ name: '', description: '', category: 'inquiry', boards: [], file: null });
      await loadTools();
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  }

  async function removeTool(tool: ToolInfo) {
    if (!window.confirm(`确定删除工具「${tool.name}」吗？已引用它的任务单将不再显示该工具。`)) return;
    setError('');
    try {
      await api(`/tools/${tool.key}`, { method: 'DELETE' });
      setMessage('已删除');
      await loadTools();
    } catch (err: any) {
      setError(err.message || '删除失败');
    }
  }

  const filtered = tools.filter((tool) => {
    if (category !== 'all' && tool.category !== category) return false;
    if (board !== 'all' && !tool.boards.includes(board)) return false;
    if (keyword) {
      const haystack = `${tool.name}${tool.description}`.toLowerCase();
      if (!haystack.includes(keyword.toLowerCase())) return false;
    }
    return true;
  });

  const inquiryCount = tools.filter((tool) => tool.category === 'inquiry').length;
  const mineCount = tools.filter((tool) => !tool.builtin).length;

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>交互探究工具库</h1>
          <p>拖动、滑动、反复试验的数学探究教具，可嵌入任意任务单；也可以上传自己制作的 HTML 教具。</p>
        </div>
        <div className="page-actions">
          <Link className="outline-btn" to="/teacher/tasks">
            我的任务单
          </Link>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="tool-stats">
        <div className="stat-card">
          <strong>{inquiryCount}</strong>
          <span>交互探究教具</span>
        </div>
        <div className="stat-card">
          <strong>{tools.length - inquiryCount}</strong>
          <span>辅助工具</span>
        </div>
        <div className="stat-card">
          <strong>{mineCount}</strong>
          <span>我上传的教具</span>
        </div>
        <div className="stat-card note">
          <strong>永久保存</strong>
          <span>上传的文件保存在平台服务器，刷新或重启后仍可继续使用</span>
        </div>
      </div>

      <div className="tool-toolbar">
        <div className="segmented">
          {(['all', 'inquiry', 'assist'] as const).map((value) => (
            <button
              key={value}
              type="button"
              className={category === value ? 'active' : ''}
              onClick={() => setCategory(value)}
            >
              {value === 'all' ? '全部' : CATEGORY_LABEL[value]}
            </button>
          ))}
        </div>
        <label className="field inline-field">
          <span>板块</span>
          <select value={board} onChange={(event) => setBoard(event.target.value as typeof board)}>
            <option value="all">全部板块</option>
            {BOARD_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {BOARD_META[item].name}
              </option>
            ))}
          </select>
        </label>
        <input
          className="input tool-search"
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          placeholder="搜索工具名称"
        />
      </div>

      {loading ? (
        <div className="empty-state">正在加载工具库…</div>
      ) : filtered.length === 0 ? (
        <EmptyState>没有符合条件的工具，换个筛选条件试试。</EmptyState>
      ) : (
        <div className="tool-grid">
          {filtered.map((tool) => (
            <div className={`tool-tile${tool.category === 'inquiry' ? ' inquiry' : ''}`} key={tool.key}>
              <div className="tool-tile-head">
                <span className={`tool-kind${tool.category === 'inquiry' ? ' inquiry' : ''}`}>
                  {tool.category === 'inquiry' ? '探究教具' : '辅助工具'}
                </span>
                {!tool.builtin && <span className="tool-badge mine">我的</span>}
              </div>
              <h3>{tool.name}</h3>
              <p>{tool.description || '暂无说明'}</p>
              <div className="tool-boards">
                {tool.boards.map((item) => (
                  <span key={item}>{BOARD_META[item]?.name || item}</span>
                ))}
              </div>
              <div className="tool-tile-actions">
                <button className="outline-btn small" type="button" onClick={() => setPreview(tool)}>
                  立即预览
                </button>
                {!tool.builtin && (
                  <button className="ghost-btn small" type="button" onClick={() => removeTool(tool)}>
                    删除
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="editor-section tool-upload-panel">
        <h2>上传我的交互式教具</h2>
        <p className="muted small-text">
          上传单个 HTML 文件（≤2MB），可包含脚本与样式。教具运行在沙箱 iframe 中，不会读取平台账号信息；
          需要把探索结果写入学生作答时，点击“写入我的作答”即可。
        </p>
        <form onSubmit={upload}>
          <div className="grid-2">
            <label className="field">
              <span>工具名称</span>
              <input
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="例如：动态几何画板"
              />
            </label>
            <label className="field">
              <span>工具类型</span>
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value as 'inquiry' | 'assist' })}
              >
                <option value="inquiry">交互探究教具（拖动/滑杆/实验）</option>
                <option value="assist">辅助工具（计算/梳理/表达）</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>一句话说明</span>
            <input
              value={form.description}
              onChange={(event) => setForm({ ...form, description: event.target.value })}
              placeholder="说明学生能在这个教具里做什么、观察什么"
            />
          </label>
          <div className="field">
            <span>适用板块</span>
            <div className="board-checks">
              {BOARD_OPTIONS.map((item) => (
                <label key={item}>
                  <input type="checkbox" checked={form.boards.includes(item)} onChange={() => toggleBoard(item)} />
                  {BOARD_META[item].name}
                </label>
              ))}
            </div>
          </div>
          <label className="field">
            <span>HTML 文件</span>
            <input
              type="file"
              accept=".html,.htm"
              onChange={(event) => setForm({ ...form, file: event.target.files?.[0] || null })}
            />
          </label>
          <button className="primary-btn" type="submit" disabled={uploading}>
            {uploading ? '上传中…' : '上传并保存到工具库'}
          </button>
        </form>
      </div>

      <Modal open={Boolean(preview)} title={preview ? `预览 · ${preview.name}` : '预览'} onClose={() => setPreview(null)} wide>
        {preview && (
          <div>
            <p className="muted small-text">{preview.description}</p>
            <ToolFrame toolKey={preview.key} title={preview.name} />
            <p className="muted small-text" style={{ marginTop: 10 }}>
              学生端在任务单右侧「AI 辅助」中看到的是同一个页面；教师可先在这里体验交互效果。
            </p>
          </div>
        )}
      </Modal>
    </div>
  );
}
