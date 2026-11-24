import { Component, DestroyRef, ElementRef, afterRenderEffect, computed, inject, signal, viewChild } from '@angular/core';
import { GlobalWorkerOptions } from 'pdfjs-dist';

import { extensionOf, fileKind } from '../../disk/disk-kinds';
import { ContentActions } from '../../services/content-actions';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileSystem, FsNode, describeDiskError } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { PrintableContent, printableText } from '../../services/print-document';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { Icon } from '../../shared/icon';
import { imageDataUrl } from '../../shared/image-url';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from '../mail/mail-composer';
import { markMatches } from './preview-find';
import { OpenedPdf, openPdf } from './pdf-viewer';

/** pdf.js 的 worker 由构建配置随应用发布（`pdfjs/pdf.worker.min.mjs`）。 */
GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;

/** 预览窗口里显示什么：读取中、按页渲染的 PDF、图片、视频占位，或打不开的原因。 */
type PreviewView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'pdf' }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'video' }
  | { readonly kind: 'failed'; readonly reason: string };

const fileName = (file: string | FsNode | undefined): string =>
  (typeof file === 'string' ? file : file?.name) || 'Untitled';

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic'
};

/** 放大上限：超大页面按宽度适配时也要限制内存。 */
const MAX_SCALE = 2.5;

/** 预览：PDF 按页渲染（D-28），图片直接显示，影片是占位，标题栏带分享菜单和会高亮匹配的查找框。 */
@Component({
  selector: 'app-preview',
  imports: [Icon, TrafficLights],
  providers: [ContentActions],
  host: { style: 'display: contents' },
  templateUrl: './preview.html'
})
export class PreviewApp {
  private readonly win = inject(DesktopWindow);
  private readonly fs = inject(FileSystem);
  private readonly popover = inject(PopoverService);
  private readonly toast = inject(Toast);
  private readonly wm = inject(WindowManager);
  private readonly mail = inject(MailComposer);
  private readonly body = viewChild.required<ElementRef<HTMLElement>>('body');
  private readonly field = viewChild.required<ElementRef<HTMLInputElement>>('field');
  private readonly pdfCanvas = viewChild<ElementRef<HTMLCanvasElement>>('pdfCanvas');
  private readonly pdfBox = viewChild<ElementRef<HTMLElement>>('pdfBox');
  private opened: OpenedPdf | null = null;
  private renderToken = 0;

  protected readonly actions = inject(ContentActions);
  protected readonly content = computed<PrintableContent | null>(() => {
    const view = this.view();
    if (view.kind === 'image') return { title: this.name, paragraphs: [], image: { url: view.url, alt: this.name } };
    if (view.kind === 'pdf') return { title: this.name, paragraphs: this.pdfText() ? [this.pdfText()] : [] };
    return null;
  });

  protected readonly name = fileName(this.win.options.file);
  protected readonly view = signal<PreviewView>({ kind: 'loading' });
  protected readonly finding = signal(false);
  protected readonly page = signal(1);
  protected readonly pageCount = signal(0);
  protected readonly pdfText = signal('');

  constructor() {
    const menus = inject(DesktopMenus);
    const destroyRef = inject(DestroyRef);
    this.win.setMenus(computed(() => menus.standard('preview')));
    this.win.beforeClose.subscribe(() => void this.opened?.destroy());
    destroyRef.onDestroy(() => void this.opened?.destroy());
    afterRenderEffect(() => {
      if (this.view().kind !== 'pdf') return;
      this.page();
      const canvas = this.pdfCanvas()?.nativeElement;
      const box = this.pdfBox()?.nativeElement;
      if (canvas && box) void this.renderInto(canvas, box);
    });
    void this.load();
  }

  protected openShare(anchor: HTMLElement, event: MouseEvent): void {
    const content = this.content();
    const disabled = !content || this.actions.busy();
    this.popover.menuUnder(
      anchor,
      [
        {
          id: 'm',
          label: 'Mail Draft',
          icon: 'g-compose',
          disabled: !content,
          run: () => content && this.mail.compose(this.name, '', printableText(content))
        },
        { id: 'g', label: 'Open Messages', icon: 'g-facetime', run: () => this.wm.open('messages') },
        '-',
        {
          id: 'c',
          label: this.view().kind === 'pdf' ? 'Copy Text' : 'Copy File Name',
          disabled,
          run: () => content && this.actions.copy(this.view().kind === 'pdf' ? printableText(content) : this.name)
        },
        { id: 'p', label: 'Print…', disabled, run: () => content && this.actions.print(content) }
      ],
      { keyboard: event.detail === 0, label: 'preview sharing' }
    );
  }

  /** 查找框展开时聚焦，收起时清空输入并去掉高亮。 */
  protected toggleFind(): void {
    const opening = !this.finding();
    this.finding.set(opening);
    const input = this.field().nativeElement;
    if (opening) {
      input.focus();
      return;
    }
    input.value = '';
    markMatches(this.body().nativeElement, '');
  }

  protected find(value: string): void {
    const text = value.trim();
    const count = markMatches(this.body().nativeElement, text.toLowerCase());
    if (text.length > 1) this.toast.show(count ? `${count} ${count === 1 ? 'match' : 'matches'}` : 'Not found');
  }

  /** 解码不了的图片（例如占位的 HEIC）改为说明打不开。 */
  protected imageFailed(): void {
    this.view.set({ kind: 'failed', reason: 'The image data could not be decoded.' });
  }

  protected prevPage(): void {
    if (this.page() > 1) this.page.update(number => number - 1);
  }

  protected nextPage(): void {
    if (this.page() < this.pageCount()) this.page.update(number => number + 1);
  }

  /** 图片显示文件本身（由 storage 插件读出的字节）；PDF 交给 pdf.js；读不了的说明原因。 */
  private async load(): Promise<void> {
    const extension = extensionOf(this.name);
    if (extension === 'mp4' || extension === 'mov') {
      this.view.set({ kind: 'video' });
      return;
    }
    const path = this.win.options.node?.path;
    if (!path) {
      this.view.set({ kind: 'failed', reason: 'The file is not on Macintosh HD.' });
      return;
    }
    try {
      const bytes = await this.fs.read(path);
      if (extension === 'pdf') await this.loadPdf(bytes);
      else this.view.set(this.describe(extension, bytes));
    } catch (error) {
      this.view.set({ kind: 'failed', reason: describeDiskError(error) });
    }
  }

  private async loadPdf(bytes: Uint8Array): Promise<void> {
    try {
      const doc = await openPdf(bytes);
      this.opened = doc;
      this.pageCount.set(doc.pageCount);
      this.page.set(1);
      this.pdfText.set(await this.collectText(doc));
      this.view.set({ kind: 'pdf' });
    } catch {
      this.view.set({ kind: 'failed', reason: 'The PDF data could not be read.' });
    }
  }

  /** 全篇文本按页拼起来，分享与打印用它（不是页面截图）。 */
  private async collectText(doc: OpenedPdf): Promise<string> {
    const pages: string[] = [];
    for (let number = 1; number <= doc.pageCount; number++) {
      const text = await doc.textOf(number);
      if (text) pages.push(text);
    }
    return pages.join('\n');
  }

  /** 把当前页画进画布：按容器宽度适配（有放大上限），翻页后旧渲染的结果不覆盖新页。 */
  private async renderInto(canvas: HTMLCanvasElement, box: HTMLElement): Promise<void> {
    const doc = this.opened;
    if (!doc) return;
    const token = ++this.renderToken;
    const size = await doc.pageSize(this.page(), 1);
    const scale = Math.min(box.clientWidth / size.width, MAX_SCALE);
    if (token !== this.renderToken) return;
    const dpr = devicePixelRatio || 1;
    canvas.width = Math.round(size.width * scale * dpr);
    canvas.height = Math.round(size.height * scale * dpr);
    canvas.style.width = `${Math.round(size.width * scale)}px`;
    canvas.style.height = `${Math.round(size.height * scale)}px`;
    try {
      await doc.renderPage(this.page(), canvas, scale);
    } catch {
      if (token === this.renderToken) this.view.set({ kind: 'failed', reason: 'The PDF page could not be rendered.' });
    }
  }

  private describe(extension: string, bytes: Uint8Array): PreviewView {
    const type = IMAGE_TYPES[extension];
    if (type) return { kind: 'image', url: imageDataUrl(bytes, type) };
    return { kind: 'failed', reason: `Preview can’t open ${fileKind(this.name).kind} files.` };
  }
}
