import {
  DestroyRef,
  Directive,
  ElementRef,
  HostAttributeToken,
  Service,
  afterNextRender,
  inject,
  input,
  signal
} from '@angular/core';

/** 同时在下载的图片上限。 */
const MAX_ACTIVE = 5;
/** 失败后最多重试几次。 */
const MAX_RETRIES = 3;

/** 排队中的一张图：轮到它时开始下载。 */
export interface QueuedImage {
  readonly element: Element;
  /** 已经有结果（成功或彻底失败）的图不再进队。 */
  readonly settled: boolean;
  begin(): void;
}

/**
 * 缩略图下载队列。四十张格子同时向维基共享资源要缩略图，换来的是一墙 429，Chromium
 * 再把它们统统拦掉，格子全是灰的。所以一次只下几张，只下接近视口的，被拒绝的请求稍后重试。
 */
@Service()
export class PhotoLoadQueue {
  private readonly line: QueuedImage[] = [];
  private readonly watching = new Map<Element, QueuedImage>();
  private readonly observer = new IntersectionObserver(entries => this.admit(entries), { rootMargin: '320px' });
  private active = 0;

  /** 进入视口附近才排队。 */
  watch(image: QueuedImage): void {
    this.watching.set(image.element, image);
    this.observer.observe(image.element);
  }

  /** 插队：用户点开的那张照片不等进入视口，直接排到最前。 */
  jump(image: QueuedImage): void {
    this.line.unshift(image);
    this.pump();
  }

  /** 重试：排到队尾。 */
  requeue(image: QueuedImage): void {
    this.line.push(image);
    this.pump();
  }

  /** 一张图下载结束（成功、彻底失败或元素已卸载），归还名额。 */
  release(): void {
    this.active--;
    this.pump();
  }

  /** 元素卸载：不再观察，也不再排队。 */
  forget(image: QueuedImage): void {
    this.observer.unobserve(image.element);
    this.watching.delete(image.element);
    const at = this.line.indexOf(image);
    if (at >= 0) this.line.splice(at, 1);
  }

  private admit(entries: readonly IntersectionObserverEntry[]): void {
    for (const entry of entries) {
      const image = this.watching.get(entry.target);
      if (!entry.isIntersecting || !image) continue;
      this.observer.unobserve(entry.target);
      this.watching.delete(entry.target);
      this.line.push(image);
    }
    this.pump();
  }

  private pump(): void {
    while (this.active < MAX_ACTIVE && this.line.length) {
      const image = this.line.shift();
      if (!image || image.settled) continue;
      this.active++;
      image.begin();
    }
  }
}

/**
 * `<img [appPhotoSrc]="url">`：地址交给下载队列，轮到才设 `src`。加载成功加 `in`（淡入），
 * 重试三次仍失败加 `failed`。带 `data-first` 的图（打开的那张）插队。
 */
@Directive({
  selector: 'img[appPhotoSrc]',
  host: {
    'data-q': '1',
    '[attr.data-src]': 'appPhotoSrc()',
    '[attr.data-try]': 'attempts() || null',
    '[attr.data-done]': 'settled ? "1" : null',
    '[attr.src]': 'src()',
    '[class.in]': 'shown()',
    '[class.failed]': 'broken()',
    '(load)': 'loaded()',
    '(error)': 'errored()'
  }
})
export class PhotoSrc implements QueuedImage {
  private readonly queue = inject(PhotoLoadQueue);
  private readonly first = inject(new HostAttributeToken('data-first'), { optional: true }) !== null;
  private retry: ReturnType<typeof setTimeout> | undefined;
  private loading = false;

  protected readonly src = signal<string | null>(null);
  protected readonly attempts = signal(0);
  protected readonly shown = signal(false);
  protected readonly broken = signal(false);

  readonly element = inject<ElementRef<Element>>(ElementRef).nativeElement;
  readonly appPhotoSrc = input.required<string>();

  get settled(): boolean {
    return this.shown() || this.broken();
  }

  constructor() {
    afterNextRender(() => (this.first ? this.queue.jump(this) : this.queue.watch(this)));
    inject(DestroyRef).onDestroy(() => {
      clearTimeout(this.retry);
      this.queue.forget(this);
      if (this.loading) this.queue.release();
    });
  }

  begin(): void {
    this.loading = true;
    /* 重试要换一个缓存里没有登记为损坏的地址；共享资源会忽略缩略图上的未知查询参数，所以这是免费的破缓存。 */
    const tries = this.attempts();
    this.src.set(this.appPhotoSrc() + (tries > 0 ? `?r=${tries}` : ''));
  }

  protected loaded(): void {
    this.shown.set(true);
    this.finish();
  }

  protected errored(): void {
    const tries = this.attempts() + 1;
    this.attempts.set(tries);
    if (tries <= MAX_RETRIES) this.retry = setTimeout(() => this.queue.requeue(this), 500 * tries * tries);
    else this.broken.set(true);
    this.finish();
  }

  private finish(): void {
    this.loading = false;
    this.queue.release();
  }
}
