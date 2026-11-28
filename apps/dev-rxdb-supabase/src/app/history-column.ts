import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  DOCUMENT,
  effect,
  inject,
  Injectable,
  Injector,
  signal,
  viewChild
} from '@angular/core';
import { OperationHistoryPanel } from './operation-history-panel';
import { PageWorkbench } from './page-workbench';
import { PanelFrame } from './panel-frame';

/** 顶栏上操作历史开关的 id：收起之后焦点回到这里 */
export const HISTORY_COLUMN_TOGGLE_ID = 'history-column-toggle';

/**
 * 多宽算宽屏：再窄的话侧栏、操作历史与页面三栏挤不下，操作历史改成抽屉
 *
 * @remarks
 * 比右侧面板的门槛（768px）高：左边已经有侧栏，再加一栏操作历史，页面要留得下最窄的卡片。
 */
const WIDE_QUERY = '(min-width: 1024px)';

/**
 * 左侧的操作历史一栏开着没有（epic-016）
 *
 * @remarks
 * 三页统一在左侧，宽屏默认开着，可以收起；窄屏默认收起，打开时是盖住页面的抽屉。跨页面保持同一个开合：
 * 收起之后切到别的页面也收着。只有顶栏的开关打开它，收起之后焦点回到那颗开关。
 */
@Injectable({ providedIn: 'root' })
export class HistoryColumn {
  readonly #document = inject(DOCUMENT);
  readonly #wideViewport = window.matchMedia(WIDE_QUERY);
  readonly #wide = signal(this.#wideViewport.matches);
  readonly #open = signal(this.#wideViewport.matches);
  #focusOnOpen = false;

  /** 宽屏：占左侧一栏；窄屏是抽屉 */
  readonly wide = this.#wide.asReadonly();
  /** 开着 */
  readonly open = this.#open.asReadonly();

  constructor() {
    // 宽窄切换时按新的默认开合：变窄时不让抽屉突然盖住页面
    this.#wideViewport.addEventListener('change', event => {
      this.#wide.set(event.matches);
      this.#open.set(event.matches);
    });
  }

  /** 开着就收起，收着就打开；打开时焦点进标题 */
  toggle(): void {
    if (this.#open()) {
      this.close();
      return;
    }
    this.#focusOnOpen = true;
    this.#open.set(true);
  }

  /** 收起，焦点回到顶栏的开关 */
  close(): void {
    this.#open.set(false);
    this.#document.getElementById(HISTORY_COLUMN_TOGGLE_ID)?.focus();
  }

  /**
   * 这次打开要不要把焦点挪进去
   *
   * @returns 由开关打开的为 `true`，只答一次；宽屏默认开着时为 `false`，不抢页面的焦点
   */
  takeFocusRequest(): boolean {
    const requested = this.#focusOnOpen;
    this.#focusOnOpen = false;
    return requested;
  }
}

/** 应用壳里左侧操作历史的槽位：当前页面登记了操作历史才有 */
@Component({
  selector: 'app-history-column-outlet',
  imports: [PanelFrame, OperationHistoryPanel],
  host: { class: 'contents' },
  template: `
    @if (column.open() && workbench.current()?.history) {
      <app-panel-frame
        [wide]="column.wide()"
        (closed)="column.close()"
        closeLabel="收起操作历史"
        heading="操作历史"
        panelId="history-column"
        side="left"
        testId="history-column"
      >
        <app-operation-history-panel />
      </app-panel-frame>
    }
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HistoryColumnOutlet {
  readonly #injector = inject(Injector);
  readonly column = inject(HistoryColumn);
  readonly workbench = inject(PageWorkbench);
  readonly frame = viewChild(PanelFrame);

  constructor() {
    effect(() => {
      if (!this.column.open() || !this.column.takeFocusRequest()) return;
      afterNextRender(() => this.frame()?.focusHeading(), { injector: this.#injector });
    });
  }
}
