import { getDocument } from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** 一次打开的 PDF：按页取文本或把一页画进画布；用完要 {@link destroy}。 */
export class OpenedPdf {
  constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly destroyTask: () => Promise<void>
  ) {}

  get pageCount(): number {
    return this.doc.numPages;
  }

  /** 一页按比例缩放的尺寸（CSS 像素）。 */
  async pageSize(pageNumber: number, scale: number): Promise<{ readonly width: number; readonly height: number }> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    return { width: viewport.width, height: viewport.height };
  }

  /** 一页的文本（分享、打印与复制用）。 */
  async textOf(pageNumber: number): Promise<string> {
    const page = await this.doc.getPage(pageNumber);
    const content = await page.getTextContent();
    return content.items
      .map(item => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /** 把一页画进画布：画布尺寸要已经按设备像素设好，`scale` 是 CSS 像素比例。 */
  async renderPage(pageNumber: number, canvas: HTMLCanvasElement, scale: number): Promise<void> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const dpr = devicePixelRatio || 1;
    await page.render({
      canvas,
      viewport,
      ...(dpr === 1 ? {} : { transform: [dpr, 0, 0, dpr, 0, 0] })
    }).promise;
  }

  destroy(): Promise<void> {
    return this.destroyTask();
  }
}

/** 用 pdf.js 打开一份 PDF 字节；随预览组件懒加载，只在第一次打开 PDF 时才进包。 */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const task = getDocument({ data: bytes.slice() });
  return new OpenedPdf(await task.promise, () => task.destroy());
}
