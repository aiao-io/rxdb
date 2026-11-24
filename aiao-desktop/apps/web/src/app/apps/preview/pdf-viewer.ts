import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { getDocument } from 'pdfjs-dist';

/** pdf.js 一页文本条目在视口里的位置：坐标与字号都按传入的缩放与旋转换算成 CSS 像素。 */
export interface PdfTextItem {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** 一次打开的 PDF：按页取文本或把一页画进画布；用完要 {@link destroy}。 */
export class OpenedPdf {
  get pageCount(): number {
    return this.doc.numPages;
  }

  constructor(
    private readonly doc: PDFDocumentProxy,
    private readonly destroyTask: () => Promise<void>
  ) {}

  /** 一页按比例缩放的尺寸（CSS 像素，含旋转后的宽高）。 */
  async pageSize(
    pageNumber: number,
    scale: number,
    rotation = 0
  ): Promise<{ readonly width: number; readonly height: number }> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });
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

  /** 一页的文本条目（带位置），查找高亮用它；坐标按 viewport（含缩放与旋转）换算成 CSS 像素。 */
  async textItemsOf(pageNumber: number, scale: number, rotation = 0): Promise<readonly PdfTextItem[]> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });
    const content = await page.getTextContent();
    const items: PdfTextItem[] = [];
    for (const item of content.items) {
      if (!('str' in item) || !item.str) continue;
      const [x, y] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]) as [number, number];
      const [x2, y2] = viewport.convertToViewportPoint(
        item.transform[4] + item.width,
        item.transform[5] + item.height
      ) as [number, number];
      items.push({ text: item.str, x, y, width: Math.abs(x2 - x), height: Math.abs(y2 - y) });
    }
    return items;
  }

  /**
   * 把一页画进画布（尺寸要已按设备像素设好），返回进行中的渲染任务；
   * 调用方开始下一次渲染前要先 cancel 掉旧任务，两次渲染不能并发写同一块画布。
   */
  async renderPage(pageNumber: number, canvas: HTMLCanvasElement, scale: number, rotation = 0): Promise<RenderTask> {
    const page = await this.doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale, rotation });
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
