const ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
};

/** 转义 HTML 特殊字符。 */
export const escapeHtml = (text: string): string => text.replace(/[&<>"']/g, ch => ESCAPES[ch]);

/**
 * 行内 Markdown：先整体转义，再还原粗体、斜体、行内代码、图片和链接。
 * 链接一律改写成 `data-goto`，在这个浏览器里导航而不是跳出页面。
 */
export function mdInline(source: string): string {
  return (
    escapeHtml(source)
      .replace(/!\[(?:Image \d+:\s*)?([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_all, alt: string, url: string) =>
        /^https?:/.test(url) ? `<img src="${url}" alt="${alt}" loading="lazy">` : ''
      )
      /* 链接文字本身就是网址，说明抽取器没能给图标或投票箭头起名；照印只会满屏地址。 */
      .replace(/\[([^\]]*)\]\(([^)\s]+)[^)]*\)/g, (_all, label: string, url: string) => {
        const text = label.trim();
        if (!/^https?:/.test(url)) return text;
        if (!text || /^https?:\/\//.test(text)) return '';
        return `<a data-goto="${url.replace(/^https?:\/\//, '')}">${text}</a>`;
      })
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[\s(])\*([^*\n]+)\*/g, '$1<i>$2</i>')
      .replace(/`([^`]+)`/g, '<code>$1</code>')
  );
}

interface MdList {
  readonly tag: 'ul' | 'ol';
  readonly items: string[];
}

/** 按行喂入、逐块吐出 HTML 的小状态机。 */
class MdBlocks {
  private readonly out: string[] = [];
  private paragraph: string[] = [];
  private list: MdList | null = null;
  private code: string[] | null = null;

  feed(raw: string): void {
    const line = raw.trimEnd();
    if (this.code !== null) {
      this.codeLine(raw, line);
      return;
    }
    if (/^```/.test(line)) {
      this.flush();
      this.code = [];
      return;
    }
    if (!line.trim()) {
      this.flush();
      return;
    }
    if (!/^(Published Time|URL Source|Warning):/.test(line)) this.block(line);
  }

  finish(): string {
    this.closeCode();
    this.flush();
    return this.out.join('\n');
  }

  private codeLine(raw: string, line: string): void {
    if (/^```/.test(line)) this.closeCode();
    else this.code?.push(raw);
  }

  private closeCode(): void {
    if (this.code === null) return;
    this.out.push(`<pre><code>${escapeHtml(this.code.join('\n'))}</code></pre>`);
    this.code = null;
  }

  private block(line: string): void {
    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      this.flush();
      const level = Math.min(heading[1].length + 1, 6);
      this.out.push(`<h${level}>${mdInline(heading[2])}</h${level}>`);
      return;
    }
    if (/^([-*_])\1{2,}$/.test(line.replace(/\s/g, ''))) {
      this.flush();
      this.out.push('<hr>');
      return;
    }
    const item = line.match(/^\s*(?:[-*+]\s+|\d{1,3}\.(?!\d)\s*)(.*)$/);
    if (item) {
      this.listItem(/^\s*\d/.test(line) ? 'ol' : 'ul', item[1]);
      return;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      this.flush();
      this.out.push(`<blockquote>${mdInline(quote[1])}</blockquote>`);
      return;
    }
    this.flushList();
    this.paragraph.push(line.trim());
  }

  private listItem(tag: 'ul' | 'ol', text: string): void {
    this.flushParagraph();
    if (this.list && this.list.tag !== tag) this.flushList();
    this.list ??= { tag, items: [] };
    this.list.items.push(text);
  }

  private flush(): void {
    this.flushParagraph();
    this.flushList();
  }

  private flushParagraph(): void {
    if (!this.paragraph.length) return;
    const html = mdInline(this.paragraph.join(' ').replace(/\s{2,}/g, ' ')).trim();
    if (html) this.out.push(`<p>${html}</p>`);
    this.paragraph = [];
  }

  private flushList(): void {
    if (!this.list) return;
    const items = this.list.items.map(item => mdInline(item).trim()).filter(Boolean);
    if (items.length)
      this.out.push(`<${this.list.tag}>${items.map(item => `<li>${item}</li>`).join('')}</${this.list.tag}>`);
    this.list = null;
  }
}

/**
 * 刚好够读一篇文章的 Markdown。抽取器的输出很规整，所以故意写得很小。
 * 列表页会被压成一行、序号内联；过长的行拆回列表项，短行保持原样，正文里的小数才不会被误拆。
 */
export function mdHTML(source: string): string {
  const blocks = new MdBlocks();
  source
    .replace(/\r/g, '')
    .split('\n')
    .map(line => (line.length > 140 ? line.replace(/\s(\d{1,3})\.(?!\d)\s*/g, '\n$1. ') : line))
    .join('\n')
    .split('\n')
    .forEach(line => blocks.feed(line));
  return blocks.finish();
}
