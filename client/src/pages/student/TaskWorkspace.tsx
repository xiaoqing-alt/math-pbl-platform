import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, formatDateTime, fileUrl, uploadFile } from '../../api';
import type { AiGuide, AiSkill, Analysis, FileInfo, Submission, Task, ToolInfo, Worksheet } from '../../types';
import { BoardBadge, StatusBadge } from '../../components/Bits';
import TaskContentView from '../../components/TaskContentView';
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
  ai: { enabled: boolean; skills: AiSkill[]; tools: ToolInfo[] };
}

function emptyWorksheet(task: Task): Worksheet {
  return {
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
  const [worksheet, setWorksheet] = useState<Worksheet>({ stages: [], selfScores: [], gains: '', difficulties: '' });
  const [files, setFiles] = useState<FileInfo[]>([]);
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
        setWorksheet(mergeWorksheet(result.submission?.worksheet, result.task));
        setFiles(result.submission?.files || []);
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
      const result = await api<{ submission: Submission; message: string }>(
        `/student/assignments/${assignmentId}/submission`,
        { method: 'PUT', body: { content, worksheet, files, submit } },
      );
      setData({ ...data, submission: result.submission });
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
                  graded ? 'graded' : submission?.status === 'submitted' ? 'submitted' : submission?.status === 'draft' ? 'draft' : 'pending'
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

          <TaskContentView content={task.content} />

          <div className="content-section worksheet-section">
            <h2>我的作答</h2>
            <p className="muted small-text">
              请先在左侧任务单中阅读项目背景与阶段要求，再按阶段完成下表。可直接保存草稿，完成后提交给教师。
            </p>

            {stages.map((stage, stageIndex) => {
              const answer = worksheet.stages[stageIndex] || { text: '', rows: [] };
              return (
                <div className="worksheet-stage" key={stageIndex}>
                  <h3>
                    阶段{stageIndex + 1}：{stage.title || '阶段任务'}
                  </h3>
                  {stage.intro && <p className="muted small-text">{stage.intro}</p>}
                  {stage.columns.length > 0 && (
                    <div className="table-wrap">
                      <table className="criteria-table input-table">
                        <thead>
                          <tr>
                            {stage.columns.map((column) => (
                              <th key={column}>{column}</th>
                            ))}
                            {!readOnly && <th style={{ width: 60 }}>操作</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {answer.rows.length === 0 && (
                            <tr>
                              <td colSpan={stage.columns.length + (readOnly ? 0 : 1)} className="table-hint">
                                点击下方“添加一行”开始记录
                              </td>
                            </tr>
                          )}
                          {answer.rows.map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {stage.columns.map((_, cellIndex) => (
                                <td key={cellIndex}>
                                  <input
                                    className="cell-input"
                                    value={row[cellIndex] || ''}
                                    readOnly={readOnly}
                                    onChange={(event) => updateCell(stageIndex, rowIndex, cellIndex, event.target.value)}
                                  />
                                </td>
                              ))}
                              {!readOnly && (
                                <td>
                                  <button
                                    className="tiny-btn"
                                    type="button"
                                    onClick={() =>
                                      updateStage(stageIndex, { rows: answer.rows.filter((_, r) => r !== rowIndex) })
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
                  )}
                  {stage.columns.length > 0 && !readOnly && (
                    <button className="add-btn" type="button" onClick={() => addRow(stageIndex, stage.columns.length)}>
                      + 添加一行
                    </button>
                  )}
                  {stage.prompt && <p className="stage-prompt">✎ {stage.prompt}</p>}
                  <label className="field">
                    <span>本阶段作答</span>
                    <textarea
                      rows={5}
                      value={answer.text}
                      readOnly={readOnly}
                      placeholder="记录本阶段的做法、数据、计算与结论"
                      onChange={(event) => updateStage(stageIndex, { text: event.target.value })}
                    />
                  </label>
                </div>
              );
            })}

            {rubric.length > 0 && (
              <div className="worksheet-stage">
                <h3>自我评价</h3>
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

            {(task.content.reflections || []).length > 0 && (
              <div className="worksheet-stage">
                <h3>总结与反思</h3>
                <label className="field">
                  <span>{task.content.reflections[0] || '本次项目的收获'}</span>
                  <textarea
                    rows={4}
                    value={worksheet.gains}
                    readOnly={readOnly}
                    onChange={(event) => setWorksheet({ ...worksheet, gains: event.target.value })}
                  />
                </label>
                <label className="field">
                  <span>{task.content.reflections[1] || '遇到的困难及改进思路'}</span>
                  <textarea
                    rows={4}
                    value={worksheet.difficulties}
                    readOnly={readOnly}
                    onChange={(event) => setWorksheet({ ...worksheet, difficulties: event.target.value })}
                  />
                </label>
              </div>
            )}

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

            <div className="submission-status">
              <StatusBadge
                status={
                  graded ? 'graded' : submission?.status === 'submitted' ? 'submitted' : submission?.status === 'draft' ? 'draft' : 'pending'
                }
              />
              <span>
                {graded
                  ? `教师已批阅 · ${formatDateTime(submission?.gradedAt)}`
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
                  {submission?.status === 'submitted' ? '更新提交' : '提交成果'}
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
                {submission?.feedback ? (
                  <p style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, color: '#4a546b' }}>{submission.feedback}</p>
                ) : (
                  <p className="muted small-text">教师暂未填写文字评语。</p>
                )}
              </div>
            )}
          </div>
        </div>

        <aside className="workspace-side workspace-side-ai">
          <div className="side-tabs">
            <button className={`side-tab${tab === 'submit' ? ' active' : ''}`} type="button" onClick={() => setTab('submit')}>
              提交概览
            </button>
            <button className={`side-tab${tab === 'ai' ? ' active' : ''}`} type="button" onClick={() => setTab('ai')}>
              AI 辅助{ai.enabled ? '' : '（未开启）'}
            </button>
          </div>

          {tab === 'submit' && (
            <div className="side-tab-panel">
              <div className="submission-status">
                <StatusBadge
                  status={
                    graded ? 'graded' : submission?.status === 'submitted' ? 'submitted' : submission?.status === 'draft' ? 'draft' : 'pending'
                  }
                />
                <span>{graded ? '已批阅' : submission?.status === 'submitted' ? '等待批阅' : '未提交'}</span>
              </div>
              <p className="muted small-text">作答区在左侧任务单下方，可按阶段填写表格、自评与反思。</p>
              <ul className="side-check">
                <li>{hasWorksheetContent ? '✓ 已填写部分阶段内容' : '○ 尚未填写阶段内容'}</li>
                <li>{files.length > 0 ? `✓ 已上传 ${files.length} 个附件` : '○ 尚未上传附件'}</li>
                <li>{worksheet.selfScores.some(Boolean) ? '✓ 已完成自我评价' : '○ 尚未完成自我评价'}</li>
              </ul>
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
              {!ai.enabled ? (
                <div className="ai-empty">
                  教师尚未开启这份任务单的 AI 辅助功能。
                  <br />
                  你仍然可以按照任务单中的阶段要求自主完成探究。
                </div>
              ) : (
                <>
                  <p className="muted small-text" style={{ marginBottom: 10 }}>
                    AI 工具来自教师选择的工具库，点“写入我的作答”即可把结果写进成果。
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
              )}
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
