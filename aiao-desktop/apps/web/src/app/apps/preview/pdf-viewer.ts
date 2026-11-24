import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { getDocument } from 'pdfjs-dist';

/** 一次打开的 PDF：按页取文本或把一页画进画布；用完要 {@link destroy}。 */
export class OpenedPdf {
  get pageCount(): number {
    return this.doc.numPages;
  }

  constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly destroyTask: () => Promise<void>
  ) {}

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

  /**
   * 把一页画进画布（尺寸要已按设备像素设好），返回进行中的渲染任务；
   * 调用方开始下一次渲染前要先 cancel 掉旧任务，两次渲染不能并发写同一块画布。
   */
  async renderPage(pageNumber: number, canvas: HTMLCanvasElement, scale: number): Promise<RenderTask> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const dpr = devicePixelRatio || 1;
    return page.render({
      canvas,
      viewport,
      ...(dpr === 1 ? {} : { transform: [dpr, 0, 0, dpr, 0, 0] })
    });
  }

  destroy(): Promise<void> {
    return this.destroyTask();
  }
}

/** 用 pdf.js 打开一份 PDF 字节；随预览组件懒加载，只在第一次打开 PDF 时才进包。 */
export async function openPdf(bytes: Uint8Array): Promise<OpenedPdf> {
  const task = getDocument({ data: bytes.slice() });
  try {
    return new OpenedPdf(await task.promise, () => task.destroy());
  } catch (error) {
    void task.destroy();
    throw error;
  }
}
