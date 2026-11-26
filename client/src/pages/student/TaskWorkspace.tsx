import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, formatDateTime, fileUrl, getUser, uploadFile } from '../../api';
import type { AiGuide, AiSkill, Analysis, FileInfo, Submission, SubmissionVersion, Task, ToolInfo, Worksheet } from '../../types';
import { BoardBadge, StatusBadge } from '../../components/Bits';
import TaskContentView, { ContentSection } from '../../components/TaskContentView';
import { EvaluationPanel, ToolFrame } from '../../components/AiTools';

interface WorkspaceResponse {
  assignment: {
    id: number;
    classId: number;
    className: string;
    status: string;
    dueAt: string;
    publishedAt: string;
  };
  task: Task;
  teacherName: string;
  submission: Submission | null;
  versions?: SubmissionVersion[];
  ai: { enabled: boolean; skills: AiSkill[]; tools: ToolInfo[] };
}

function todayText() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function emptyWorksheet(task: Task): Worksheet {
  return {
    info: { name: '', className: '', fillDate: todayText() },
    team: [],
    stages: (task.content.stages || []).map(() => ({ text: '', rows: [] })),
    selfScores: (task.content.rubric || []).map(() => ''),
    gains: '',
    difficulties: '',
  };
}

function mergeWorksheet(saved: Worksheet | null | undefined, task: Task): Worksheet {
  const base = emptyWorksheet(task);
  if (!saved) return base;
  return {
    info: {
      name: saved.info?.name || '',
      className: saved.info?.className || '',
      fillDate: saved.info?.fillDate || base.info.fillDate,
    },
    team: Array.isArray(saved.team) ? saved.team : [],
    stages: base.stages.map((stage, index) => saved.stages?.[index] || stage),
    selfScores: base.selfScores.map((score, index) => saved.selfScores?.[index] || score),
    gains: saved.gains || '',
    difficulties: saved.difficulties || '',
  };
}

export default function StudentTaskWorkspace() {
  const { id } = useParams();
  const assignmentId = Number(id);

  const [data, setData] = useState<WorkspaceResponse | null>(null);
  const [content, setContent] = useState('');
  const [worksheet, setWorksheet] = useState<Worksheet>({
    info: { name: '', className: '', fillDate: todayText() },
    team: [],
    stages: [],
    selfScores: [],
    gains: '',
    difficulties: '',
  });
  const [files, setFiles] = useState<FileInfo[]>([]);
  const [versions, setVersions] = useState<SubmissionVersion[]>([]);
  const [tab, setTab] = useState<'submit' | 'ai'>('submit');
  const [guide, setGuide] = useState<AiGuide | null>(null);
  const [selectedSkill, setSelectedSkill] = useState('');
  const [selectedTool, setSelectedTool] = useState('');
  const [evaluation, setEvaluation] = useState<Analysis | null>(null);
  const [checklist, setChecklist] = useState<{ label: string; done: boolean }[]>([]);
  const [evaluating, setEvaluating] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const result = await api<WorkspaceResponse>(`/student/assignments/${assignmentId}`);
        if (!active) return;
        setData(result);
        setContent(result.submission?.content || '');
        const merged = mergeWorksheet(result.submission?.worksheet, result.task);
        const user = getUser();
        setWorksheet({
          ...merged,
          info: {
            name: merged.info.name || (user?.displayName || ''),
            className: merged.info.className || result.assignment.className || '',
            fillDate: merged.info.fillDate || todayText(),
          },
        });
        setFiles(result.submission?.files || []);
        setVersions(result.versions || []);
        if (result.ai.skills.length > 0) setSelectedSkill(result.ai.skills[0].key);
        if (result.ai.tools && result.ai.tools.length > 0) setSelectedTool(result.ai.tools[0].key);
      } catch (err: any) {
        if (active) setError(err.message || '加载任务失败');
      }
    })();
    return () => {
      active = false;
    };
  }, [assignmentId]);

  async function saveSubmission(submit: boolean) {
    if (!data) return;
    if (submit && !content.trim() && files.length === 0 && !hasWorksheetContent) {
      setError('请至少填写阶段作答、成果概述或上传附件后再提交');
      return;
    }
    setError('');
    setMessage('');
    setSaving(true);
    try {
      const result = await api<{ submission: Submission; versions?: SubmissionVersion[]; message: string }>(
        `/student/assignments/${assignmentId}/submission`,
        { method: 'PUT', body: { content, worksheet, files, submit } },
      );
      setData({ ...data, submission: result.submission, versions: result.versions || data.versions });
      setVersions(result.versions || []);
      setMessage(result.message);
    } catch (err: any) {
      setError(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  }

  async function uploadAttachment(file: File | null) {
    if (!file) return;
    setError('');
    setUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setFiles((current) => [...current, { name: uploaded.name, url: uploaded.url, size: uploaded.size }].slice(0, 8));
      setMessage('附件已上传，保存或提交后同步给教师');
    } catch (err: any) {
      setError(err.message || '上传失败');
    } finally {
      setUploading(false);
    }
  }

  async function loadGuide(skillKey: string) {
    if (!data) return;
    setSelectedSkill(skillKey);
    setTab('ai');
    setError('');
    try {
      const result = await api<{ guide: AiGuide }>(`/student/assignments/${assignmentId}/ai/guide`, {
        method: 'POST',
        body: { skillKey },
      });
      setGuide(result.guide);
    } catch (err: any) {
      setError(err.message || 'AI引导加载失败');
    }
  }

  async function runEvaluation() {
    setError('');
    setEvaluating(true);
    try {
      const result = await api<{ evaluation: Analysis; checklist: { label: string; done: boolean }[] }>(
        `/student/assignments/${assignmentId}/ai/evaluate`,
        { method: 'POST', body: { content, worksheet, files } },
      );
      setEvaluation(result.evaluation);
      setChecklist(result.checklist);
    } catch (err: any) {
      setError(err.message || 'AI 评价失败');
    } finally {
      setEvaluating(false);
    }
  }

  const hasWorksheetContent = useMemo(
    () =>
      worksheet.team.some((member) => member.name.trim() || member.task.trim()) ||
      worksheet.stages.some(
        (stage) => stage.text.trim().length > 0 || stage.rows.some((row) => row.some((cell) => cell.trim())),
      ) ||
      worksheet.selfScores.some(Boolean) ||
      Boolean(worksheet.gains.trim() || worksheet.difficulties.trim()),
    [worksheet],
  );

  if (!data) {
    return <div className="empty-state">{error || '正在加载任务…'}</div>;
  }

  const { task, submission, assignment, ai } = data;
  const graded = Boolean(submission?.gradedAt);
  const readOnly = graded;
  const stages = task.content.stages || [];
  const rubric = task.content.rubric || [];
  const activeSkill = ai.skills.find((skill) => skill.key === selectedSkill) || ai.skills[0];
  const activeTool = (ai.tools || []).find((tool) => tool.key === selectedTool) || (ai.tools || [])[0];
  const inquiryTools = (ai.tools || []).filter((tool) => tool.category === 'inquiry');
  const assistTools = (ai.tools || []).filter((tool) => tool.category !== 'inquiry');
  const appendText = (text: string) => setContent((current) => (current ? `${current}\n${text}` : text));

  function updateStage(index: number, patch: Partial<{ text: string; rows: string[][] }>) {
    setWorksheet((current) => ({
      ...current,
      stages: current.stages.map((stage, i) => (i === index ? { ...stage, ...patch } : stage)),
    }));
  }

  function addRow(stageIndex: number, columnCount: number) {
    const current = worksheet.stages[stageIndex] || { text: '', rows: [] };
    updateStage(stageIndex, { rows: [...current.rows, Array.from({ length: columnCount }, () => '')] });
  }

  function updateCell(stageIndex: number, rowIndex: number, cellIndex: number, value: string) {
    const current = worksheet.stages[stageIndex] || { text: '', rows: [] };
    const rows = current.rows.map((row, r) =>
      r === rowIndex ? row.map((cell, c) => (c === cellIndex ? value : cell)) : row,
    );
    updateStage(stageIndex, { rows });
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <Link className="text-btn" to="/student">
            ← 返回学习中心
          </Link>
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="workspace-layout">
        <div className="workspace-main">
          <div className="task-hero">
            <div className="task-meta-line" style={{ marginBottom: 4 }}>
              <BoardBadge board={task.board} />
              <StatusBadge
                status={
                  graded ? 'graded' : submission?.status === 'submitted' ? 'submitted' : submission?.status === 'returned' ? 'returned' : submission?.status === 'draft' ? 'draft' : 'pending'
                }
              />
            </div>
            <h1>{task.title}</h1>
            <p className="muted" style={{ marginBottom: 10 }}>
              {task.summary}
            </p>
            <div className="task-meta-line">
              <span>教师：{data.teacherName}</span>
              <span>班级：{assignment.className}</span>
              {task.projectType && <span>项目类型：{task.projectType}</span>}
              {task.duration && <span>建议课时：{task.duration}</span>}
              {assignment.dueAt && <span>截止日期：{formatDate(assignment.dueAt)}</span>}
            </div>
          </div>

          {submission?.status === 'returned' && (
            <div className="alert info" style={{ marginBottom: 14 }}>
              <strong>教师退回了你的成果</strong>
              {submission.returnedAt ? `（${formatDateTime(submission.returnedAt)}）` : ''}，请按修改建议调整后重新提交。
              {submission.returnNote && <div style={{ marginTop: 6 }}>修改建议：{submission.returnNote}</div>}
            </div>
          )}

          <ContentSection title="基础信息">
            <div className="info-grid">
              <label className="field">
                <span>姓名</span>
                <input
                  value={worksheet.info.name}
                  readOnly={readOnly}
                  placeholder="请填写姓名"
                  onChange={(event) =>
                    setWorksheet((current) => ({
                      ...current,
                      info: { ...current.info, name: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>班级</span>
                <input
                  value={worksheet.info.className}
                  readOnly={readOnly}
                  placeholder="如：八年级1班"
                  onChange={(event) =>
                    setWorksheet((current) => ({
                      ...current,
                      info: { ...current.info, className: event.target.value },
                    }))
                  }
                />
              </label>
              <label className="field">
                <span>填写日期</span>
                <input
                  type="date"
                  value={worksheet.info.fillDate}
                  readOnly={readOnly}
                  onChange={(event) =>
                    setWorksheet((current) => ({
                      ...current,
                      info: { ...current.info, fillDate: event.target.value },
                    }))
                  }
                />
              </label>
            </div>

            <h3 className="info-subtitle">团队分工情况</h3>
            <div className="table-wrap">
              <table className="criteria-table input-table team-table">
                <thead>
                  <tr>
                    <th>成员姓名</th>
                    <th>承担任务</th>
                    {!readOnly && <th style={{ width: 64 }}>操作</th>}
                  </tr>
                </thead>
                <tbody>
                  {worksheet.team.length === 0 && (
                    <tr>
                      <td colSpan={readOnly ? 2 : 3} className="table-hint">
                        点击下方“添加成员”登记小组分工
                      </td>
                    </tr>
                  )}
                  {worksheet.team.map((member, index) => (
                    <tr key={index}>
                      <td>
                        <input
                          className="cell-input"
                          value={member.name}
                          readOnly={readOnly}
                          placeholder="如：张三"
                          onChange={(event) =>
                            setWorksheet((current) => ({
                              ...current,
                              team: current.team.map((item, i) =>
                                i === index ? { ...item, name: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="cell-input"
                          value={member.task}
                          readOnly={readOnly}
                          placeholder="如：实地走访调查"
                          onChange={(event) =>
                            setWorksheet((current) => ({
                              ...current,
                              team: current.team.map((item, i) =>
                                i === index ? { ...item, task: event.target.value } : item,
                              ),
                            }))
                          }
                        />
                      </td>
                      {!readOnly && (
                        <td>
                          <button
                            className="tiny-btn"
                            type="button"
                            onClick={() =>
                              setWorksheet((current) => ({
                                ...current,
                                team: current.team.filter((_, i) => i !== index),
                              }))
                            }
                          >
                            删除
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!readOnly && (
              <button
                className="add-btn"
                type="button"
                onClick={() =>
                  setWorksheet((current) => ({
                    ...current,
                    team: [...current.team, { name: '', task: '' }],
                  }))
                }
              >
                + 添加成员
              </button>
            )}
          </ContentSection>

          <TaskContentView
            content={task.content}
            coverImage={task.coverImage}
            coverCaption={task.title}
            answer={{
              worksheet,
              readOnly,
              onText: (stageIndex, text) => updateStage(stageIndex, { text }),
              onCell: updateCell,
              onAddRow: (stageIndex) => addRow(stageIndex, stages[stageIndex]?.columns.length || 0),
              onRemoveRow: (stageIndex, rowIndex) =>
                updateStage(stageIndex, {
                  rows: (worksheet.stages[stageIndex]?.rows || []).filter((_, r) => r !== rowIndex),
                }),
            }}
          />

          <ContentSection title="自我评价与成果提交">
            <p className="muted small-text">
              各阶段的表格与提问已在任务单中直接填写，下面完成自我评价、反思与成果附件，然后保存草稿或提交给教师。
            </p>

            {rubric.length > 0 && (
              <div className="worksheet-stage">
                <h3>自评量表</h3>
                <div className="table-wrap">
                  <table className="criteria-table self-eval-table">
                    <thead>
                      <tr>
                        <th>评价维度</th>
                        <th>A</th>
                        <th>B</th>
                        <th>C</th>
                        <th>D</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rubric.map((item, index) => (
                        <tr key={`${item.name}-${index}`}>
                          <td>{item.name}</td>
                          {(['A', 'B', 'C', 'D'] as const).map((level) => (
                            <td key={level} className="radio-cell">
                              <input
                                type="radio"
                                name={`self-${index}`}
                                checked={worksheet.selfScores[index] === level}
                                disabled={readOnly}
                                onChange={() =>
                                  setWorksheet((current) => {
                                    const next = [...current.selfScores];
                                    next[index] = level;
                                    return { ...current, selfScores: next };
                                  })
                                }
                              />
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <details className="rubric-detail">
                  <summary>查看各级评价标准</summary>
                  <div className="table-wrap">
                    <table className="criteria-table rubric-table">
                      <thead>
                        <tr>
                          <th>评价维度</th>
                          <th>优秀（A）</th>
                          <th>良好（B）</th>
                          <th>合格（C）</th>
                          <th>不合格（D）</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rubric.map((item, index) => (
                          <tr key={index}>
                            <td>{item.name}</td>
                            <td>{item.a}</td>
                            <td>{item.b}</td>
                            <td>{item.c}</td>
                            <td>{item.d}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              </div>
            )}

            <div className="worksheet-stage">
              <h3>总结与反思</h3>
              <label className="field">
                <span>本次项目的收获</span>
                <textarea
                  rows={4}
                  value={worksheet.gains}
                  readOnly={readOnly}
                  placeholder="从数学知识、调查实践、小组合作等方面，写下你在这次项目中的收获。"
                  onChange={(event) => setWorksheet({ ...worksheet, gains: event.target.value })}
                />
              </label>
              <label className="field">
                <span>遇到的困难及改进思路</span>
                <textarea
                  rows={4}
                  value={worksheet.difficulties}
                  readOnly={readOnly}
                  placeholder="记录测量、调查或小组合作中遇到的困难，以及下次打算如何改进。"
                  onChange={(event) => setWorksheet({ ...worksheet, difficulties: event.target.value })}
                />
              </label>
            </div>

            <div className="worksheet-stage">
              <h3>成果概述与附件</h3>
              <label className="field">
                <span>成果概述（可选，用于补充说明整体成果）</span>
                <textarea
                  rows={6}
                  value={content}
                  readOnly={readOnly}
                  placeholder="概括你的最终成果、核心结论与创新点。"
                  onChange={(event) => setContent(event.target.value)}
                />
              </label>
              <div className="field">
                <span>附件（图片、文档等，单份不超过 20MB）</span>
                {files.length > 0 && (
                  <div className="file-list" style={{ marginTop: 0, marginBottom: 8 }}>
                    {files.map((file) => (
                      <div className="file-chip" key={file.url}>
                        <a href={fileUrl(file.url)} target="_blank" rel="noreferrer">
                          {file.name}
                        </a>
                        <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                        {!readOnly && (
                          <button
                            className="tiny-btn"
                            type="button"
                            onClick={() => setFiles(files.filter((item) => item.url !== file.url))}
                          >
                            移除
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {!readOnly && (
                  <input type="file" disabled={uploading} onChange={(event) => uploadAttachment(event.target.files?.[0] || null)} />
                )}
                {uploading && <span className="muted small-text">上传中…</span>}
              </div>
            </div>
          </ContentSection>

            <div className="submission-status">
              <StatusBadge
                status={
                  graded ? 'graded' : submission?.status === 'submitted' ? 'submitted' : submission?.status === 'returned' ? 'returned' : submission?.status === 'draft' ? 'draft' : 'pending'
                }
              />
              <span>
                {graded
                  ? `教师已批阅 · ${formatDateTime(submission?.gradedAt)}`
                  : submission?.status === 'returned'
                    ? `已退回修改 · ${formatDateTime(submission?.returnedAt)}，可修改后重新提交`
                    : submission?.status === 'submitted'
                      ? `已提交 · ${formatDateTime(submission?.submittedAt)}`
                      : '提交后教师即可查看并批阅'}
              </span>
            </div>

            {readOnly && <div className="alert info">教师已完成批阅，成果内容不可再修改。你可以在右侧查看评分与评语。</div>}

            {!readOnly && (
              <div className="editor-actions" style={{ justifyContent: 'space-between' }}>
                <button className="outline-btn" type="button" onClick={() => saveSubmission(false)} disabled={saving}>
                  {saving ? '保存中…' : '保存草稿'}
                </button>
                <button className="primary-btn" type="button" onClick={() => saveSubmission(true)} disabled={saving}>
                  {submission?.status === 'submitted'
                    ? '更新提交'
                    : submission?.status === 'returned'
                      ? '重新提交'
                      : '提交成果'}
                </button>
              </div>
            )}

            {graded && (
              <div className="feedback-box">
                <h3>教师评价</h3>
                <div className="score-line">
                  <strong>{submission?.score ?? '—'}</strong>
                  <span>分</span>
                </div>
                {(submission?.criteriaScores || []).length > 0 && (
                  <div className="criteria-feedback">
                    {(submission?.criteriaScores || []).map((item) => (
                      <div className="criteria-feedback-row" key={item.name}>
                        <span className="criteria-feedback-name">{item.name}</span>
                        <strong>{item.score}</strong>
                        {item.comment && <span className="muted small-text">· {item.comment}</span>}
                      </div>
                    ))}
                  </div>
                )}
                {submission?.feedback ? (
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: '#4a546b' }}>{submission.feedback}</p>
                ) : (
                  <p className="muted small-text">教师暂未填写文字评语。</p>
                )}
              </div>
            )}
        </div>

        <aside className="workspace-side workspace-side-ai">
          <div className="side-tabs">
            <button className={`side-tab${tab === 'submit' ? ' active' : ''}`} type="button" onClick={() => setTab('submit')}>
              提交概览
            </button>
            <button className={`side-tab${tab === 'ai' ? ' active' : ''}`} type="button" onClick={() => setTab('ai')}>
              {ai.tools.length > 0 ? '探究工具' : 'AI 辅助'}
              {ai.enabled ? '' : ai.tools.length > 0 ? ' / AI 未开启' : '（未开启）'}
            </button>
          </div>

          {tab === 'submit' && (
            <div className="side-tab-panel">
              <div className="submission-status">
                <StatusBadge
                  status={
                    graded ? 'graded' : submission?.status === 'submitted' ? 'submitted' : submission?.status === 'returned' ? 'returned' : submission?.status === 'draft' ? 'draft' : 'pending'
                  }
                />
                <span>{graded ? '已批阅' : submission?.status === 'submitted' ? '等待批阅' : submission?.status === 'returned' ? '退回修改' : '未提交'}</span>
              </div>
              <p className="muted small-text">作答区在左侧任务单下方，可按阶段填写表格、自评与反思。</p>
              <ul className="side-check">
                <li>{hasWorksheetContent ? '✓ 已填写部分阶段内容' : '○ 尚未填写阶段内容'}</li>
                <li>{files.length > 0 ? `✓ 已上传 ${files.length} 个附件` : '○ 尚未上传附件'}</li>
                <li>{worksheet.selfScores.some(Boolean) ? '✓ 已完成自我评价' : '○ 尚未完成自我评价'}</li>
              </ul>
              {versions.length > 0 && (
                <div className="version-list">
                  <span className="muted small-text">提交记录：</span>
                  {versions.map((version) => (
                    <span className="version-chip" key={version.id}>
                      V{version.versionNo} · {formatDateTime(version.createdAt)}
                    </span>
                  ))}
                </div>
              )}
              {graded && (
                <div className="feedback-box">
                  <h3>教师评价</h3>
                  <div className="score-line">
                    <strong>{submission?.score ?? '—'}</strong>
                    <span>分</span>
                  </div>
                  {submission?.feedback ? (
                    <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: '#4a546b' }}>{submission.feedback}</p>
                  ) : (
                    <p className="muted small-text">教师暂未填写文字评语。</p>
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'ai' && (
            <div className="side-tab-panel">
              <p className="muted small-text" style={{ marginBottom: 10 }}>
                {ai.tools.length > 0
                  ? '教师为本任务挑选了交互探究教具，可直接操作，并把结果写入你的作答。'
                  : '教师尚未为这份任务单选择交互工具。'}
              </p>

                  {(ai.tools || []).length > 0 && (
                    <>
                      {inquiryTools.length > 0 && (
                        <div className="tool-group">
                          <div className="tool-group-title">交互探究教具</div>
                          <div className="ai-chip-list">
                            {inquiryTools.map((tool) => (
                              <button
                                key={tool.key}
                                className={`ai-chip${activeTool?.key === tool.key ? ' active' : ''}`}
                                type="button"
                                onClick={() => setSelectedTool(tool.key)}
                              >
                                {tool.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {assistTools.length > 0 && (
                        <div className="tool-group">
                          <div className="tool-group-title">辅助工具</div>
                          <div className="ai-chip-list">
                            {assistTools.map((tool) => (
                              <button
                                key={tool.key}
                                className={`ai-chip${activeTool?.key === tool.key ? ' active' : ''}`}
                                type="button"
                                onClick={() => setSelectedTool(tool.key)}
                              >
                                {tool.name}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {activeTool && (
                        <div className="tool-frame-wrap">
                          <ToolFrame toolKey={activeTool.key} title={activeTool.name} onAppend={appendText} />
                          <p className="muted small-text">{activeTool.description}</p>
                        </div>
                      )}
                    </>
                  )}

                  {(ai.tools || []).length === 0 && (
                    <div className="ai-empty">
                      教师尚未为这份任务单选择交互工具，你仍可使用下方的 AI 成果评价与思考提示。
                    </div>
                  )}

                  {ai.enabled ? (
                    <>
                  <div className="ai-section">
                    <h4>AI 成果评价</h4>
                    <EvaluationPanel evaluation={evaluation} evaluating={evaluating} onEvaluate={runEvaluation} />
                  </div>

                  <div className="guide-block">
                    <h4>AI 思考提示</h4>
                    <div className="ai-chip-list">
                      {ai.skills.map((skill) => (
                        <button
                          key={skill.key}
                          className={`ai-chip${selectedSkill === skill.key ? ' active' : ''}`}
                          type="button"
                          onClick={() => {
                            setSelectedSkill(skill.key);
                            setGuide(null);
                          }}
                        >
                          {skill.name}
                        </button>
                      ))}
                    </div>
                    {activeSkill && (
                      <button className="tiny-btn" type="button" onClick={() => loadGuide(activeSkill.key)}>
                        生成思考提示
                      </button>
                    )}
                    {guide && (
                      <div className="ai-guide">
                        <h3>{guide.title}</h3>
                        <p>{guide.intro}</p>
                        {(guide.objectives || []).map((item) => (
                          <div className="ai-question" key={item}>
                            <strong>对照学习目标</strong>
                            {item}
                          </div>
                        ))}
                        {guide.steps.map((step) => (
                          <div className="ai-question" key={step.index}>
                            <strong>
                              第 {step.index} 步 · {step.title}
                            </strong>
                            {step.question}
                          </div>
                        ))}
                        {guide.tips.length > 0 && (
                          <ul className="ai-tips">
                            {guide.tips.map((tip) => (
                              <li key={tip}>{tip}</li>
                            ))}
                          </ul>
                        )}
                        <p className="ai-note">{guide.note}</p>
                      </div>
                    )}
                  </div>
                    </>
                  ) : (
                    <div className="ai-empty">
                      教师尚未开启这份任务单的 AI 辅助功能，你仍可按照阶段要求自主完成探究。
                    </div>
                  )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
