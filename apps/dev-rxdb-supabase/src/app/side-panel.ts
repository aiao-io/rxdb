import { CdkPortalOutlet, type Portal } from '@angular/cdk/portal';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  ElementRef,
  inject,
  Injectable,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';
import { OperationHistoryPanel } from './operation-history-panel';
import { SyncCenter } from './sync-center';

/** 右侧面板的视图：操作历史与同步中心由顶栏打开，模拟服务端变更由商品页提供 */
export type RightPanelView = 'history' | 'sync' | 'server';

/** 页面提供的面板：内容在页面里声明，渲染在右侧面板的槽位里 */
export interface PagePanel {
  readonly heading: string;
  readonly portal: Portal<unknown>;
}

const SHELL_HEADINGS: Readonly<Record<Exclude<RightPanelView, 'server'>, string>> = {
  history: '操作历史',
  sync: '同步中心'
};

/**
 * 右侧面板：同一时刻只开一个（epic-016）
 *
 * @remarks
 * 宽屏（≥ 768px，与 Tailwind 的 md 同口径）占右侧一栏、不挡页面，能边看边操作。
 * 窄屏是盖住页面的抽屉，左边留一条遮罩，点它收起：抽屉占满整屏宽会把遮罩全盖住，没处可点。
 * 关掉之后焦点回到打开它的那个按钮。页面级的内容（如商品页的模拟服务端变更要用页面级服务）经 portal 交过来，
 * 注入器跟着模板的声明处，页面级服务照样拿得到。
 */
@Injectable({ providedIn: 'root' })
export class RightPanel {
  readonly #wideViewport = window.matchMedia('(min-width: 768px)');
  readonly #active = signal<RightPanelView | null>(null);
  readonly #pagePanels = signal<ReadonlyMap<RightPanelView, PagePanel>>(new Map());
  readonly #wide = signal(this.#wideViewport.matches);
  #opener: HTMLElement | null = null;

  /** 开着的面板；没开为 `null` */
  readonly active = this.#active.asReadonly();
  /** 宽屏：面板占一栏；窄屏是盖住页面的抽屉 */
  readonly wide = this.#wide.asReadonly();

  constructor() {
    this.#wideViewport.addEventListener('change', event => this.#wide.set(event.matches));
  }

  /** 面板标题 */
  headingOf(view: RightPanelView): string {
    return view === 'server' ? (this.#pagePanels().get(view)?.heading ?? '') : SHELL_HEADINGS[view];
  }

  /** 页面提供的面板内容 */
  pagePanel(view: RightPanelView): PagePanel | undefined {
    return this.#pagePanels().get(view);
  }

  /**
   * 打开一个面板，换掉开着的那个
   *
   * @param view - 要开的面板
   * @param opener - 打开它的按钮，关掉之后焦点回到这里
   */
  open(view: RightPanelView, opener: HTMLElement | null): void {
    this.#opener = opener;
    this.#active.set(view);
  }

  /** 开着就关上，没开就打开 */
  toggle(view: RightPanelView, opener: HTMLElement | null): void {
    if (this.#active() === view) this.close();
    else this.open(view, opener);
  }

  /** 关上开着的面板，焦点回到打开它的按钮 */
  close(): void {
    const opener = this.#opener;
    this.#opener = null;
    this.#active.set(null);
    opener?.focus();
  }

  /**
   * 页面提供一个面板
   *
   * @param view - 面板的视图
   * @param panel - 标题与内容
   * @returns 撤回函数：页面离开时调用；这个面板正开着就一并关上
   */
  provide(view: RightPanelView, panel: PagePanel): () => void {
    this.#pagePanels.update(panels => new Map(panels).set(view, panel));
    return () => {
      this.#pagePanels.update(panels => {
        const next = new Map(panels);
        next.delete(view);
        return next;
      });
      if (this.#active() === view) this.close();
    };
  }
}

let nextHeadingId = 0;

/** 应用壳里右侧面板的槽位 */
@Component({
  selector: 'app-side-panel-outlet',
  imports: [CdkPortalOutlet, LucideDynamicIcon, OperationHistoryPanel, SyncCenter],
  host: { class: 'contents', '(keydown)': 'closeOnEscape($event)' },
  template: `
    @if (panel.active(); as view) {
      @if (!panel.wide()) {
        <!-- 只给指针用的关闭区：键盘走 Esc 与面板里的关闭按钮 -->
        <button
          class="bg-base-content/40 fixed inset-0 z-[60] cursor-default"
          (click)="panel.close()"
          aria-hidden="true"
          data-testid="side-panel-backdrop"
          tabindex="-1"
          type="button"
        ></button>
      }
      <aside
        class="bg-base-100 border-base-300 flex flex-col overflow-hidden"
        id="side-panel"
        [attr.aria-labelledby]="headingId"
        [attr.aria-modal]="panel.wide() ? null : 'true'"
        [attr.data-view]="view"
        [attr.role]="panel.wide() ? 'complementary' : 'dialog'"
        [class]="
          panel.wide() ?
            'h-full w-96 shrink-0 border-l'
          : 'fixed inset-y-0 right-0 z-[61] w-[calc(100%-3rem)] max-w-md shadow-2xl'
        "
        data-testid="side-panel"
      >
        <div class="border-base-300 flex items-center justify-between gap-2 border-b px-4 py-2">
          <h2 class="text-sm font-semibold outline-none" #heading [id]="headingId" tabindex="-1">
            {{ panel.headingOf(view) }}
          </h2>
          <button
            class="btn btn-ghost btn-sm btn-circle"
            (click)="panel.close()"
            aria-label="关闭面板"
            data-testid="side-panel-close"
            type="button"
          >
            <svg [lucideIcon]="X" size="16"></svg>
          </button>
        </div>
        <div class="min-h-0 flex-1 overflow-y-auto p-4">
          @switch (view) {
            @case ('history') {
              <app-operation-history-panel />
            }
            @case ('sync') {
              <app-sync-center />
            }
            @default {
              <ng-template [cdkPortalOutlet]="panel.pagePanel(view)?.portal ?? null" />
            }
          }
        </div>
      </aside>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidePanelOutlet {
  readonly #injector = inject(Injector);
  readonly panel = inject(RightPanel);
  readonly headingId = `side-panel-heading-${nextHeadingId++}`;
  readonly heading = viewChild<ElementRef<HTMLElement>>('heading');
  readonly X = X;

  constructor() {
    // 打开或换了面板：焦点进面板标题，读屏从标题读起
    effect(() => {
      if (this.panel.active() === null) return;
      afterNextRender(() => this.heading()?.nativeElement.focus(), { injector: this.#injector });
    });
    inject(DestroyRef).onDestroy(() => this.panel.close());
  }

  /** Esc 关面板；面板里的对话框先处理自己的 Esc（第一次 Esc 关对话框，第二次才关面板） */
  closeOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (event.target instanceof Element && event.target.closest('dialog')) return;
    this.panel.close();
  }
}
