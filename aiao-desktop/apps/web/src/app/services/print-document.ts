/** 仅打印当前选择的内容；段落按纯文本处理。 */
export interface PrintableContent {
  readonly title: string;
  readonly paragraphs: readonly string[];
  readonly image?: { readonly url: string; readonly alt: string };
}

/** 剪贴板中的标题与段落，保留用户换行。 */
export function printableText(content: PrintableContent): string {
  return [content.title, ...content.paragraphs].join('\n\n');
}

/** 在独立文档请求浏览器打印；返回不代表纸张输出成功。 */
export async function printDocument(
  content: PrintableContent,
  signal: AbortSignal,
  document: Document = globalThis.document
): Promise<void> {
  signal.throwIfAborted();
  const frame = document.createElement('iframe');
  frame.title = 'Print selected content';
  frame.setAttribute('sandbox', 'allow-same-origin allow-modals');
  frame.setAttribute('aria-hidden', 'true');
  frame.setAttribute('data-content-print', '');
  frame.style.cssText = 'position:fixed;width:1px;height:1px;opacity:0;pointer-events:none;border:0';
  const cleanup = () => frame.remove();
  signal.addEventListener('abort', cleanup, { once: true });
  try {
    document.body.append(frame);
    const page = frame.contentDocument;
    const window = frame.contentWindow;
    if (!page || !window) throw new Error('Print document is unavailable');
    page.title = content.title;
    const style = page.createElement('style');
    style.textContent =
      'body{font:12pt system-ui;color:#000;background:#fff;margin:20mm}h1{font-size:20pt;overflow-wrap:anywhere}p{white-space:pre-wrap;overflow-wrap:anywhere}img{max-width:100%;height:auto}';
    page.head.append(style);
    const title = page.createElement('h1');
    title.textContent = content.title;
    page.body.append(title);
    for (const text of content.paragraphs) {
      const paragraph = page.createElement('p');
      paragraph.textContent = text;
      page.body.append(paragraph);
    }
    if (content.image) {
      const image = page.createElement('img');
      image.src = content.image.url;
      image.alt = content.image.alt;
      page.body.append(image);
      await image.decode();
    }
    signal.throwIfAborted();
    window.print();
  } finally {
    signal.removeEventListener('abort', cleanup);
    cleanup();
  }
}
