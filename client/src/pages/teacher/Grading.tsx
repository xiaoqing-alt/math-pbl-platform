import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, formatDate, formatDateTime, fileUrl } from '../../api';
import type { ClassReport, CriteriaScore, Submission, SubmissionVersion, Task } from '../../types';
import { BoardBadge, EmptyState, StatusBadge } from '../../components/Bits';
import ReportView from '../../components/ReportView';
import MathText from '../../components/MathText';

interface StudentRow {
  id: number;
  username: string;
  displayName: string;
  submission: null | {
    id: number;
    status: 'draft' | 'submitted' | 'returned';
    submittedAt: string;
    updatedAt: string;
    score: number | null;
    gradedAt: string;
    returned: boolean;
    hasFeedback: boolean;
    wordCount: number;
    fileCount: number;
    suggestedScore: number | null;
  };
}

interface AssignmentDetailResponse {
  assignment: {
    id: number;
    taskId: number;
    classId: number;
    className: string;
    taskTitle: string;
    board: 'algebra' | 'geometry' | 'stats';
    status: 'published' | 'withdrawn';
    dueAt: string;
    publishedAt: string;
  };
  task: Task;
  students: StudentRow[];
}

interface SubmissionDetailResponse {
  submission: Submission;
  student: { id: number; username: string; displayName: string };
  task: { id: number; title: string; content: Task['content'] };
  versions: SubmissionVersion[];
  assignmentStatus: string;
}

export default function Grading() {
  const { id } = useParams();
  const assignmentId = Number(id);
  const [detail, setDetail] = useState<AssignmentDetailResponse | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [submissionDetail, setSubmissionDetail] = useState<SubmissionDetailResponse | null>(null);
  const [scoreInput, setScoreInput] = useState('');
  const [feedbackInput, setFeedbackInput] = useState('');
  const [criteriaInput, setCriteriaInput] = useState<Record<string, { score: string; comment: string }>>({});
  const [versions, setVersions] = useState<SubmissionVersion[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [report, setReport] = useState<ClassReport | null>(null);
  const [showReport, setShowReport] = useState(false);

  async function load() {
    try {
      const data = await api<AssignmentDetailResponse>(`/assignments/${assignmentId}`);
      setDetail(data);
      const withSubmission = data.students.find((item) => item.submission);
      if (withSubmission && selectedId === null) {
        await selectStudent(withSubmission);
      }
    } catch (err: any) {
      setError(err.message || '加载批阅页面失败');
    }
  }

  useEffect(() => {
    load();
  }, [assignmentId]);

  async function selectStudent(student: StudentRow) {
    setSelectedId(student.id);
    setMessage('');
    setError('');
    setScoreInput('');
    setFeedbackInput('');
    setCriteriaInput({});
    setVersions([]);
    setSubmissionDetail(null);
    if (!student.submission) return;
    try {
      const data = await api<SubmissionDetailResponse>(`/submissions/${student.submission.id}`);
      setSubmissionDetail(data);
      setVersions(data.versions || []);
      setScoreInput(data.submission.score === null ? '' : String(data.submission.score));
      setFeedbackInput(data.submission.feedback || '');
      const criteria = data.task.content?.criteria || [];
      const saved = new Map((data.submission.criteriaScores || []).map((item) => [item.name, item]));
      const suggested = new Map(
        (data.submission.analysis?.dimensions || []).map((item) => [item.name, item.score]),
      );
      const next: Record<string, { score: string; comment: string }> = {};
      for (const item of criteria) {
        const entry = saved.get(item.name);
        next[item.name] = {
          score: entry ? String(entry.score) : suggested.has(item.name) ? String(suggested.get(item.name)) : '',
          comment: entry ? entry.comment : '',
        };
      }
      setCriteriaInput(next);
    } catch (err: any) {
      setError(err.message || '加载成果失败');
    }
  }

  async function saveGrade() {
    if (!submissionDetail) return;
    setError('');
    setMessage('');
    try {
      const criteriaScores = criteriaList
        .map((item) => ({
          name: item.name,
          score: Number(criteriaInput[item.name]?.score),
          comment: criteriaInput[item.name]?.comment || '',
        }))
        .filter((item) => criteriaInput[item.name] && criteriaInput[item.name].score !== '' && Number.isFinite(item.score));
      const data = await api<{ submission: Submission; message: string }>(
        `/submissions/${submissionDetail.submission.id}`,
        {
          method: 'PATCH',
          body: {
            score: scoreInput === '' ? null : Number(scoreInput),
            feedback: feedbackInput,
            criteriaScores,
          },
        },
      );
      setSubmissionDetail({ ...submissionDetail, submission: data.submission });
      setMessage(data.message);
      await load();
    } catch (err: any) {
      setError(err.message || '保存批阅失败');
    }
  }

  async function returnForRevision() {
    if (!submissionDetail) return;
    if (!feedbackInput.trim()) {
      setError('请先填写退回原因或修改建议，学生端会看到这段说明');
      return;
    }
    if (!window.confirm('确定把这份成果退回给学生修改吗？学生可修改后重新提交。')) return;
    setError('');
    setMessage('');
    try {
      const data = await api<{ submission: Submission; message: string }>(
        `/submissions/${submissionDetail.submission.id}`,
        { method: 'PATCH', body: { action: 'return', feedback: feedbackInput } },
      );
      setSubmissionDetail({ ...submissionDetail, submission: data.submission });
      setMessage(data.message);
      await load();
    } catch (err: any) {
      setError(err.message || '退回失败');
    }
  }

  function updateCriterion(name: string, patch: Partial<{ score: string; comment: string }>) {
    setCriteriaInput((current) => ({
      ...current,
      [name]: { score: '', comment: '', ...(current[name] || {}), ...patch },
    }));
  }

  function applyAiSuggestion() {
    const current = submissionDetail?.submission.analysis;
    if (!current) return;
    setScoreInput(String(current.suggestedScore));
    const text = [
      `【AI 预评建议】建议分 ${current.suggestedScore} 分。`,
      current.strengths.length > 0 ? `亮点：${current.strengths.join('；')}。` : '',
      current.improvements.length > 0 ? `改进方向：${current.improvements.join('；')}。` : '',
    ]
      .filter(Boolean)
      .join('\n');
    setFeedbackInput(text);
    setMessage('已填入 AI 建议，请结合课堂表现修改后保存');
  }

  async function loadReport() {
    setError('');
    try {
      const data = await api<{ report: ClassReport }>(`/assignments/${assignmentId}/report`);
      setReport(data.report);
      setShowReport(true);
    } catch (err: any) {
      setError(err.message || '加载分析报告失败');
    }
  }

  async function withdraw() {
    if (!window.confirm('确定撤回该班级的发布任务吗？')) return;
    try {
      await api(`/assignments/${assignmentId}/withdraw`, { method: 'POST' });
      setMessage('已撤回发布，学生端将不再显示该任务');
      await load();
    } catch (err: any) {
      setError(err.message || '撤回失败');
    }
  }

  if (!detail) {
    return <div className="empty-state">{error || '正在加载批阅信息…'}</div>;
  }

  const selectedStudent = detail.students.find((item) => item.id === selectedId) || null;
  const analysis = submissionDetail?.submission.analysis || null;
  const criteriaList = detail.task.content.criteria || [];
  const aiScoreMap = new Map(
    (submissionDetail?.submission.aiCriteriaScores || []).map((item) => [item.name, item]),
  );
  const weightedPreview = (() => {
    if (criteriaList.length === 0) return null;
    let sum = 0;
    let total = 0;
    for (const item of criteriaList) {
      const raw = criteriaInput[item.name]?.score;
      const value = Number(raw);
      if (raw === undefined || raw === '' || !Number.isFinite(value)) return null;
      const weight = item.weight || 1;
      sum += value * weight;
      total += weight;
    }
    return total > 0 ? Math.round((sum / total) * 10) / 10 : null;
  })();

  return (
    <div>
      <div className="page-head">
        <div>
          <Link className="text-btn" to={`/teacher/tasks/${detail.assignment.taskId}`}>
            ← 返回任务单
          </Link>
          <h1>{detail.assignment.taskTitle}</h1>
          <p>
            {detail.assignment.className} · <BoardBadge board={detail.assignment.board} /> · 发布 {formatDate(detail.assignment.publishedAt)}
            {detail.assignment.dueAt ? ` · 截止 ${formatDate(detail.assignment.dueAt)}` : ''}
          </p>
        </div>
        <div className="page-actions">
          <button className="outline-btn" type="button" onClick={loadReport}>
            班级分析报告
          </button>
          {detail.assignment.status === 'published' && (
            <button className="danger-btn" type="button" onClick={withdraw}>
              撤回发布
            </button>
          )}
        </div>
      </div>

      {message && <div className="alert success">{message}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grading-layout">
        <div className="student-list">
          <div className="student-list-header">
            学生提交情况（{detail.students.filter((item) => item.submission?.status === 'submitted').length}/{detail.students.length}）
          </div>
          <div className="student-list-body">
            {detail.students.map((student) => (
              <div
                key={student.id}
                className={`student-row${selectedId === student.id ? ' active' : ''}`}
                onClick={() => selectStudent(student)}
              >
                <div>
                  <div className="student-name">{student.displayName}</div>
                  <small>
                    {student.submission?.status === 'submitted'
                      ? `提交于 ${formatDate(student.submission.submittedAt)}`
                      : student.submission?.status === 'returned'
                        ? '已退回待修改'
                        : student.submission?.status === 'draft'
                          ? '仅有草稿'
                          : '尚未提交'}
                    {student.submission?.gradedAt ? ` · 已批阅` : ''}
                  </small>
                </div>
                {student.submission?.status === 'returned' ? (
                  <span className="status-badge returned">退回中</span>
                ) : student.submission?.score !== null && student.submission?.score !== undefined ? (
                  <span className="status-badge graded">{student.submission.score}分</span>
                ) : student.submission?.status === 'submitted' ? (
                  <span className="status-badge submitted">待批阅</span>
                ) : (
                  <span className="status-badge pending">未提交</span>
                )}
              </div>
            ))}
          </div>
        </div>

        <div className="grade-panel">
          {!selectedStudent && <EmptyState>从左侧选择一名学生，查看成果并批阅。</EmptyState>}

          {selectedStudent && !selectedStudent.submission && (
            <EmptyState>
              {selectedStudent.displayName} 尚未提交成果。学生提交后即可在这里查看内容、自动分析与批阅。
            </EmptyState>
          )}

          {selectedStudent && selectedStudent.submission && !submissionDetail && (
            <p className="muted">正在加载成果…</p>
          )}

          {submissionDetail && (
            <>
              <div className="section-title">
                <h2>
                  {submissionDetail.student.displayName} 的成果
                </h2>
                <div className="list-meta">
                  <StatusBadge
                    status={
                      submissionDetail.submission.status === 'returned'
                        ? 'returned'
                        : submissionDetail.submission.gradedAt
                          ? 'graded'
                          : 'submitted'
                    }
                  />
                  <span className="muted small-text">
                    {submissionDetail.submission.submittedAt
                      ? formatDateTime(submissionDetail.submission.submittedAt)
                      : ''}
                  </span>
                </div>
              </div>

              {submissionDetail.submission.status === 'returned' && (
                <div className="alert info">
                  已退回修改（{formatDateTime(submissionDetail.submission.returnedAt)}），等待学生重新提交。
                  {submissionDetail.submission.returnNote && (
                    <div style={{ marginTop: 6 }}>退回说明：{submissionDetail.submission.returnNote}</div>
                  )}
                </div>
              )}

              {versions.length > 1 && (
                <div className="version-list">
                  <span className="muted small-text">提交版本：</span>
                  {versions.map((version) => (
                    <span className="version-chip" key={version.id}>
                      V{version.versionNo} · {formatDateTime(version.createdAt)} · {version.wordCount}字
                      {version.fileCount > 0 ? ` · ${version.fileCount}个附件` : ''}
                    </span>
                  ))}
                </div>
              )}

              {submissionDetail.submission.content ? (
                <div className="content-box">
                  <MathText text={submissionDetail.submission.content} />
                </div>
              ) : (
                <p className="muted small-text">学生没有填写文字成果，请查看附件。</p>
              )}

              {submissionDetail.submission.files.length > 0 && (
                <div className="file-list">
                  {submissionDetail.submission.files.map((file) => (
                    <div className="file-chip" key={file.url}>
                      <a href={fileUrl(file.url)} target="_blank" rel="noreferrer">
                        {file.name}
                      </a>
                      <span className="muted">{(file.size / 1024).toFixed(1)} KB</span>
                    </div>
                  ))}
                </div>
              )}

              {(submissionDetail.submission.worksheet?.stages || []).some(
                (stage) =>
                  stage.text.trim() ||
                  stage.rows.some((row) => row.some((cell) => String(cell || '').trim())),
              ) && (
                <div className="worksheet-review">
                  <h3>分阶段作答</h3>
                  {(submissionDetail.submission.worksheet?.stages || []).map((answer, index) => {
                    const stage = submissionDetail.task.content.stages?.[index];
                    if (!stage) return null;
                    const hasRows = answer.rows.some((row) => row.some((cell) => String(cell || '').trim()));
                    if (!answer.text.trim() && !hasRows) return null;
                    return (
                      <div className="review-stage" key={index}>
                        <strong>
                          阶段{index + 1}：{stage.title}
                        </strong>
                        {hasRows && stage.columns.length > 0 && (
                          <div className="table-wrap">
                            <table className="criteria-table">
                              <thead>
                                <tr>
                                  {stage.columns.map((column) => (
                                    <th key={column}>{column}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                {answer.rows
                                  .filter((row) => row.some((cell) => String(cell || '').trim()))
                                  .map((row, rowIndex) => (
                                    <tr key={rowIndex}>
                                      {stage.columns.map((_, cellIndex) => (
                                        <td key={cellIndex}>{row[cellIndex] || ''}</td>
                                      ))}
                                    </tr>
                                  ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                        {answer.text.trim() && (
                          <p className="review-text">
                            <MathText text={answer.text} />
                          </p>
                        )}
                      </div>
                    );
                  })}
                  {(submissionDetail.submission.worksheet?.gains ||
                    submissionDetail.submission.worksheet?.difficulties) && (
                    <div className="review-stage">
                      <strong>总结与反思</strong>
                      {submissionDetail.submission.worksheet?.gains && (
                        <p className="review-text">收获：{submissionDetail.submission.worksheet.gains}</p>
                      )}
                      {submissionDetail.submission.worksheet?.difficulties && (
                        <p className="review-text">困难与改进：{submissionDetail.submission.worksheet.difficulties}</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {analysis && (
                <div className="analysis-block">
                  <div className="section-title" style={{ marginBottom: 8 }}>
                    <h3>AI 成果评价（规则版）</h3>
                    <button className="tiny-btn" type="button" onClick={applyAiSuggestion}>
                      采纳建议分与评语
                    </button>
                  </div>
                  <div className="metric-grid">
                    <div className="metric">
                      <span>建议分</span>
                      <strong>{analysis.suggestedScore}</strong>
                    </div>
                    <div className="metric">
                      <span>字数</span>
                      <strong>{analysis.wordCount}</strong>
                    </div>
                    <div className="metric">
                      <span>附件</span>
                      <strong>{analysis.fileCount}</strong>
                    </div>
                    <div className="metric">
                      <span>段落</span>
                      <strong>{analysis.paragraphCount}</strong>
                    </div>
                  </div>

                  {analysis.dimensions.map((dim) => (
                    <div className="bar-row" key={dim.name}>
                      <span className="bar-label">{dim.name}</span>
                      <div className="bar-track">
                        <div className="bar-fill" style={{ width: `${Math.min(100, dim.score)}%` }} />
                      </div>
                      <span className="bar-value">{dim.score}</span>
                    </div>
                  ))}

                  {analysis.strengths.length > 0 && (
                    <>
                      <h3 style={{ marginTop: 12 }}>亮点</h3>
                      <ul className="feedback-list">
                        {analysis.strengths.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {analysis.improvements.length > 0 && (
                    <>
                      <h3 style={{ marginTop: 10 }}>改进建议</h3>
                      <ul className="feedback-list">
                        {analysis.improvements.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  <p className="muted small-text" style={{ marginTop: 10 }}>
                    {analysis.note}
                  </p>
                </div>
              )}

              {criteriaList.length > 0 && (
                <div className="criteria-grade">
                  <div className="section-title" style={{ marginBottom: 6 }}>
                    <h3>分维度评分</h3>
                    <span className="muted small-text">依据任务单评价标准与权重</span>
                  </div>
                  {criteriaList.map((item) => (
                    <div className="criteria-grade-row" key={item.name}>
                      <div className="criteria-grade-head">
                        <strong>
                          <MathText text={item.name} />
                        </strong>
                        <span className="muted small-text">{item.weight ? `权重 ${item.weight}%` : '未设权重'}</span>
                      </div>
                      {item.description && (
                        <p className="muted small-text">
                          <MathText text={item.description} />
                        </p>
                      )}
                      <div className="criteria-grade-inputs">
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={criteriaInput[item.name]?.score ?? ''}
                          placeholder="0—100"
                          onChange={(event) => updateCriterion(item.name, { score: event.target.value })}
                        />
                        <input
                          type="text"
                          className="criteria-comment"
                          value={criteriaInput[item.name]?.comment ?? ''}
                          placeholder="该维度的简评（可选）"
                          onChange={(event) => updateCriterion(item.name, { comment: event.target.value })}
                        />
                      </div>
                      {aiScoreMap.has(item.name) && (
                        <p className="ai-hint">
                          AI 建议 {aiScoreMap.get(item.name)!.score} 分
                          {aiScoreMap.get(item.name)!.reason ? ` · ${aiScoreMap.get(item.name)!.reason}` : ''}
                        </p>
                      )}
                    </div>
                  ))}
                  {weightedPreview !== null && (
                    <p className="small-text" style={{ marginTop: 8 }}>
                      按当前维度分与权重计算：<strong>{weightedPreview}</strong> 分
                    </p>
                  )}
                </div>
              )}

              <div className="grade-form">
                <label className="field">
                  <span>总分（留空则按维度权重自动计算）</span>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={scoreInput}
                    onChange={(event) => setScoreInput(event.target.value)}
                    placeholder="例如 88"
                  />
                </label>
                <label className="field">
                  <span>评语</span>
                  <textarea
                    rows={4}
                    value={feedbackInput}
                    onChange={(event) => setFeedbackInput(event.target.value)}
                    placeholder="写出具体、可操作的反馈，帮助学生改进。"
                  />
                </label>
              </div>

              {submissionDetail.submission.status === 'returned' ? (
                <p className="muted small-text">已退回，学生重新提交后即可再次批阅。</p>
              ) : (
                <div className="editor-actions">
                  <button className="outline-btn" type="button" onClick={returnForRevision}>
                    退回修改
                  </button>
                  <button className="primary-btn" type="button" onClick={saveGrade}>
                    保存批阅
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showReport && report && (
        <div className="report-panel">
          <div className="section-title">
            <h2>班级成果分析报告</h2>
            <button className="ghost-btn small" type="button" onClick={() => setShowReport(false)}>
              收起
            </button>
          </div>
          <ReportView report={report} />
        </div>
      )}
    </div>
  );
}
