const SAFE_URL_PATTERN = /^(?:https?:\/\/|mailto:)/i;

/** 将 AI 输出转换为受限 Markdown HTML，交给 Angular sanitizer 继续清理。 */
export function renderAiMarkdown(markdown: string): string {
  if (!markdown) return '';

  const lines = markdown.replace(/\r\n?/g, '\n').split('\n');
  const output: string[] = [];
  let codeLines: string[] = [];
  let inCodeBlock = false;
  let paragraphLines: string[] = [];
  let listKind: 'ol' | 'ul' | null = null;

  const closeList = () => {
    if (!listKind) return;
    output.push(`</${listKind}>`);
    listKind = null;
  };

  const flushParagraph = () => {
    if (paragraphLines.length === 0) return;
    output.push(`<p>${renderInline(paragraphLines.join('\n'))}</p>`);
    paragraphLines = [];
  };

  const flushCode = () => {
    output.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
    codeLines = [];
  };

  for (const line of lines) {
    const fence = line.match(/^\s*```/);
    if (fence) {
      flushParagraph();
      closeList();
      if (inCodeBlock) {
        flushCode();
      }
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) {
      codeLines.push(line);
      continue;
    }

    if (line.trim() === '') {
      flushParagraph();
      closeList();
      continue;
    }

    const heading = line.match(/^\s*(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      closeList();
      output.push(`<h${heading[1].length + 2}>${renderInline(heading[2])}</h${heading[1].length + 2}>`);
      continue;
    }

    const unorderedItem = line.match(/^\s*[-*+]\s+(.+)$/);
    if (unorderedItem) {
      flushParagraph();
      if (listKind !== 'ul') {
        closeList();
        output.push('<ul>');
        listKind = 'ul';
      }
      output.push(`<li>${renderInline(unorderedItem[1])}</li>`);
      continue;
    }

    const orderedItem = line.match(/^\s*\d+[.)]\s+(.+)$/);
    if (orderedItem) {
      flushParagraph();
      if (listKind !== 'ol') {
        closeList();
        output.push('<ol>');
        listKind = 'ol';
      }
      output.push(`<li>${renderInline(orderedItem[1])}</li>`);
      continue;
    }

    const quote = line.match(/^\s*>\s?(.*)$/);
    if (quote) {
      flushParagraph();
      closeList();
      output.push(`<blockquote>${renderInline(quote[1])}</blockquote>`);
      continue;
    }

    paragraphLines.push(line.trim());
  }

  flushParagraph();
  closeList();
  if (inCodeBlock) flushCode();

  return output.join('');
}

function renderInline(value: string): string {
  const codeTokens: string[] = [];
  const withCodeTokens = value.replace(/`([^`\n]+)`/g, (_match, code: string) => {
    const token = `@@ai-code-${codeTokens.length}@@`;
    codeTokens.push(`<code>${escapeHtml(code)}</code>`);
    return token;
  });

  let html = escapeHtml(withCodeTokens);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, (_match, label: string, url: string) => {
    if (!SAFE_URL_PATTERN.test(url)) return label;
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_\n]+)__/g, '<strong>$1</strong>');
  html = html.replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, '$1<em>$2</em>');
  html = html.replace(/(^|[^_])_([^_\n]+)_(?!_)/g, '$1<em>$2</em>');
  html = html.replace(/@@ai-code-(\d+)@@/g, (_match, index: string) => codeTokens[Number(index)] ?? '');
  return html.replace(/\n/g, '<br>');
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character
  );
}
