import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, BOARD_META, BOARD_OPTIONS, fileUrl, formatDate, formatFileSize, uploadFile, API_BASE, getToken } from '../../api';
import type { AiSkill, AssignmentBrief, Board, ClassInfo, Task, TaskContent, ToolInfo } from '../../types';

interface TaskDetailResponse {
  task: Task;
  assignments: AssignmentBrief[];
  availableSkills: AiSkill[];
}

interface ClassesResponse {
  classes: ClassInfo[];
}

export default function TaskEditor() {
  const { id } = useParams();
  const taskId = Number(id);
  const navigate = useNavigate();

  const [task, setTask] = useState<Task | null>(null);
  const [assignments, setAssignments] = useState<AssignmentBrief[]>([]);
  const [skills, setSkills] = useState<AiSkill[]>([]);
  const [classes, setClasses] = useState<ClassInfo[]>([]);
  const [publishClassId, setPublishClassId] = useState<number | ''>('');
  const [dueAt, setDueAt] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [aiSaving, setAiSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [uploadingCover, setUploadingCover] = useState(false);
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [toolForm, setToolForm] = useState({
    name: '',
    description: '',
    boards: [] as Board[],
    category: 'inquiry',
    file: null as File | null,
  });
  const [uploadingTool, setUploadingTool] = useState(false);

  async function loadTools() {
    const data = await api<{ tools: ToolInfo[] }>('/tools');
    setTools(data.tools);
  }

  async function uploadTool() {
    setError('');
    setMessage('');
    if (!toolForm.name.trim()) {
      setError('请填写工具名称');
      return;
    }
    if (!toolForm.file) {
      setError('请选择 HTML 文件');
      return;
    }
    setUploadingTool(true);
    try {
      const form = new FormData();
      form.append('name', toolForm.name.trim());
      form.append('description', toolForm.description.trim());
      form.append('boards', toolForm.boards.join(','));
      form.append('category', toolForm.category);
      form.append('file', toolForm.file);
      const response = await fetch(`${API_BASE}/tools`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${getToken()}` },
        body: form,
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || '上传失败');
      setToolForm({ name: '', description: '', boards: [], category: 'inquiry', file: null });
      setMessage('工具已上传，可在下方勾选使用');
      await loadTools();
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setUploadingTool(false);
    }
  }

  async function removeTool(key: string) {
    if (!window.confirm('删除这个工具？已使用该工具的任务单将不再显示它。')) return;
    try {
      await api(`/tools/${key}`, { method: 'DELETE' });
      setTools((current) => current.filter((tool) => tool.key !== key));
      patchContent({ toolKeys: (task?.content.toolKeys || []).filter((item) => item !== key) });
    } catch (err: any) {
      setError(err.message || '删除失败');
    }
  }

  async function loadTask() {
    const detail = await api<TaskDetailResponse>(`/tasks/${taskId}`);
    setTask(detail.task);
    setAssignments(detail.assignments);
    setSkills(detail.availableSkills);
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const [detail, classData, toolData] = await Promise.all([
          api<TaskDetailResponse>(`/tasks/${taskId}`),
          api<ClassesResponse>('/classes'),
          api<{ tools: ToolInfo[] }>('/tools'),
        ]);
        if (!active) return;
        setTask(detail.task);
        setAssignments(detail.assignments);
        setSkills(detail.availableSkills);
        setTools(toolData.tools);
        setClasses(classData.classes);
        if (classData.classes.length > 0) setPublishClassId(classData.classes[0].id);
      } catch (err: any) {
        if (active) setError(err.message || '加载任务单失败');
      }
    })();
    return () => {
      active = false;
    };
  }, [taskId]);

  function patchTask(partial: Partial<Task>) {
    setTask((current) => (current ? { ...current, ...partial } : current));
  }

  function patchContent(partial: Partial<TaskContent>) {
    setTask((current) =>
      current ? { ...current, content: { ...current.content, ...partial } } : current,
    );
  }

  if (!task) {
    return <div className="empty-state">{error || '正在加载任务单…'}</div>;
  }

  const content = task.content;
  const inquiryTools = tools.filter((tool) => tool.category === 'inquiry');
  const assistTools = tools.filter((tool) => tool.category !== 'inquiry');

  function renderToolCard(tool: ToolInfo) {
    return (
      <label className={`tool-card${(content.toolKeys || []).includes(tool.key) ? ' selected' : ''}`} key={tool.key}>
        <input
          type="checkbox"
          checked={(content.toolKeys || []).includes(tool.key)}
          onChange={(event) => {
            const current = content.toolKeys || [];
            patchContent({
              toolKeys: event.target.checked
                ? [...current, tool.key]
                : current.filter((item) => item !== tool.key),
            });
          }}
        />
        <div>
          <div className="tool-card-head">
            <strong>{tool.name}</strong>
            <span className={`tool-badge${tool.builtin ? '' : ' mine'}`}>{tool.builtin ? '内置' : '我的'}</span>
          </div>
          <p>{tool.description}</p>
          <div className="tool-boards">
            {tool.boards.map((board) => (
              <span key={board}>{BOARD_META[board]?.name || board}</span>
            ))}
          </div>
        </div>
        {!tool.builtin && (
          <button
            className="tiny-btn"
            type="button"
            onClick={(event) => {
              event.preventDefault();
              removeTool(tool.key);
            }}
          >
            删除
          </button>
        )}
      </label>
    );
  }

  async function saveTask() {
    if (!task) return;
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const data = await api<{ task: Task; availableSkills: AiSkill[] }>(`/tasks/${task.id}`, {
        method: 'PATCH',
        body: {
          title: task.title,
          board: task.board,
          projectType: task.projectType,
          grade: task.grade,
          duration: task.duration,
          summary: task.summary,
          coverImage: task.coverImage,
          content: task.content,
        },
      });
      setTask(data.task);
      setSkills(data.availableSkills);
      setMessage('已保存。AI辅助能力已根据最新任务单内容重新匹配。');
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function saveAi() {
    setError('');
    setMessage('');
    setAiSaving(true);
    try {
      const data = await api<{ task: Task; availableSkills: AiSkill[] }>(`/tasks/${taskId}/ai`, {
        method: 'PATCH',
        body: { aiEnabled: task.aiEnabled, aiSkills: task.aiSkills },
      });
      setTask(data.task);
      setSkills(data.availableSkills);
      setMessage(data.task.aiEnabled ? 'AI辅助已绑定到本任务单' : 'AI辅助已关闭');
    } catch (err: any) {
      setError(err.message || 'AI设置保存失败');
    } finally {
      setAiSaving(false);
    }
  }

  async function publish() {
    if (!publishClassId) {
      setError('请先选择要发布的班级');
      return;
    }
    setError('');
    setMessage('');
    setPublishing(true);
    try {
      const data = await api<{ assignment: AssignmentBrief; message: string }>(
        `/tasks/${taskId}/publish`,
        { method: 'POST', body: { classId: Number(publishClassId), dueAt } },
      );
      setMessage(data.message);
      await loadTask();
    } catch (err: any) {
      setError(err.message || '发布失败');
    } finally {
      setPublishing(false);
    }
  }

  async function withdraw(assignment: AssignmentBrief) {
    if (!window.confirm(`确定撤回在「${assignment.className}」的发布吗？学生将暂时看不到该任务。`)) return;
    setError('');
    try {
      await api(`/assignments/${assignment.id}/withdraw`, { method: 'POST' });
      setMessage('已撤回发布');
      await loadTask();
    } catch (err: any) {
      setError(err.message || '撤回失败');
    }
  }

  async function uploadCover(file: File | null) {
    if (!file) return;
    setError('');
    setUploadingCover(true);
    try {
      const uploaded = await uploadFile(file);
      patchTask({ coverImage: uploaded.url });
      setMessage('封面图已上传，保存后生效');
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setUploadingCover(false);
    }
  }

  async function uploadReferenceImage(index: number, file: File | null) {
    if (!file) return;
    setError('');
    try {
      const uploaded = await uploadFile(file);
      const references = content.references.map((item, itemIndex) =>
        itemIndex === index ? { ...item, images: [...item.images, uploaded.url] } : item,
      );
      patchContent({ references });
      setMessage('参考图片已上传，保存后生效');
    } catch (err: any) {
      setError(err.message || '上传失败');
    }
  }

  async function uploadReferenceFile(index: number, file: File | null) {
    if (!file) return;
    setError('');
    try {
      const uploaded = await uploadFile(file);
      const references = content.references.map((item, itemIndex) =>
        itemIndex === index
          ? { ...item, files: [...(item.files || []), { name: uploaded.name, url: uploaded.url, size: uploaded.size }] }
          : item,
      );
      patchContent({ references });
      setMessage('参考文件已上传，保存后生效');
    } catch (err: any) {
      setError(err.message || '上传失败');
    }
  }

  function toggleSkill(key: string) {
    const selected = task.aiSkills.includes(key)
      ? task.aiSkills.filter((item) => item !== key)
      : [...task.aiSkills, key];
    patchTask({ aiSkills: selected });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link className="text-btn" to="/teacher/tasks">
            ← 返回任务单列表
          </Link>
          <h1>{task.title}</h1>
          <p>
            {BOARD_META[task.board].name} · {task.templateId ? '来自官方模板的独立副本' : '教师自建任务单'} · 最后更新 {formatDate(task.updatedAt)}
          </p>
        </div>
        <div className="page-actions">
          <button className="outline-btn" type="button" onClick={() => navigate('/teacher/tasks')}>
            返回列表
          </button>
          <button className="primary-btn" type="button" onClick={saveTask} disabled={saving}>
            {saving ? '保存中…' : '保存任务单'}
          </button>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="editor-layout">
        <div className="editor-main">
          <div className="editor-section">
            <h2>基础信息</h2>
            <label className="field">
              <span>任务单标题</span>
              <input value={task.title} onChange={(event) => patchTask({ title: event.target.value })} />
            </label>
            <div className="grid-2">
              <label className="field">
                <span>数学板块</span>
                <select value={task.board} onChange={(event) => patchTask({ board: event.target.value as Board })}>
                  {BOARD_OPTIONS.map((item) => (
                    <option key={item} value={item}>
                      {BOARD_META[item].name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>项目类型</span>
                <input
                  value={task.projectType}
                  onChange={(event) => patchTask({ projectType: event.target.value })}
                  placeholder="例如：数学建模 / 几何探究 / 统计调查"
                />
              </label>
            </div>
            <div className="grid-2">
              <label className="field">
                <span>适用年级</span>
                <input value={task.grade} onChange={(event) => patchTask({ grade: event.target.value })} placeholder="例如：八年级" />
              </label>
              <label className="field">
                <span>建议课时</span>
                <input value={task.duration} onChange={(event) => patchTask({ duration: event.target.value })} placeholder="例如：3课时" />
              </label>
            </div>
            <label className="field">
              <span>任务简介</span>
              <textarea
                value={task.summary}
                onChange={(event) => patchTask({ summary: event.target.value })}
                rows={3}
                placeholder="用一两句话概括项目情境与核心任务。"
              />
            </label>
            <div className="field">
              <span>封面图（可选）</span>
              {task.coverImage && (
                <div style={{ marginBottom: 8, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <img
                    src={fileUrl(task.coverImage)}
                    alt="封面"
                    style={{ width: 160, height: 90, objectFit: 'cover', borderRadius: 10, border: '1px solid #e6e9f2' }}
                  />
                  <button className="tiny-btn" type="button" onClick={() => patchTask({ coverImage: '' })}>
                    移除封面
                  </button>
                </div>
              )}
              <input
                type="file"
                accept="image/*"
                disabled={uploadingCover}
                onChange={(event) => uploadCover(event.target.files?.[0] || null)}
              />
              {uploadingCover && <span className="muted small-text">上传中…</span>}
            </div>
          </div>

          <div className="editor-section">
            <h2>项目背景</h2>
            <p className="muted small-text">呈现真实情境与数据，让学生理解“为什么要做这个项目”。</p>
            <div className="prose-field">
              <textarea
                className="textarea tall prose-input"
                rows={10}
                value={content.background}
                onChange={(event) => patchContent({ background: event.target.value })}
                placeholder="例如：地球储水量丰富，但可直接利用的淡水资源仅占水资源总量的 0.3%……\n\n段落之间可空一行。"
              />
              <div className="prose-meta">
                <span>{content.background.replace(/\s/g, '').length} 字</span>
                <span>{content.background.split(/\n\s*\n/).filter((p) => p.trim()).length} 段</span>
                <span>段落之间空一行，展示时自动分段</span>
              </div>
            </div>
          </div>

          <div className="editor-section">
            <h2>涉及知识</h2>
            <p className="muted small-text">用逗号或换行分隔，学生端会以标签形式展示。</p>
            <textarea
              className="textarea knowledge-input"
              rows={3}
              value={(content.knowledgeTags || []).join('、')}
              onChange={(event) =>
                patchContent({
                  knowledgeTags: event.target.value
                    .split(/[、,，\n]/)
                    .map((item) => item.trim())
                    .filter(Boolean),
                })
              }
              placeholder="有理数运算、数据统计与调查、数学建模"
            />
            {(content.knowledgeTags || []).length > 0 && (
              <div className="tag-preview">
                {content.knowledgeTags.map((tag) => (
                  <span className="knowledge-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="editor-section">
            <h2>学习目标</h2>
            {content.objectives.map((objective, index) => (
              <div className="dynamic-item objective-item" key={index}>
                <span className="objective-index">{index + 1}</span>
                <div className="objective-body">
                  <div className="dynamic-item-head">
                    <span>目标 {index + 1}</span>
                    <button
                      className="tiny-btn"
                      type="button"
                      onClick={() => patchContent({ objectives: content.objectives.filter((_, i) => i !== index) })}
                    >
                      删除
                    </button>
                  </div>
                  <input
                    className="input"
                    value={objective}
                    onChange={(event) => {
                      const objectives = content.objectives.map((item, i) => (i === index ? event.target.value : item));
                      patchContent({ objectives });
                    }}
                    placeholder="例如：能用一次函数表示用水量与水费的关系"
                  />
                </div>
              </div>
            ))}
            <button className="add-btn" type="button" onClick={() => patchContent({ objectives: [...content.objectives, ''] })}>
              + 添加学习目标
            </button>
          </div>

          <div className="editor-section">
            <h2>任务描述</h2>
            <p className="muted small-text">写清驱动问题、成果形式与完成要求，可直接分条陈述。</p>
            <div className="prose-field">
              <textarea
                className="textarea tall prose-input"
                rows={12}
                value={content.description}
                onChange={(event) => patchContent({ description: event.target.value })}
                placeholder="描述项目情境、驱动问题与最终成果要求。"
              />
              <div className="prose-meta">
                <span>{content.description.replace(/\s/g, '').length} 字</span>
                <span>可分条陈述，段落之间空一行</span>
              </div>
            </div>
          </div>

          <div className="editor-section">
            <h2>实施步骤</h2>
            {content.steps.map((step, index) => (
              <div className="dynamic-item" key={index}>
                <div className="dynamic-item-head">
                  <span>步骤 {index + 1}</span>
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => patchContent({ steps: content.steps.filter((_, i) => i !== index) })}
                  >
                    删除
                  </button>
                </div>
                <input
                  className="input"
                  value={step.title}
                  onChange={(event) => {
                    const steps = content.steps.map((item, i) => (i === index ? { ...item, title: event.target.value } : item));
                    patchContent({ steps });
                  }}
                  placeholder="步骤名称"
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  className="textarea"
                  rows={6}
                  value={step.content}
                  onChange={(event) => {
                    const steps = content.steps.map((item, i) => (i === index ? { ...item, content: event.target.value } : item));
                    patchContent({ steps });
                  }}
                  placeholder="学生需要做什么？完成后应产出什么？"
                />
              </div>
            ))}
            <button
              className="add-btn"
              type="button"
              onClick={() => patchContent({ steps: [...content.steps, { title: '', content: '' }] })}
            >
              + 添加实施步骤
            </button>
          </div>

          <div className="editor-section">
            <h2>工具库</h2>
            <p className="muted small-text">
              勾选本任务单要用的工具（可多选）：交互探究教具用于拖动、滑动、反复试验；辅助工具用于计算、梳理与表达。学生端侧栏会加载对应页面，结果可一键写入作答。
            </p>
            <Link className="text-btn" to="/teacher/tools">
              前往交互探究工具库预览、上传与管理 →
            </Link>
              {tools.length === 0 && <p className="muted small-text">工具库加载中…</p>}
              {inquiryTools.length > 0 && (
                <>
                  <h3 className="tool-group-title">交互探究教具</h3>
                  <div className="tool-library">{inquiryTools.map((tool) => renderToolCard(tool))}</div>
                </>
              )}
              {assistTools.length > 0 && (
                <>
                  <h3 className="tool-group-title">辅助工具</h3>
                  <div className="tool-library">{assistTools.map((tool) => renderToolCard(tool))}</div>
                </>
              )}

              <details className="tool-upload">
                <summary>上传自己的 HTML 工具</summary>
                <label className="field">
                  <span>工具名称</span>
                  <input value={toolForm.name} onChange={(event) => setToolForm({ ...toolForm, name: event.target.value })} />
                </label>
                <label className="field">
                  <span>工具类型</span>
                  <select
                    value={toolForm.category}
                    onChange={(event) => setToolForm({ ...toolForm, category: event.target.value })}
                  >
                    <option value="inquiry">交互探究教具（拖动/滑杆/实验）</option>
                    <option value="assist">辅助工具（计算/梳理/表达）</option>
                  </select>
                </label>
                <label className="field">
                  <span>一句话说明</span>
                  <input
                    value={toolForm.description}
                    onChange={(event) => setToolForm({ ...toolForm, description: event.target.value })}
                    placeholder="学生在什么场景下使用这个工具？"
                  />
                </label>
                <div className="field">
                  <span>适用板块</span>
                  <div className="board-checks">
                    {BOARD_OPTIONS.map((board) => (
                      <label key={board}>
                        <input
                          type="checkbox"
                          checked={toolForm.boards.includes(board)}
                          onChange={(event) =>
                            setToolForm({
                              ...toolForm,
                              boards: event.target.checked
                                ? [...toolForm.boards, board]
                                : toolForm.boards.filter((item) => item !== board),
                            })
                          }
                        />
                        {BOARD_META[board]?.name || board}
                      </label>
                    ))}
                  </div>
                </div>
                <label className="field">
                  <span>HTML 文件（单文件，≤2MB，内联 CSS/JS）</span>
                  <input
                    type="file"
                    accept=".html,.htm"
                    onChange={(event) => setToolForm({ ...toolForm, file: event.target.files?.[0] || null })}
                  />
                </label>
                <p className="muted small-text">
                  工具运行在沙箱 iframe 中，不能读取平台登录信息；需要回写结果时调用
                  {' '}
                  <code>window.parent.postMessage({'{ type: "pbl-append", text }'}, "*")</code>。
                </p>
                <button className="outline-btn" type="button" onClick={uploadTool} disabled={uploadingTool}>
                  {uploadingTool ? '上传中…' : '上传到工具库'}
                </button>
              </details>
            </div>

          <div className="editor-section">
            <h2>项目进程（分阶段任务）</h2>
            <p className="muted small-text">
              每个阶段可包含任务清单、学生填写的表格列与作答提示；学生端会生成可填写的表格与作答框。
            </p>

            {content.stages.map((stage, index) => (
              <div className="dynamic-item" key={index}>
                <div className="dynamic-item-head">
                  <span>阶段 {index + 1}</span>
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => patchContent({ stages: content.stages.filter((_, i) => i !== index) })}
                  >
                    删除
                  </button>
                </div>
                <input
                  className="input"
                  value={stage.title}
                  placeholder="阶段标题，例如：阶段一：现象调查记录"
                  onChange={(event) => {
                    const stages = content.stages.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item,
                    );
                    patchContent({ stages });
                  }}
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  className="textarea"
                  rows={2}
                  value={stage.intro}
                  placeholder="阶段说明（可选）"
                  onChange={(event) => {
                    const stages = content.stages.map((item, i) =>
                      i === index ? { ...item, intro: event.target.value } : item,
                    );
                    patchContent({ stages });
                  }}
                />
                <label className="field" style={{ marginTop: 8 }}>
                  <span>本阶段要做的事（每行一条）</span>
                  <textarea
                    className="textarea"
                    rows={4}
                    value={stage.items.join('\n')}
                    onChange={(event) => {
                      const stages = content.stages.map((item, i) =>
                        i === index
                          ? { ...item, items: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean) }
                          : item,
                      );
                      patchContent({ stages });
                    }}
                    placeholder={'在家庭、学校观察并记录浪费水的现象\n统计各类现象出现的频次'}
                  />
                </label>
                <label className="field">
                  <span>学生填写表格的列（用逗号分隔，留空则不出表格）</span>
                  <input
                    className="input"
                    value={stage.columns.join(',')}
                    onChange={(event) => {
                      const stages = content.stages.map((item, i) =>
                        i === index
                          ? {
                              ...item,
                              columns: event.target.value
                                .split(/[,，]/)
                                .map((column) => column.trim())
                                .filter(Boolean),
                            }
                          : item,
                      );
                      patchContent({ stages });
                    }}
                    placeholder="观察地点,浪费水现象,出现频次,是否普遍"
                  />
                </label>
                <label className="field">
                  <span>学生作答提示</span>
                  <textarea
                    className="textarea"
                    rows={2}
                    value={stage.prompt}
                    onChange={(event) => {
                      const stages = content.stages.map((item, i) =>
                        i === index ? { ...item, prompt: event.target.value } : item,
                      );
                      patchContent({ stages });
                    }}
                    placeholder="整理上表，写出你发现的最普遍的浪费水现象并分析原因。"
                  />
                </label>
              </div>
            ))}
            <button
              className="add-btn"
              type="button"
              onClick={() =>
                patchContent({
                  stages: [...content.stages, { title: '', intro: '', items: [], columns: [], prompt: '' }],
                })
              }
            >
              + 添加项目阶段
            </button>
          </div>

          <div className="editor-section">
            <h2>评价标准</h2>
            {content.criteria.map((criterion, index) => (
              <div className="dynamic-item" key={index}>
                <div className="dynamic-item-head">
                  <span>维度 {index + 1}</span>
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => patchContent({ criteria: content.criteria.filter((_, i) => i !== index) })}
                  >
                    删除
                  </button>
                </div>
                <div className="grid-2">
                  <input
                    className="input"
                    value={criterion.name}
                    onChange={(event) => {
                      const criteria = content.criteria.map((item, i) =>
                        i === index ? { ...item, name: event.target.value } : item,
                      );
                      patchContent({ criteria });
                    }}
                    placeholder="评价维度名称"
                  />
                  <input
                    className="input"
                    type="number"
                    min={0}
                    max={100}
                    value={criterion.weight}
                    onChange={(event) => {
                      const criteria = content.criteria.map((item, i) =>
                        i === index ? { ...item, weight: Number(event.target.value) } : item,
                      );
                      patchContent({ criteria });
                    }}
                    placeholder="权重（%）"
                  />
                </div>
                <textarea
                  className="textarea"
                  rows={4}
                  value={criterion.description}
                  onChange={(event) => {
                    const criteria = content.criteria.map((item, i) =>
                      i === index ? { ...item, description: event.target.value } : item,
                    );
                    patchContent({ criteria });
                  }}
                  placeholder="描述该维度的具体表现"
                  style={{ marginTop: 8 }}
                />
              </div>
            ))}
            <button
              className="add-btn"
              type="button"
              onClick={() =>
                patchContent({ criteria: [...content.criteria, { name: '', weight: 25, description: '' }] })
              }
            >
              + 添加评价维度
            </button>
          </div>

          <div className="editor-section">
            <h2>自我评价量表（四级）</h2>
            <p className="muted small-text">学生端会生成 A/B/C/D 自评表；建议 4–6 个维度，与评价标准呼应。</p>
            {content.rubric.map((item, index) => (
              <div className="dynamic-item" key={index}>
                <div className="dynamic-item-head">
                  <span>维度 {index + 1}</span>
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => patchContent({ rubric: content.rubric.filter((_, i) => i !== index) })}
                  >
                    删除
                  </button>
                </div>
                <input
                  className="input"
                  value={item.name}
                  placeholder="评价维度名称，例如：数据处理运算"
                  onChange={(event) => {
                    const rubric = content.rubric.map((row, i) =>
                      i === index ? { ...row, name: event.target.value } : row,
                    );
                    patchContent({ rubric });
                  }}
                  style={{ marginBottom: 8 }}
                />
                {(['a', 'b', 'c', 'd'] as const).map((level) => (
                  <textarea
                    key={level}
                    className="textarea"
                    rows={2}
                    value={item[level]}
                    placeholder={`${level.toUpperCase()} 级的具体表现`}
                    style={{ marginBottom: 6 }}
                    onChange={(event) => {
                      const rubric = content.rubric.map((row, i) =>
                        i === index ? { ...row, [level]: event.target.value } : row,
                      );
                      patchContent({ rubric });
                    }}
                  />
                ))}
              </div>
            ))}
            <button
              className="add-btn"
              type="button"
              onClick={() =>
                patchContent({ rubric: [...content.rubric, { name: '', a: '', b: '', c: '', d: '' }] })
              }
            >
              + 添加自评维度
            </button>
          </div>

          <div className="editor-section">
            <h2>总结与反思提示</h2>
            <p className="muted small-text">每行一条，学生端会生成对应的反思输入框。</p>
            <textarea
              className="textarea"
              rows={4}
              value={(content.reflections || []).join('\n')}
              onChange={(event) =>
                patchContent({
                  reflections: event.target.value.split('\n').map((line) => line.trim()).filter(Boolean),
                })
              }
              placeholder={'本次项目的收获（数学知识、调查实践、小组合作等）\n遇到的困难及改进思路'}
            />
          </div>

          <div className="editor-section">
            <h2>配套参考范例</h2>
            {content.references.map((reference, index) => (
              <div className="dynamic-item" key={index}>
                <div className="dynamic-item-head">
                  <span>范例 {index + 1}</span>
                  <button
                    className="tiny-btn"
                    type="button"
                    onClick={() => patchContent({ references: content.references.filter((_, i) => i !== index) })}
                  >
                    删除
                  </button>
                </div>
                <input
                  className="input"
                  value={reference.title}
                  onChange={(event) => {
                    const references = content.references.map((item, i) =>
                      i === index ? { ...item, title: event.target.value } : item,
                    );
                    patchContent({ references });
                  }}
                  placeholder="范例标题"
                  style={{ marginBottom: 8 }}
                />
                <textarea
                  className="textarea tall"
                  rows={10}
                  value={reference.content}
                  onChange={(event) => {
                    const references = content.references.map((item, i) =>
                      i === index ? { ...item, content: event.target.value } : item,
                    );
                    patchContent({ references });
                  }}
                  placeholder="参考成果的文字说明"
                />
                {reference.images.length > 0 && (
                  <div className="reference-images">
                    {reference.images.map((image) => (
                      <div key={image} style={{ position: 'relative' }}>
                        <img src={fileUrl(image)} alt="参考图" />
                        <button
                          className="tiny-btn"
                          type="button"
                          style={{ display: 'block' }}
                          onClick={() => {
                            const references = content.references.map((item, i) =>
                              i === index ? { ...item, images: item.images.filter((img) => img !== image) } : item,
                            );
                            patchContent({ references });
                          }}
                        >
                          移除图片
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                {(reference.files || []).length > 0 && (
                  <ul className="reference-files">
                    {(reference.files || []).map((file) => (
                      <li key={file.url}>
                        <a href={fileUrl(file.url)} target="_blank" rel="noreferrer">
                          {file.name}
                        </a>
                        <span className="muted small-text">{formatFileSize(file.size)}</span>
                        <button
                          className="tiny-btn"
                          type="button"
                          onClick={() => {
                            const references = content.references.map((item, i) =>
                              i === index ? { ...item, files: (item.files || []).filter((f) => f.url !== file.url) } : item,
                            );
                            patchContent({ references });
                          }}
                        >
                          移除
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                <div className="reference-upload">
                  <label className="file-btn">
                    上传图片
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(event) => uploadReferenceImage(index, event.target.files?.[0] || null)}
                    />
                  </label>
                  <label className="file-btn">
                    上传文档 / PDF
                    <input
                      type="file"
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt,.csv,.zip"
                      onChange={(event) => uploadReferenceFile(index, event.target.files?.[0] || null)}
                    />
                  </label>
                  <span className="muted small-text">支持 png、jpg、pdf、docx、pptx、xlsx 等，单个 ≤20MB</span>
                </div>
              </div>
            ))}
            <button
              className="add-btn"
              type="button"
              onClick={() =>
                patchContent({ references: [...content.references, { title: '', content: '', images: [], files: [] }] })
              }
            >
              + 添加参考范例
            </button>
          </div>

          <div className="editor-actions">
            <button className="primary-btn" type="button" onClick={saveTask} disabled={saving}>
              {saving ? '保存中…' : '保存任务单'}
            </button>
          </div>
        </div>

        <aside className="editor-side">
          <div className="side-card">
            <h3>AI 辅助能力</h3>
            <div className="ai-toggle">
              <div>
                <strong className="small-text">{task.aiEnabled ? '已开启' : '未开启'}</strong>
                <p className="muted small-text" style={{ marginTop: 2 }}>
                  开启后，学生任务页会显示侧边AI辅助面板
                </p>
              </div>
              <button
                className={`switch${task.aiEnabled ? ' on' : ''}`}
                type="button"
                aria-label="切换AI辅助"
                onClick={() => patchTask({ aiEnabled: !task.aiEnabled })}
              />
            </div>

            {skills.map((skill) => (
              <div className={`ai-skill${skill.recommended ? ' recommended' : ''}`} key={skill.key}>
                <div className="ai-skill-head">
                  <strong>{skill.name}</strong>
                  <input
                    type="checkbox"
                    checked={task.aiSkills.includes(skill.key)}
                    onChange={() => toggleSkill(skill.key)}
                  />
                </div>
                <p>{skill.description}</p>
                <div className="reason">{skill.recommended ? `推荐：${skill.reason}` : skill.reason}</div>
              </div>
            ))}

            <button className="outline-btn small full" type="button" onClick={saveAi} disabled={aiSaving} style={{ width: '100%', marginTop: 6 }}>
              {aiSaving ? '保存中…' : '保存AI设置'}
            </button>
            <p className="muted small-text" style={{ marginTop: 8 }}>
              能力由平台根据当前任务单的板块与内容即时匹配，修改内容后会自动更新推荐。
            </p>
          </div>

          <div className="side-card publish-card">
            <h3>发布到班级</h3>
            {classes.length === 0 ? (
              <p className="muted small-text">
                还没有班级，请先到<a className="text-btn" href="/teacher/classes">班级管理</a>创建班级。
              </p>
            ) : (
              <>
                <label className="field">
                  <span>选择班级</span>
                  <select
                    value={publishClassId}
                    onChange={(event) => setPublishClassId(event.target.value ? Number(event.target.value) : '')}
                  >
                    {classes.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}（{item.studentCount}人）
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>截止日期（可选）</span>
                  <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} />
                </label>
                <button className="primary-btn small" type="button" onClick={publish} disabled={publishing} style={{ width: '100%' }}>
                  {publishing ? '发布中…' : '发布任务'}
                </button>
              </>
            )}

            <div className="published-list">
              {assignments.length === 0 && <p className="muted small-text">还没有发布记录</p>}
              {assignments.map((assignment) => (
                <div className="publish-item" key={assignment.id}>
                  <div className="publish-head">
                    <strong>{assignment.className}</strong>
                    <span className={`status-badge ${assignment.status === 'published' ? 'submitted' : 'withdrawn'}`}>
                      {assignment.status === 'published' ? '已发布' : '已撤回'}
                    </span>
                  </div>
                  <div className="muted small-text">
                    {assignment.submittedCount}/{assignment.studentCount} 份提交
                    {assignment.dueAt ? ` · 截止 ${formatDate(assignment.dueAt)}` : ''}
                  </div>
                  <div className="publish-actions">
                    <Link className="ghost-btn small" to={`/teacher/assignments/${assignment.id}`}>
                      查看提交
                    </Link>
                    {assignment.status === 'published' && (
                      <button className="danger-btn small" type="button" onClick={() => withdraw(assignment)}>
                        撤回
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
