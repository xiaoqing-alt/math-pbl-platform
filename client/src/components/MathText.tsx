import katex from 'katex';

const cache = new Map<string, string>();

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderMath(tex: string, displayMode: boolean) {
  const key = `${displayMode ? 'D' : 'I'}:${tex}`;
  const cached = cache.get(key);
  if (cached !== undefined) return cached;
  let html = '';
  try {
    html = katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      trust: false,
    });
  } catch {
    html = escapeHtml(displayMode ? `$$${tex}$$` : `$${tex}$`);
  }
  cache.set(key, html);
  return html;
}

/**
 * 把文本中的 $...$（行内）与 $$...$$（独立行）渲染为公式，其余内容按纯文本输出。
 */
export default function MathText({ text }: { text: string }) {
  const value = String(text ?? '');
  if (!value.includes('$')) return <>{value}</>;

  const parts = value.split(/(\$\$[\s\S]+?\$\$|\$[^$\n]+?\$)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('$$') && part.endsWith('$$') && part.length > 4) {
          return (
            <span
              className="math-block"
              key={index}
              dangerouslySetInnerHTML={{ __html: renderMath(part.slice(2, -2), true) }}
            />
          );
        }
        if (part.startsWith('$') && part.endsWith('$') && part.length > 2) {
          return (
            <span key={index} dangerouslySetInnerHTML={{ __html: renderMath(part.slice(1, -1), false) }} />
          );
        }
        return <span key={index}>{part}</span>;
      })}
    </>
  );
}
