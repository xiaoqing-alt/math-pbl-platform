import { useEffect, useRef } from 'react';
import { API_BASE, getToken } from '../api';
import type { Analysis } from '../types';

/** 沙箱 iframe：工具 HTML 通过 postMessage 回写学生作答 */
export function ToolFrame({
  toolKey,
  title,
  onAppend,
}: {
  toolKey: string;
  title: string;
  onAppend?: (text: string) => void;
}) {
  const ref = useRef<HTMLIFrameElement>(null);
  const token = getToken();
  const apiOrigin = API_BASE ? new URL(API_BASE).origin : window.location.origin;

  useEffect(() => {
    function handle(event: MessageEvent) {
      if (!ref.current || event.source !== ref.current.contentWindow) return;
      // 沙箱 iframe 为不透明源（origin 为 "null"），只接受这两种来源
      if (event.origin !== 'null' && event.origin !== apiOrigin) return;
      const data = event.data as { type?: string; text?: unknown } | null;
      if (data && data.type === 'pbl-append' && typeof data.text === 'string') {
        onAppend?.(data.text.slice(0, 20000));
      }
    }
    window.addEventListener('message', handle);
    return () => window.removeEventListener('message', handle);
  }, [onAppend, apiOrigin]);

  return (
    <iframe
      ref={ref}
      className="tool-frame"
      title={title}
      sandbox="allow-scripts allow-forms allow-popups"
      src={`${API_BASE}/tools/${encodeURIComponent(toolKey)}/file?token=${encodeURIComponent(token)}&parentOrigin=${encodeURIComponent(window.location.origin)}`}
    />
  );
}

/** AI 成果评价面板 */
export function EvaluationPanel({
  evaluation,
  evaluating,
  onEvaluate,
}: {
  evaluation?: Analysis | null;
  evaluating?: boolean;
  onEvaluate?: () => void;
}) {
  return (
    <div>
      <button className="primary-btn small" type="button" onClick={onEvaluate} disabled={evaluating} style={{ width: '100%' }}>
        {evaluating ? 'AI 正在分析…' : '生成 AI 成果评价'}
      </button>
      {!evaluation && (
        <p className="muted small-text" style={{ marginTop: 8 }}>
          平台会读取当前填写的全部内容，对照本任务单的评价标准与自评量表，给出建议分、维度得分与改进点。
        </p>
      )}
      {evaluation && (
        <div className="ai-eval">
          <div className="ai-eval-score">
            <strong>{evaluation.suggestedScore}</strong>
            <span>建议分</span>
          </div>
          <div className="ai-eval-meta">
            共 {evaluation.wordCount} 字 · {evaluation.paragraphCount} 段 · {evaluation.fileCount} 个附件
          </div>
          {evaluation.ruleFacts && evaluation.ruleFacts.length > 0 && (
            <p className="ai-hint">规则依据：{evaluation.ruleFacts.join('；')}</p>
          )}
          <h4>维度得分</h4>
          {evaluation.dimensions.map((dim) => (
            <div className="dim-item" key={dim.name}>
              <div className="dim-row">
                <span>{dim.name}</span>
                <div className="dim-track">
                  <div className="dim-fill" style={{ width: `${dim.score}%` }} />
                </div>
                <strong>{dim.score}</strong>
              </div>
              {dim.reason && <p className="dim-reason">{dim.reason}</p>}
            </div>
          ))}
          {evaluation.strengths.length > 0 && (
            <>
              <h4>亮点</h4>
              <ul className="ai-tips">
                {evaluation.strengths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          {evaluation.improvements.length > 0 && (
            <>
              <h4>改进建议</h4>
              <ul className="ai-tips">
                {evaluation.improvements.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
          <p className="ai-note">{evaluation.note}</p>
        </div>
      )}
    </div>
  );
}
