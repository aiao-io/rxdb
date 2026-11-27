import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  signal,
  viewChild,
  viewChildren
} from '@angular/core';
import type { RenderTask } from 'pdfjs-dist';
import { GlobalWorkerOptions, RenderingCancelledException } from 'pdfjs-dist';

import { useI18n } from '@aiao/rxdb-i18n-angular';

import { diskKindLabel } from '../../shared/disk-kind-label';

import { extensionOf, fileKind } from '../../disk/disk-kinds';
import { ContentActions } from '../../services/content-actions';
import { DesktopMenus } from '../../services/desktop-menus';
import { DesktopWindow } from '../../services/desktop-window';
import { FileSystem, describeDiskError } from '../../services/file-system';
import { PopoverService } from '../../services/popover';
import { PrintableContent, printableText } from '../../services/print-document';
import { Toast } from '../../services/toast';
import { WindowManager } from '../../services/window-manager';
import { clamp } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { imageDataUrl } from '../../shared/image-url';
import { TrafficLights } from '../../shared/traffic-lights';
import { MailComposer } from '../mail/mail-composer';
import { OpenedPdf, PdfTextItem, openPdf } from './pdf-viewer';
import { PdfLayerSpan, PdfSearchResult, findPageHits, layerSpans, markMatches, searchPdf } from './preview-find';

/** pdf.js 的 worker 由构建配置随应用发布（`pdfjs/pdf.worker.min.mjs`）。 */
GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;

/** 预览窗口里显示什么：读取中、按页渲染的 PDF、图片、视频占位，或打不开的原因。 */
type PreviewView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'pdf' }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'video' }
  | { readonly kind: 'failed'; readonly reason: string };

const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic'
};

/** 放大上限：超大页面按宽度适配时也要限制内存。 */
const MAX_SCALE = 2.5;

/** 缩略图宽度（CSS 像素）。 */
const THUMB_WIDTH = 72;

/** 预览：PDF 按页渲染（D-28），图片直接显示，影片是占位；支持缩放、旋转、缩略图、键盘翻页与 PDF 文本查找。 */
@Component({
  selector: 'app-preview',
  imports: [Icon, TrafficLights],
  providers: [ContentActions],
  host: {
    style: 'display: contents',
    '(document:keydown)': 'pageKeys($event)'
  },
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
  private readonly pageInput = viewChild<ElementRef<HTMLInputElement>>('pageInput');
  private readonly thumbs = viewChildren<ElementRef<HTMLCanvasElement>>('thumb');
  private opened: OpenedPdf | null = null;
  private renderTask: RenderTask | null = null;
  private renderToken = 0;
  private thumbToken = 0;
  private closed = false;
  /** 每页的文本条目（1 倍缩放、未旋转），查找统计与命中页导航用它。 */
  private pageItems: readonly (readonly PdfTextItem[])[] = [];
  /** 当前查找词（小写）；空串表示没有查找。 */
  private query = '';
  /** 上一次渲染的页码：翻页后回到页顶，缩放重渲染不滚动。 */
  private lastPage = 0;
  /** 命中页列表里的当前位置。 */
  private searchAt = 0;

  protected readonly i18n = useI18n();
  protected readonly actions = inject(ContentActions);
  protected readonly content = computed<PrintableContent | null>(() => {
    const view = this.view();
    if (view.kind === 'image') return { title: this.name, paragraphs: [], image: { url: view.url, alt: this.name } };
    if (view.kind === 'pdf') return { title: this.name, paragraphs: this.pdfText() ? [this.pdfText()] : [] };
    return null;
  });

  protected readonly name = ((): string => {
    const file = this.win.options.file;
    return (typeof file === 'string' ? file : file?.name) || this.i18n.t('apps.preview.untitled');
  })();
  protected readonly view = signal<PreviewView>({ kind: 'loading' });
  protected readonly finding = signal(false);
  protected readonly page = signal(1);
  protected readonly pageCount = signal(0);
  protected readonly pdfText = signal('');
  /** 缩放倍数：PDF 乘进渲染比例，图片用 CSS zoom。 */
  protected readonly zoom = signal(1);
  /** 旋转角度（0/90/180/270）：PDF 在渲染视口旋转，图片用 CSS transform。 */
  protected readonly rotation = signal(0);
  /** 页码跳转输入框是否展开。 */
  protected readonly paging = signal(false);
  protected readonly search = signal<PdfSearchResult | null>(null);
  protected readonly spans = signal<readonly PdfLayerSpan[]>([]);
  protected readonly pageNumbers = computed(() => Array.from({ length: this.pageCount() }, (_, index) => index + 1));

  constructor() {
    const menus = inject(DesktopMenus);
    const destroyRef = inject(DestroyRef);
    this.win.setMenus(
      computed(() =>
        menus.standard('preview', {
          [this.i18n.t('shell.menu.sectionFile')]: [
            {
              id: 'n',
              label: this.i18n.t('shell.menu.newWindow'),
              key: '⌘N',
              run: () => this.wm.open('preview', { force: true })
            },
            { id: 'w', label: this.i18n.t('shell.menu.closeWindow'), key: '⌘W', run: () => this.wm.closeFront() },
            '-',
            {
              id: 'p',
              label: this.i18n.t('apps.preview.print'),
              key: '⌘P',
              disabled: !this.content(),
              run: () => {
                const content = this.content();
                if (content) void this.actions.print(content);
              }
            }
          ],
          [this.i18n.t('shell.menu.sectionView')]: [
            { id: 'f', label: this.i18n.t('shell.menu.enterFullScreen'), key: '⌃⌘F', run: () => this.wm.zoomFront() },
            { id: 't', label: this.i18n.t('shell.menu.showToolbar'), key: '⌥⌘T', checked: true },
            '-',
            { id: 'zi', label: this.i18n.t('apps.preview.zoomIn'), key: '⌘+', run: () => this.zoomIn() },
            { id: 'zo', label: this.i18n.t('apps.preview.zoomOut'), key: '⌘-', run: () => this.zoomOut() },
            { id: 'as', label: this.i18n.t('apps.preview.actualSize'), key: '⌘0', run: () => this.zoom.set(1) },
            '-',
            { id: 'rl', label: this.i18n.t('apps.preview.rotateLeft'), key: '⌘L', run: () => this.rotateBy(-90) },
            { id: 'rr', label: this.i18n.t('apps.preview.rotateRight'), key: '⌘R', run: () => this.rotateBy(90) }
          ]
        })
      )
    );
    this.win.beforeClose.subscribe(() => {
      this.closed = true;
      void this.opened?.destroy();
    });
    destroyRef.onDestroy(() => {
      this.closed = true;
      void this.opened?.destroy();
    });
    afterRenderEffect(() => {
      if (this.view().kind !== 'pdf') return;
      this.page();
      this.zoom();
      this.rotation();
      const canvas = this.pdfCanvas()?.nativeElement;
      const box = this.pdfBox()?.nativeElement;
      if (canvas && box) void this.renderInto(canvas, box);
    });
    afterRenderEffect(() => {
      if (this.view().kind !== 'pdf') return;
      this.pageCount();
      void this.renderThumbs();
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
          label: this.i18n.t('apps.preview.mailDraft'),
          icon: 'g-compose',
          disabled: !content,
          run: () => content && this.mail.compose(this.name, '', printableText(content))
        },
        {
          id: 'g',
          label: this.i18n.t('apps.preview.openMessages'),
          icon: 'g-facetime',
          run: () => this.wm.open('messages')
        },
        '-',
        {
          id: 'c',
          label: this.i18n.t(this.view().kind === 'pdf' ? 'apps.preview.copyText' : 'apps.preview.copyFileName'),
          disabled,
          run: () => content && this.actions.copy(this.view().kind === 'pdf' ? printableText(content) : this.name)
        },
        {
          id: 'p',
          label: this.i18n.t('apps.preview.print'),
          disabled,
          run: () => content && this.actions.print(content)
        }
      ],
      { keyboard: event.detail === 0, label: this.i18n.t('apps.preview.sharingAria') }
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
    this.query = '';
    this.search.set(null);
    this.spans.set([]);
    this.searchAt = 0;
    markMatches(this.body().nativeElement, '');
  }

  /** 查找输入：PDF 在提取的文本上定位并跳到命中页；其他视图沿用 DOM 文本高亮。 */
  protected find(value: string): void {
    const text = value.trim().toLowerCase();
    if (text.length < 2) {
      this.query = '';
      this.search.set(null);
      this.spans.set([]);
      markMatches(this.body().nativeElement, '');
      return;
    }
    if (this.view().kind !== 'pdf') {
      const count = markMatches(this.body().nativeElement, text);
      this.toast.show(count === 1 ? 'apps.preview.matchCountOne' : 'apps.preview.matchCountMany', { count });
      return;
    }
    this.query = text;
    const result = searchPdf(this.pageItems, text);
    if (!result.total) {
      this.search.set(null);
      this.spans.set([]);
      this.toast.show('apps.preview.notFound');
      return;
    }
    this.search.set(result);
    this.searchAt = 0;
    this.page.set(result.pages[0]);
    this.toast.show('apps.preview.matchesOnPages', {
      total: result.total,
      matches: this.i18n.t(result.total === 1 ? 'apps.preview.matchWordOne' : 'apps.preview.matchWordMany'),
      pages: result.pages.length,
      pageWord: this.i18n.t(result.pages.length === 1 ? 'apps.preview.pageWordOne' : 'apps.preview.pageWordMany')
    });
  }

  /** 查找框里回车跳到下一处命中的页；Shift+回车回到上一处。 */
  protected stepMatch(delta: 1 | -1): void {
    const result = this.search();
    if (!result?.pages.length) return;
    this.searchAt = (this.searchAt + delta + result.pages.length) % result.pages.length;
    this.page.set(result.pages[this.searchAt]);
  }

  /** 模板绑定用：`$event` 在 Angular 模板类型检查里是 `Event`，这里收窄成 `KeyboardEvent` 再读 `shiftKey`。 */
  protected stepMatchDirection(event: Event): void {
    this.stepMatch((event as KeyboardEvent).shiftKey ? -1 : 1);
  }

  /** 方向键与 PageUp/PageDown 翻页；仅前台窗口、没有弹出菜单、焦点不在输入框里时生效。 */
  protected pageKeys(event: KeyboardEvent): void {
    if (this.wm.front() !== this.win) return;
    if (this.popover.isOpen()) return;
    const target = event.target as HTMLElement | null;
    if (target && /input|textarea/i.test(target.tagName)) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown' || event.key === 'PageDown') {
      event.preventDefault();
      this.nextPage();
      return;
    }
    if (event.key === 'ArrowLeft' || event.key === 'ArrowUp' || event.key === 'PageUp') {
      event.preventDefault();
      this.prevPage();
    }
  }

  /** 解码不了的图片（例如占位的 HEIC）改为说明打不开。 */
  protected imageFailed(): void {
    this.view.set({ kind: 'failed', reason: this.i18n.t('error.preview.imageDecode') });
  }

  protected prevPage(): void {
    if (this.page() > 1) this.page.update(number => number - 1);
  }

  protected nextPage(): void {
    if (this.page() < this.pageCount()) this.page.update(number => number + 1);
  }

  protected zoomIn(): void {
    this.zoom.update(value => Math.min(4, Math.round(value * 125) / 100));
  }

  protected zoomOut(): void {
    this.zoom.update(value => Math.max(0.25, Math.round(value * 80) / 100));
  }

  /** 按 90 度步进旋转；PDF 旋转渲染视口，图片旋转 CSS transform。 */
  protected rotateBy(delta: -90 | 90): void {
    this.rotation.update(value => (value + delta + 360) % 360);
  }

  /** 点页码进入跳转输入框。 */
  protected startPaging(): void {
    this.paging.set(true);
    setTimeout(() => this.pageInput()?.nativeElement.focus(), 0);
  }

  protected jumpPage(value: string): void {
    const number = Number.parseInt(value, 10);
    this.paging.set(false);
    if (!Number.isFinite(number)) return;
    this.page.set(clamp(number, 1, this.pageCount()));
  }

  protected cancelPaging(): void {
    this.paging.set(false);
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
      this.view.set({ kind: 'failed', reason: this.i18n.t('error.preview.notOnHd') });
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
      if (this.closed) {
        void doc.destroy();
        return;
      }
      this.opened = doc;
      this.pageCount.set(doc.pageCount);
      this.page.set(1);
      /* 分享与打印用的全篇文本先提取完再显示 PDF（复制/打印不能拿到半截文本）；查找用的带位置文本后台提取。 */
      this.pdfText.set(await this.collectText(doc));
      this.view.set({ kind: 'pdf' });
      void this.collectItems(doc);
    } catch {
      if (!this.closed) this.view.set({ kind: 'failed', reason: this.i18n.t('error.preview.pdfRead') });
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

  /** 每页带位置的文本条目在后台提取，查找定位用它。 */
  private async collectItems(doc: OpenedPdf): Promise<void> {
    const pages: (readonly PdfTextItem[])[] = [];
    for (let number = 1; number <= doc.pageCount; number++) pages.push(await doc.textItemsOf(number, 1));
    if (!this.closed) this.pageItems = pages;
  }

  /** 把当前页画进画布：按容器宽度适配（有放大上限），乘上缩放；开始新的渲染前取消旧任务。 */
  private async renderInto(canvas: HTMLCanvasElement, box: HTMLElement): Promise<void> {
    const doc = this.opened;
    if (!doc) return;
    const pageNumber = this.page();
    const token = ++this.renderToken;
    this.renderTask?.cancel();
    this.renderTask = null;
    try {
      const size = await doc.pageSize(pageNumber, 1, this.rotation());
      if (token !== this.renderToken) return;
      const scale = Math.min(box.clientWidth / size.width, MAX_SCALE) * this.zoom();
      const dpr = devicePixelRatio || 1;
      canvas.width = Math.round(size.width * scale * dpr);
      canvas.height = Math.round(size.height * scale * dpr);
      canvas.style.width = `${Math.round(size.width * scale)}px`;
      canvas.style.height = `${Math.round(size.height * scale)}px`;
      const task = await doc.renderPage(pageNumber, canvas, scale, this.rotation());
      if (token !== this.renderToken) {
        task.cancel();
        return;
      }
      this.renderTask = task;
      await task.promise;
      if (token !== this.renderToken || this.closed) return;
      if (this.lastPage !== pageNumber) {
        this.lastPage = pageNumber;
        box.scrollTo({ top: 0 });
      }
      void this.renderLayer(pageNumber, scale);
    } catch (error) {
      if (token === this.renderToken && !this.closed && !(error instanceof RenderingCancelledException))
        this.view.set({ kind: 'failed', reason: this.i18n.t('error.preview.pdfRender') });
    }
  }

  /** 查找高亮层：按当前页渲染时的缩放与旋转取带位置的文本，命中处包 `<mark>`。 */
  private async renderLayer(pageNumber: number, scale: number): Promise<void> {
    const doc = this.opened;
    const query = this.query;
    if (!doc || query.length < 2) {
      this.spans.set([]);
      return;
    }
    try {
      const items = await doc.textItemsOf(pageNumber, scale, this.rotation());
      const hits = findPageHits(items, query);
      this.spans.set(hits.length ? layerSpans(items, hits) : []);
    } catch {
      this.spans.set([]);
    }
  }

  /** 侧栏逐页小画布：按 72px 宽依次渲染，新一轮变化到来就放弃旧任务。 */
  private async renderThumbs(): Promise<void> {
    const doc = this.opened;
    if (!doc) return;
    const token = ++this.thumbToken;
    const canvases = this.thumbs().map(ref => ref.nativeElement);
    for (let index = 0; index < canvases.length; index++) {
      if (token !== this.thumbToken || this.closed) return;
      const canvas = canvases[index];
      try {
        const size = await doc.pageSize(index + 1, 1);
        if (token !== this.thumbToken) return;
        const scale = THUMB_WIDTH / size.width;
        const dpr = devicePixelRatio || 1;
        canvas.width = Math.round(size.width * scale * dpr);
        canvas.height = Math.round(size.height * scale * dpr);
        canvas.style.width = `${THUMB_WIDTH}px`;
        canvas.style.height = `${Math.round(size.height * scale)}px`;
        const task = await doc.renderPage(index + 1, canvas, scale);
        if (token !== this.thumbToken) {
          task.cancel();
          return;
        }
        await task.promise;
      } catch {
        /* 缩略图失败不挡正文，继续下一页。 */
      }
    }
  }

  private describe(extension: string, bytes: Uint8Array): PreviewView {
    const type = IMAGE_TYPES[extension];
    if (type) return { kind: 'image', url: imageDataUrl(bytes, type) };
    return {
      kind: 'failed',
      reason: this.i18n.t('error.preview.cannotOpenKind', {
        kind: diskKindLabel(this.i18n.t, fileKind(this.name).kind)
      })
    };
  }
}
