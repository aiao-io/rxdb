import { CdkPortalOutlet, type Portal } from '@angular/cdk/portal';
import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import { PanelFrame } from './panel-frame';
import { SyncCenter } from './sync-center';

/** 右侧面板的视图：同步中心由顶栏打开，模拟服务端变更由商品页提供；操作历史在左侧（`HistoryColumn`） */
export type RightPanelView = 'sync' | 'server';

/** 页面提供的面板：内容在页面里声明，渲染在右侧面板的槽位里 */
export interface PagePanel {
  readonly heading: string;
  readonly portal: Portal<unknown>;
}

const SHELL_HEADINGS: Readonly<Record<Exclude<RightPanelView, 'server'>, string>> = {
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

/** 应用壳里右侧面板的槽位 */
@Component({
  selector: 'app-side-panel-outlet',
  imports: [CdkPortalOutlet, PanelFrame, SyncCenter],
  host: { class: 'contents' },
  template: `
    @if (panel.active(); as view) {
      <app-panel-frame
        [heading]="panel.headingOf(view)"
        [view]="view"
        [wide]="panel.wide()"
        (closed)="panel.close()"
        panelId="side-panel"
        side="right"
        testId="side-panel"
      >
        @switch (view) {
          @case ('sync') {
            <app-sync-center />
          }
          @default {
            <ng-template [cdkPortalOutlet]="panel.pagePanel(view)?.portal ?? null" />
          }
        }
      </app-panel-frame>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidePanelOutlet {
  readonly #injector = inject(Injector);
  readonly panel = inject(RightPanel);
  readonly frame = viewChild(PanelFrame);

  constructor() {
    // 打开或换了面板：焦点进面板标题，读屏从标题读起
    effect(() => {
      if (this.panel.active() === null) return;
      afterNextRender(() => this.frame()?.focusHeading(), { injector: this.#injector });
    });
    inject(DestroyRef).onDestroy(() => this.panel.close());
  }
}
