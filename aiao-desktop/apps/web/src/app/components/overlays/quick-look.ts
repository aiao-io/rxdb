import {
  Component,
  DestroyRef,
  ElementRef,
  afterRenderEffect,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild
} from '@angular/core';
import type { RenderTask } from 'pdfjs-dist';

import type { OpenedPdf } from '../../apps/preview/pdf-viewer';
import { extensionOf, isTextName } from '../../disk/disk-kinds';
import { FileSystem, FsNode, describeDiskError } from '../../services/file-system';
import { PopoverCloseReason, PopoverService, RETURNS_FOCUS } from '../../services/popover';
import { finderDate } from '../../shared/format';
import { Icon } from '../../shared/icon';
import { imageDataUrl } from '../../shared/image-url';

/** Quick Look 面板的固定宽度（CSS 像素），`showQuickLook` 据此在视口里居中。 */
export const QUICK_LOOK_WIDTH = 720;

/** Quick Look 面板的固定高度（CSS 像素），`showQuickLook` 据此在视口里居中。 */
export const QUICK_LOOK_HEIGHT = 520;

/** 预览缩放的最小倍率（25%）。 */
export const ZOOM_MIN = 0.25;

/** 预览缩放的最大倍率（400%）。 */
export const ZOOM_MAX = 4;

/** 文本预览最多展示的字符数。 */
export const TEXT_PREVIEW_LIMIT = 2000;

/** 每一步缩放按 1.25 倍等比进出。 */
const ZOOM_STEP = 1.25;

/** 能直接放进 `data:` 地址的图片扩展名与对应 MIME。 */
const IMAGE_TYPES: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  heic: 'image/heic'
};

/** Quick Look 的预览方式。 */
export type QuickLookKind = 'image' | 'pdf' | 'text' | 'video' | 'other';

/**
 * 按文件名判定 Quick Look 的预览方式：图片、PDF、纯文本与影片有专属预览，
 * 目录与认不出的文件落到「无预览」占位。扩展名大小写不敏感。
 */
export function quickLookKindOf(name: string, kind: 'file' | 'folder'): QuickLookKind {
  if (kind === 'folder') return 'other';
  const extension = extensionOf(name);
  if (extension === 'pdf') return 'pdf';
  if (extension === 'mp4' || extension === 'mov') return 'video';
  if (IMAGE_TYPES[extension]) return 'image';
  if (isTextName(name)) return 'text';
  return 'other';
}

/**
 * 列表里的循环索引：向前（`1`）越过末尾绕回第一项，向后（`-1`）越过开头绕到最后一项；空列表恒为 `0`。
 */
export function cycleIndex(length: number, index: number, direction: -1 | 1): number {
  if (length <= 0) return 0;
  return (index + direction + length) % length;
}

/** 在 `siblings` 里取 `current` 的上/下一项（循环）；`current` 不在列表里时原样返回。 */
export function stepSibling(siblings: readonly FsNode[], current: FsNode, direction: -1 | 1): FsNode {
  const index = siblings.indexOf(current);
  if (index < 0) return current;
  return siblings[cycleIndex(siblings.length, index, direction)] ?? current;
}

/**
 * 缩放步进：`1` 放大一档、`-1` 缩小一档（1.25 倍等比），`0` 复位到 100%。
 * 结果夹在 {@link ZOOM_MIN} 与 {@link ZOOM_MAX} 之间，并四舍五入到 4 位小数，避免浮点误差累积。
 */
export function zoomBy(current: number, direction: -1 | 1 | 0): number {
  if (direction === 0) return 1;
  const next = current * (direction > 0 ? ZOOM_STEP : 1 / ZOOM_STEP);
  return Math.round(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next)) * 10000) / 10000;
}

/** 文本预览：超出 {@link TEXT_PREVIEW_LIMIT} 的只留开头部分并加省略号。 */
export function previewText(text: string): string {
  return text.length <= TEXT_PREVIEW_LIMIT ? text : `${text.slice(0, TEXT_PREVIEW_LIMIT)}…`;
}

/**
 * 打开 Quick Look 浮层：在视口中央预览 `node`（图片 / PDF / 文本 / 视频占位）。
 * `siblings` 是同一批预览的条目（例如 Finder 当前目录里的文件），方向键与工具条的上/下一项在它们之间循环切换；
 * Esc、点外面与空格关闭（前两者由弹出层基础设施处理），⌘+/⌘−/⌘0 缩放图片与 PDF。
 */
export function showQuickLook(popover: PopoverService, node: FsNode, siblings?: readonly FsNode[]): void {
  const anchor = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  popover.openComponent(
    QuickLook,
    {
      x: Math.max(8, Math.round((innerWidth - QUICK_LOOK_WIDTH) / 2)),
      y: Math.max(8, Math.round((innerHeight - QUICK_LOOK_HEIGHT) / 2)),
      origin: 'top left',
      focus: true,
      onClose: (reason: PopoverCloseReason) => {
        if (RETURNS_FOCUS.has(reason)) anchor?.focus();
      }
    },
    { node, siblings: siblings ?? [] }
  );
}

/** Quick Look 浮层里显示什么：读取中、图片、逐页渲染的 PDF、文本、影片占位、无预览或读不了的原因。 */
type QuickLookView =
  | { readonly kind: 'loading' }
  | { readonly kind: 'image'; readonly url: string }
  | { readonly kind: 'pdf' }
  | { readonly kind: 'text'; readonly text: string }
  | { readonly kind: 'video' }
  | { readonly kind: 'other' }
  | { readonly kind: 'failed'; readonly reason: string };

/**
 * Quick Look 浮层：居中毛玻璃面板，图片（复用 `imageDataUrl`）、PDF（懒加载 pdf.js 逐页画布）与文本
 * （前 {@link TEXT_PREVIEW_LIMIT} 字符）直接预览，影片与无预览的条目显示占位。工具条可关闭、
 * 在同一批条目里循环切换与缩放；Esc / 点外面 / 空格关闭（前两者由弹出层基础设施处理），方向键切换条目。
 */
@Component({
  selector: 'app-quick-look',
  imports: [Icon],
  host: { '(keydown)': 'onKey($event)' },
  template: `
    <div class="ql" [attr.aria-label]="'Quick Look — ' + active().name" data-quick-look role="dialog">
      <div class="bar">
        <button class="b" (click)="close()" aria-label="Close Quick Look" tabindex="0" title="Close" type="button">
          <svg appIcon="g-x"></svg>
        </button>
        <div class="title">
          <svg class="ti" [appIcon]="active().icon"></svg>
          <span class="nm">{{ active().name }}</span>
        </div>
        <div class="nav">
          <button
            class="b"
            [disabled]="siblings().length < 2"
            (click)="step(-1)"
            aria-keyshortcuts="ArrowLeft"
            aria-label="Previous item"
            tabindex="0"
            title="Previous item"
            type="button"
          >
            <svg appIcon="g-chev-l"></svg>
          </button>
          <button
            class="b"
            [disabled]="siblings().length < 2"
            (click)="step(1)"
            aria-keyshortcuts="ArrowRight"
            aria-label="Next item"
            tabindex="0"
            title="Next item"
            type="button"
          >
            <svg appIcon="g-chev-r"></svg>
          </button>
        </div>
        <div class="zbox">
          <button
            class="b"
            [disabled]="!zoomable()"
            (click)="setZoom(-1)"
            aria-keyshortcuts="Meta+-"
            aria-label="Zoom out"
            tabindex="0"
            title="Zoom out"
            type="button"
          >
            <svg appIcon="g-minus"></svg>
          </button>
          <span class="zp" aria-hidden="true">{{ zoomPercent() }}</span>
          <button
            class="b"
            [disabled]="!zoomable()"
            (click)="setZoom(1)"
            aria-keyshortcuts="Meta+="
            aria-label="Zoom in"
            tabindex="0"
            title="Zoom in"
            type="button"
          >
            <svg appIcon="g-plus"></svg>
          </button>
        </div>
      </div>
      <div class="body">
        @let qlView = view();
        @switch (qlView.kind) {
          @case ('loading') {
            <div class="msg">Loading…</div>
          }
          @case ('image') {
            @if (qlView.kind === 'image') {
              <img
                class="pic"
                [alt]="active().name"
                [src]="qlView.url"
                [style.width.px]="imageWidth()"
                (error)="imageFailed()"
                (load)="sized($event)"
              />
            }
          }
          @case ('pdf') {
            @if (qlView.kind === 'pdf') {
              <div class="pdf-box" #pdfBox><canvas #pdfCanvas></canvas></div>
            }
          }
          @case ('text') {
            @if (qlView.kind === 'text') {
              <pre class="txt">{{ qlView.text }}</pre>
            }
          }
          @case ('video') {
            <div class="msg">
              <svg class="art" appIcon="f-movie"></svg>
              <div class="hint">Video preview is not available in this desktop.</div>
            </div>
          }
          @case ('other') {
            <div class="msg">
              <svg class="art" [appIcon]="active().icon"></svg>
              <div class="hint">No preview available.</div>
            </div>
          }
          @case ('failed') {
            @if (qlView.kind === 'failed') {
              <div class="msg">{{ qlView.reason }}</div>
            }
          }
        }
      </div>
      <div class="foot">
        <span class="meta">{{ meta() }}</span>
        @if (view().kind === 'pdf') {
          <div class="pages">
            <button
              class="b"
              [disabled]="page() <= 1"
              (click)="prevPage()"
              aria-label="Previous page"
              tabindex="0"
              title="Previous page"
              type="button"
            >
              <svg appIcon="g-chev-u"></svg>
            </button>
            <span class="pg" role="status">{{ page() }} / {{ pageCount() }}</span>
            <button
              class="b"
              [disabled]="page() >= pageCount()"
              (click)="nextPage()"
              aria-label="Next page"
              tabindex="0"
              title="Next page"
              type="button"
            >
              <svg appIcon="g-chev-d"></svg>
            </button>
          </div>
        }
      </div>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      display: block;
    }
    .ql {
      width: 720px;
      height: 520px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border: 1px solid var(--glass-dock-edge);
      border-radius: 14px;
      background: color-mix(in srgb, var(--win-2) 88%, transparent);
      color: var(--txt);
      box-shadow: 0 18px 60px #0006;
      -webkit-backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
      backdrop-filter: blur(var(--glass-blur)) saturate(1.6);
    }
    .bar {
      flex: none;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 10px 12px;
      border-bottom: 1px solid #8888;
    }
    .b {
      width: 30px;
      height: 26px;
      flex: none;
      display: grid;
      place-items: center;
      padding: 0;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--txt);
    }
    .b:hover:not(:disabled) {
      background: #8883;
    }
    .b:disabled {
      opacity: 0.35;
    }
    .b svg {
      width: 15px;
      height: 15px;
    }
    .title {
      flex: 1;
      min-width: 0;
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 0 4px;
    }
    .ti {
      width: 22px;
      height: 22px;
      flex: none;
    }
    .nm {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-size: 14px;
      font-weight: 600;
    }
    .nav {
      flex: none;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .zbox {
      flex: none;
      display: flex;
      align-items: center;
      gap: 2px;
      border-left: 1px solid #8888;
      padding-left: 8px;
      margin-left: 4px;
    }
    .zp {
      min-width: 52px;
      text-align: center;
      font-size: 12px;
      color: var(--txt-2);
      font-variant-numeric: tabular-nums;
    }
    .body {
      flex: 1;
      min-height: 0;
      overflow: auto;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .pic {
      flex: none;
      margin: auto;
      display: block;
      max-width: none;
      box-shadow: 0 10px 40px -12px #0009;
    }
    .pdf-box {
      flex: 1;
      min-width: 0;
      min-height: 0;
      overflow: auto;
      display: grid;
      place-items: start center;
      padding: 18px;
    }
    .pdf-box canvas {
      display: block;
      box-shadow: 0 10px 40px -12px #0009;
    }
    .txt {
      align-self: flex-start;
      width: 100%;
      margin: 0;
      padding: 14px 18px;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      font:
        13px/1.55 ui-monospace,
        'SF Mono',
        Menlo,
        monospace;
      color: var(--txt);
      user-select: text;
    }
    .msg {
      margin: auto;
      display: grid;
      justify-items: center;
      gap: 12px;
      color: var(--txt-2);
      text-align: center;
      font-size: 13px;
    }
    .art {
      width: 72px;
      height: 72px;
      opacity: 0.9;
    }
    .hint {
      max-width: 320px;
    }
    .foot {
      flex: none;
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px 14px;
      border-top: 1px solid #8888;
      font-size: 12px;
      color: var(--txt-2);
    }
    .meta {
      flex: 1;
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pages {
      flex: none;
      display: flex;
      align-items: center;
      gap: 2px;
    }
    .pg {
      min-width: 56px;
      text-align: center;
      font-variant-numeric: tabular-nums;
    }
  `
})
export class QuickLook {
  private readonly popover = inject(PopoverService);
  private readonly fs = inject(FileSystem);
  private readonly destroyRef = inject(DestroyRef);
  private readonly pdfCanvas = viewChild.required<ElementRef<HTMLCanvasElement>>('pdfCanvas');
  private readonly pdfBox = viewChild.required<ElementRef<HTMLElement>>('pdfBox');
  private opened: OpenedPdf | null = null;
  private renderTask: RenderTask | null = null;
  private loadToken = 0;
  private renderToken = 0;
  private closed = false;
  /** 当前图片的原始宽度（px）：加载完成后由 `load` 事件记下，缩放按实际尺寸计算。 */
  private readonly naturalWidth = signal<number | null>(null);

  /** 用户切换到的条目：没切换过是 `null`（显示打开时传入的 `node`）。 */
  protected readonly current = signal<FsNode | null>(null);
  protected readonly view = signal<QuickLookView>({ kind: 'loading' });
  protected readonly zoom = signal(1);
  protected readonly page = signal(1);
  protected readonly pageCount = signal(0);
  /** 当前展示的条目。 */
  protected readonly active = computed(() => this.current() ?? this.node());
  /** 只有图片与 PDF 能缩放。 */
  protected readonly zoomable = computed(() => {
    const kind = this.view().kind;
    return kind === 'image' || kind === 'pdf';
  });
  /** 工具条上的缩放百分比，例如 `100%`。 */
  protected readonly zoomPercent = computed(() => `${Math.round(this.zoom() * 100)}%`);
  /** 图片按实际尺寸 × 缩放倍率展示（⌘0 即实际大小）；还没加载完时交给浏览器按原始尺寸显示。 */
  protected readonly imageWidth = computed(() => {
    const width = this.naturalWidth();
    return width ? width * this.zoom() : null;
  });
  /** 底部一行元数据：种类 · 大小 · 修改时间。 */
  protected readonly meta = computed(() => {
    const node = this.active();
    const parts = [node.k];
    if (node.size) parts.push(node.size);
    if (node.date) parts.push(finderDate(node.date));
    return parts.join(' · ');
  });

  readonly node = input.required<FsNode>();
  readonly siblings = input<readonly FsNode[]>([]);

  constructor() {
    effect(() => {
      void this.load(this.active());
    });
    afterRenderEffect(() => {
      if (this.view().kind !== 'pdf') return;
      const page = this.page();
      const zoom = this.zoom();
      const canvas = this.pdfCanvas()?.nativeElement;
      const box = this.pdfBox()?.nativeElement;
      if (canvas && box) void this.renderInto(canvas, box, page, zoom);
    });
    this.destroyRef.onDestroy(() => {
      this.closed = true;
      void this.opened?.destroy();
      this.renderTask?.cancel();
    });
  }

  /** 关闭浮层；给关闭按钮用，Esc 与点外面由弹出层基础设施处理。 */
  protected close(): void {
    this.popover.close(true, 'escape');
  }

  /** 缩放步进：`1` 放大、`-1` 缩小、`0` 复位到 100%，只对图片与 PDF 生效。 */
  protected setZoom(direction: -1 | 1 | 0): void {
    this.zoom.update(current => zoomBy(current, direction));
  }

  /** 在同一批条目里切到上/下一项（循环）。 */
  protected step(direction: -1 | 1): void {
    const active = this.current() ?? this.node();
    const next = stepSibling(this.siblings(), active, direction);
    if (next !== active) this.current.set(next);
  }

  protected prevPage(): void {
    if (this.page() > 1) this.page.update(number => number - 1);
  }

  protected nextPage(): void {
    if (this.page() < this.pageCount()) this.page.update(number => number + 1);
  }

  /** 解码不了的图片（例如占位的 HEIC）改为说明打不开。 */
  protected imageFailed(): void {
    if (this.view().kind === 'image') this.view.set({ kind: 'failed', reason: 'The image data could not be decoded.' });
  }

  /** 图片加载完成后记下原始宽度，缩放按实际尺寸计算。 */
  protected sized(event: Event): void {
    const image = event.target;
    if (image instanceof HTMLImageElement) this.naturalWidth.set(image.naturalWidth);
  }

  /**
   * 键盘：⌘+/⌘−/⌘0 缩放（在文档级分发器之前处理，桌面页不会把它们当浏览器快捷键吞掉），
   * 左右方向键在同一批条目里循环切换，空格关闭（焦点在按钮上时空格是按钮的原生激活）。
   */
  protected onKey(event: KeyboardEvent): void {
    const meta = event.metaKey || event.ctrlKey;
    if (meta && !event.altKey) {
      if (event.key === '=' || event.key === '+') {
        event.preventDefault();
        event.stopPropagation();
        this.setZoom(1);
      } else if (event.key === '-' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        this.setZoom(-1);
      } else if (event.key === '0' && !event.shiftKey) {
        event.preventDefault();
        event.stopPropagation();
        this.setZoom(0);
      }
      return;
    }
    if (event.key === 'ArrowLeft') this.stepItem(event, -1);
    else if (event.key === 'ArrowRight') this.stepItem(event, 1);
    else if (event.key === ' ') this.closeOnSpace(event);
  }

  /** 有同一批条目时方向键在它们之间切换；没有时留给滚动。 */
  private stepItem(event: KeyboardEvent, direction: -1 | 1): void {
    if (this.siblings().length < 2) return;
    event.preventDefault();
    event.stopPropagation();
    this.step(direction);
  }

  /** 空格关闭浮层；焦点在按钮上时空格由浏览器激活按钮。 */
  private closeOnSpace(event: KeyboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    this.popover.close(true, 'escape');
  }

  /** 读文件并按类型装配预览：图片 / 文本同步拼出来，PDF 懒加载 pdf.js；换条目时旧的加载作废。 */
  private async load(node: FsNode): Promise<void> {
    const token = ++this.loadToken;
    this.view.set({ kind: 'loading' });
    this.page.set(1);
    this.pageCount.set(0);
    this.zoom.set(1);
    this.naturalWidth.set(null);
    void this.opened?.destroy();
    this.opened = null;
    const kind = quickLookKindOf(node.name, node.kind);
    if (kind === 'other' || kind === 'video') {
      if (token === this.loadToken) this.view.set({ kind });
      return;
    }
    const path = node.path;
    if (!path) {
      if (token === this.loadToken) this.view.set({ kind: 'failed', reason: 'The file is not on Macintosh HD.' });
      return;
    }
    try {
      const bytes = await this.fs.read(path);
      if (token !== this.loadToken) return;
      if (kind === 'pdf') await this.loadPdf(bytes, token);
      else if (kind === 'text') this.view.set({ kind: 'text', text: previewText(new TextDecoder().decode(bytes)) });
      /* kind 是 image 当且仅当 IMAGE_TYPES 命中（quickLookKindOf 同一张表判定），这里可以直接断言。 */
      else this.view.set({ kind: 'image', url: imageDataUrl(bytes, IMAGE_TYPES[extensionOf(node.name)]!) });
    } catch (error) {
      if (token === this.loadToken) this.view.set({ kind: 'failed', reason: describeDiskError(error) });
    }
  }

  /** 懒加载 pdf.js 并逐页渲染：worker 地址与预览应用一致；浮层关闭时文档与渲染任务都要作废。 */
  private async loadPdf(bytes: Uint8Array, token: number): Promise<void> {
    try {
      const [{ openPdf }, { GlobalWorkerOptions }] = await Promise.all([
        import('../../apps/preview/pdf-viewer'),
        import('pdfjs-dist')
      ]);
      if (token !== this.loadToken || this.closed) return;
      GlobalWorkerOptions.workerSrc = new URL('pdfjs/pdf.worker.min.mjs', document.baseURI).href;
      const doc = await openPdf(bytes);
      if (token !== this.loadToken || this.closed) {
        void doc.destroy();
        return;
      }
      this.opened = doc;
      this.pageCount.set(doc.pageCount);
      this.page.set(1);
      this.view.set({ kind: 'pdf' });
    } catch {
      if (token === this.loadToken && !this.closed)
        this.view.set({ kind: 'failed', reason: 'The PDF data could not be read.' });
    }
  }

  /** 把当前页画进画布：按容器适配后乘上缩放倍率；开始新的渲染前取消旧任务，旧页的画块不会落到新页上。 */
  private async renderInto(canvas: HTMLCanvasElement, box: HTMLElement, page: number, zoom: number): Promise<void> {
    const doc = this.opened;
    if (!doc) return;
    const token = ++this.renderToken;
    this.renderTask?.cancel();
    this.renderTask = null;
    try {
      const size = await doc.pageSize(page, 1);
      if (token !== this.renderToken) return;
      /* clientWidth 含 18px 内边距，按内容区适配才不会在 100% 时多出滚动条。 */
      const fit = Math.min((box.clientWidth - 36) / size.width, (box.clientHeight - 36) / size.height);
      const scale = fit * zoom;
      const dpr = devicePixelRatio || 1;
      canvas.width = Math.round(size.width * scale * dpr);
      canvas.height = Math.round(size.height * scale * dpr);
      canvas.style.width = `${Math.round(size.width * scale)}px`;
      canvas.style.height = `${Math.round(size.height * scale)}px`;
      const task = await doc.renderPage(page, canvas, scale);
      if (token !== this.renderToken) {
        task.cancel();
        return;
      }
      this.renderTask = task;
      await task.promise;
    } catch (error) {
      if (token !== this.renderToken || this.closed) return;
      if (error instanceof Error && error.name === 'RenderingCancelledException') return;
      this.view.set({ kind: 'failed', reason: 'The PDF page could not be rendered.' });
    }
  }
}
