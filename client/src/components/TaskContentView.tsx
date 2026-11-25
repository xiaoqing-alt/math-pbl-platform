import { useState, type ReactNode } from 'react';
import { fileUrl, formatFileSize } from '../api';
import type { TaskContent, Worksheet } from '../types';
import MathText from './MathText';

// 传入 answer 时，阶段卡片内的表格与提问会变成可直接作答的输入区（学生端使用）
export interface ContentAnswerProps {
  worksheet: Worksheet;
  readOnly: boolean;
  onText: (stageIndex: number, text: string) => void;
  onCell: (stageIndex: number, rowIndex: number, cellIndex: number, value: string) => void;
  onAddRow: (stageIndex: number) => void;
  onRemoveRow: (stageIndex: number, rowIndex: number) => void;
}

// 可折叠板块：标题点击展开/收起
export function ContentSection({
  title,
  children,
  defaultOpen = true,
}: {
  title: string;
  children: ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className={`content-section collapsible${open ? ' open' : ''}`}>
      <button type="button" className="section-toggle" onClick={() => setOpen((value) => !value)}>
        <span className="section-caret">{open ? '▼' : '▶'}</span>
        <span className="section-title">{title}</span>
      </button>
      {open && <div className="section-body">{children}</div>}
    </div>
  );
}

export default function TaskContentView({
  content,
  answer,
}: {
  content: TaskContent;
  answer?: ContentAnswerProps;
}) {
  const hasIntro = Boolean(
    content.background ||
      (content.objectives || []).length > 0 ||
      (content.knowledgeTags || []).length > 0 ||
      content.description,
  );

  return (
    <>
      {hasIntro && (
        <ContentSection title="项目简介">
          {content.background && (
            <div className="intro-block">
              <h3>项目背景</h3>
              <p className="prose">
                <MathText text={content.background} />
              </p>
            </div>
          )}

          {(content.objectives || []).length > 0 && (
            <div className="intro-block">
              <h3>项目目标</h3>
              <ul className="objective-list">
                {content.objectives.map((item, index) => (
                  <li key={`${item}-${index}`}>
                    <MathText text={item} />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(content.knowledgeTags || []).length > 0 && (
            <div className="intro-block">
              <h3>涉及知识</h3>
              <div className="tag-list">
                {content.knowledgeTags.map((tag) => (
                  <span className="knowledge-tag" key={tag}>
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}

          {content.description && (
            <div className="intro-block">
              <h3>驱动问题与成果要求</h3>
              <p className="prose">
                <MathText text={content.description} />
              </p>
            </div>
          )}
        </ContentSection>
      )}

      {(content.stages || []).length > 0 && (
        <ContentSection title="项目进程">
          {content.stages.map((stage, index) => {
            const stageAnswer = answer ? answer.worksheet.stages[index] || { text: '', rows: [] } : null;
            return (
              <div className="stage-card" key={index}>
                <h3>
                  <MathText text={stage.title || `阶段 ${index + 1}`} />
                </h3>
                {stage.intro && (
                  <p className="muted small-text">
                    <MathText text={stage.intro} />
                  </p>
                )}
                {stage.items.length > 0 && (
                  <ol className="stage-items">
                    {stage.items.map((item, itemIndex) => (
                      <li key={itemIndex}>
                        <MathText text={item} />
                      </li>
                    ))}
                  </ol>
                )}
                {stage.columns.length > 0 && (
                  <div className="table-wrap">
                    <table className="criteria-table input-table stage-table">
                      <thead>
                        <tr>
                          {stage.columns.map((column) => (
                            <th key={column}>{column}</th>
                          ))}
                          {answer && !answer.readOnly && <th style={{ width: 64 }}>操作</th>}
                        </tr>
                      </thead>
                      <tbody>
                        {!answer && (
                          <tr>
                            <td colSpan={stage.columns.length} className="table-hint">
                              该表格由学生在线填写
                            </td>
                          </tr>
                        )}
                        {answer && (stageAnswer?.rows.length || 0) === 0 && (
                          <tr>
                            <td
                              colSpan={stage.columns.length + (answer.readOnly ? 0 : 1)}
                              className="table-hint"
                            >
                              点击下方“添加一行”开始记录
                            </td>
                          </tr>
                        )}
                        {answer &&
                          (stageAnswer?.rows || []).map((row, rowIndex) => (
                            <tr key={rowIndex}>
                              {stage.columns.map((_, cellIndex) => (
                                <td key={cellIndex}>
                                  <input
                                    className="cell-input"
                                    value={row[cellIndex] || ''}
                                    readOnly={answer.readOnly}
                                    onChange={(event) =>
                                      answer.onCell(index, rowIndex, cellIndex, event.target.value)
                                    }
                                  />
                                </td>
                              ))}
                              {!answer.readOnly && (
                                <td>
                                  <button
                                    className="tiny-btn"
                                    type="button"
                                    onClick={() => answer.onRemoveRow(index, rowIndex)}
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
                {answer && stage.columns.length > 0 && !answer.readOnly && (
                  <button className="add-btn" type="button" onClick={() => answer.onAddRow(index)}>
                    + 添加一行
                  </button>
                )}
                {stage.prompt && (
                  <p className="stage-prompt">
                    ✎ <MathText text={stage.prompt} />
                  </p>
                )}
                {answer && (
                  <label className="field stage-answer">
                    <span>{stage.prompt ? '在此作答' : '本阶段作答'}</span>
                    <textarea
                      rows={4}
                      value={stageAnswer?.text || ''}
                      readOnly={answer.readOnly}
                      placeholder="记录本阶段的做法、数据、计算与结论"
                      onChange={(event) => answer.onText(index, event.target.value)}
                    />
                  </label>
                )}
              </div>
            );
          })}
        </ContentSection>
      )}

      {(content.rubric || []).length > 0 && (
        <ContentSection title="自我评价量表">
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
                {content.rubric.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>
                      <MathText text={item.name} />
                    </td>
                    <td>
                      <MathText text={item.a || '—'} />
                    </td>
                    <td>
                      <MathText text={item.b || '—'} />
                    </td>
                    <td>
                      <MathText text={item.c || '—'} />
                    </td>
                    <td>
                      <MathText text={item.d || '—'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ContentSection>
      )}

      {(content.reflections || []).length > 0 && (
        <ContentSection title="总结与反思">
          <ul className="objective-list">
            {content.reflections.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </ContentSection>
      )}

      {(content.criteria || []).length > 0 && (
        <ContentSection title="教师评价标准" defaultOpen={false}>
          <div className="table-wrap">
            <table className="criteria-table">
              <thead>
                <tr>
                  <th>评价维度</th>
                  <th>权重</th>
                  <th>具体描述</th>
                </tr>
              </thead>
              <tbody>
                {content.criteria.map((item, index) => (
                  <tr key={`${item.name}-${index}`}>
                    <td>
                      <MathText text={item.name} />
                    </td>
                    <td>{item.weight ? `${item.weight}%` : '—'}</td>
                    <td>
                      <MathText text={item.description || '—'} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </ContentSection>
      )}

      {(content.references || []).length > 0 && (
        <ContentSection title="配套参考范例" defaultOpen={false}>
          {content.references.map((reference, index) => (
            <div className="reference-item" key={index}>
              <h3>
                <MathText text={reference.title || `范例 ${index + 1}`} />
              </h3>
              {reference.content && (
                <p>
                  <MathText text={reference.content} />
                </p>
              )}
              {reference.images && reference.images.length > 0 && (
                <div className="reference-images">
                  {reference.images.map((image) => (
                    <a key={image} href={fileUrl(image)} target="_blank" rel="noreferrer">
                      <img src={fileUrl(image)} alt="参考范例图片" />
                    </a>
                  ))}
                </div>
              )}
              {(reference.files || []).length > 0 && (
                <ul className="reference-attachments">
                  {(reference.files || []).map((file) => (
                    <li key={file.url}>
                      <a href={fileUrl(file.url)} target="_blank" rel="noreferrer">
                        {file.name}
                      </a>
                      <span>{formatFileSize(file.size)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </ContentSection>
      )}
    </>
  );
}
