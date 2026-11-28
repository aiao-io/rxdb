import { usePersistedState } from '@aiao/rxdb-angular';
import { ChangeDetectionStrategy, Component, computed, type ElementRef, signal, viewChildren } from '@angular/core';
import { ORDER_SCENARIOS, type OrderScenario } from './orders-scenarios';

/** 方向键在页签之间挪几格 */
const ARROW_STEPS: Readonly<Record<string, number>> = { ArrowLeft: -1, ArrowRight: 1 };

/**
 * 订单页的「怎么测」：每个场景一个页签，列出步骤与每一步应该看到什么（US-235）
 *
 * @remarks
 * 页签按 WAI-ARIA 的 tabs 模式：只有选中的页签在 Tab 序列里，左右方向键换场景、首尾相接。
 * 能收起，熟悉之后把位置让给数据；收没收起记在本机浏览器里——切换身份会重新加载页面，不能每次都重新展开。
 */
@Component({
  selector: 'app-orders-scenario-guide',
  template: `
    <details
      class="card bg-base-100 shadow-sm"
      [open]="open.value()"
      (toggle)="remember($event)"
      data-testid="orders-guide"
    >
      <summary class="card-body cursor-pointer flex-row flex-wrap items-baseline gap-x-3 gap-y-1 py-3">
        <h2 class="card-title text-base">怎么测</h2>
        <span class="text-base-content/60 text-sm">选一个场景照着做；页头的「远端数据」看远端真正落下了什么</span>
      </summary>
      <div class="flex flex-col gap-3 px-6 pb-5">
        <div class="tabs tabs-box tabs-sm" aria-label="测试场景" role="tablist">
          @for (scenario of scenarios; track scenario.key; let index = $index) {
            <button
              class="tab"
              #tab
              [attr.aria-selected]="scenario.key === $current().key"
              [class.tab-active]="scenario.key === $current().key"
              [id]="tabId(scenario)"
              [tabIndex]="scenario.key === $current().key ? 0 : -1"
              (click)="select(index)"
              (keydown)="move($event, index)"
              aria-controls="orders-scenario-panel"
              role="tab"
              type="button"
            >
              {{ scenario.label }}
            </button>
          }
        </div>
        @let current = $current();
        <div
          class="flex flex-col gap-2"
          id="orders-scenario-panel"
          [attr.aria-labelledby]="tabId(current)"
          [attr.data-scenario]="current.key"
          data-testid="orders-scenario"
          role="tabpanel"
        >
          <p class="font-medium">{{ current.title }}</p>
          <ol class="flex list-decimal flex-col gap-2 ps-5 text-sm">
            @for (step of current.steps; track $index) {
              <li data-testid="orders-scenario-step">
                {{ step.action }}
                <span class="text-base-content/60 block">→ {{ step.expect }}</span>
              </li>
            }
          </ol>
        </div>
      </div>
    </details>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OrdersScenarioGuide {
  readonly #selected = signal(0);
  /** 展开着：默认展开，收起之后记住 */
  readonly open = usePersistedState('dev-rxdb-supabase', 'orders-guide-open', true);
  readonly tabs = viewChildren<ElementRef<HTMLButtonElement>>('tab');
  readonly scenarios = ORDER_SCENARIOS;
  readonly $current = computed(() => this.scenarios[this.#selected()]);

  tabId(scenario: OrderScenario): string {
    return `orders-scenario-tab-${scenario.key}`;
  }

  /** 记下用户展开还是收起 */
  remember(event: Event): void {
    this.open.value.set((event.target as HTMLDetailsElement).open);
  }

  select(index: number): void {
    this.#selected.set(index);
  }

  /** 左右方向键换到相邻的场景，焦点跟过去 */
  move(event: KeyboardEvent, index: number): void {
    const step = ARROW_STEPS[event.key];
    if (step === undefined) return;
    event.preventDefault();
    const next = (index + step + this.scenarios.length) % this.scenarios.length;
    this.select(next);
    this.tabs()[next]?.nativeElement.focus();
  }
}
