import { fileUrl, formatFileSize } from '../api';
import type { TaskContent } from '../types';

export default function TaskContentView({ content }: { content: TaskContent }) {
  return (
    <>
      {content.background && (
        <div className="content-section">
          <h2>项目背景</h2>
          <p className="prose">{content.background}</p>
        </div>
      )}

      {(content.objectives || []).length > 0 && (
        <div className="content-section">
          <h2>项目目标</h2>
          <ul className="objective-list">
            {content.objectives.map((item, index) => (
              <li key={`${item}-${index}`}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(content.knowledgeTags || []).length > 0 && (
        <div className="content-section">
          <h2>涉及知识</h2>
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
        <div className="content-section">
          <h2>驱动问题与成果要求</h2>
          <p className="prose">{content.description}</p>
        </div>
      )}

      {(content.steps || []).length > 0 && (
        <div className="content-section">
          <h2>实施流程</h2>
          <div className="step-list">
            {content.steps.map((step, index) => (
              <div className="step-item" key={index}>
                <span className="step-index">{index + 1}</span>
                <div>
                  <h3>{step.title || `第 ${index + 1} 步`}</h3>
                  {step.content && <p>{step.content}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(content.stages || []).length > 0 && (
        <div className="content-section">
          <h2>项目进程</h2>
          {content.stages.map((stage, index) => (
            <div className="stage-card" key={index}>
              <h3>{stage.title || `阶段 ${index + 1}`}</h3>
              {stage.intro && <p className="muted small-text">{stage.intro}</p>}
              {stage.items.length > 0 && (
                <ol className="stage-items">
                  {stage.items.map((item, itemIndex) => (
                    <li key={itemIndex}>{item}</li>
                  ))}
                </ol>
              )}
              {stage.columns.length > 0 && (
                <div className="table-wrap">
                  <table className="criteria-table stage-table">
                    <thead>
                      <tr>
                        {stage.columns.map((column) => (
                          <th key={column}>{column}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <td colSpan={stage.columns.length} className="table-hint">
                          该表格由学生在线填写
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
              {stage.prompt && <p className="stage-prompt">✎ {stage.prompt}</p>}
            </div>
          ))}
        </div>
      )}

      {(content.rubric || []).length > 0 && (
        <div className="content-section">
          <h2>自我评价量表</h2>
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
                    <td>{item.name}</td>
                    <td>{item.a || '—'}</td>
                    <td>{item.b || '—'}</td>
                    <td>{item.c || '—'}</td>
                    <td>{item.d || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(content.reflections || []).length > 0 && (
        <div className="content-section">
          <h2>总结与反思</h2>
          <ul className="objective-list">
            {content.reflections.map((item, index) => (
              <li key={index}>{item}</li>
            ))}
          </ul>
        </div>
      )}

      {(content.criteria || []).length > 0 && (
        <div className="content-section">
          <h2>教师评价标准</h2>
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
                    <td>{item.name}</td>
                    <td>{item.weight ? `${item.weight}%` : '—'}</td>
                    <td>{item.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(content.references || []).length > 0 && (
        <div className="content-section">
          <h2>配套参考范例</h2>
          {content.references.map((reference, index) => (
            <div className="reference-item" key={index}>
              <h3>{reference.title || `范例 ${index + 1}`}</h3>
              {reference.content && <p>{reference.content}</p>}
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
        </div>
      )}
    </>
  );
}
