import { ChangeDetectionStrategy, Component, computed, type ElementRef, input, output, viewChild } from '@angular/core';
import { LucideDynamicIcon, LucideX as X } from '@lucide/angular';

/** 面板在哪一侧 */
export type PanelSide = 'left' | 'right';

/**
 * 两侧面板的外形
 *
 * @remarks
 * 窄屏的抽屉不占满整屏宽，另一侧留一条遮罩可点：占满会把遮罩全盖住，没处可点。
 */
const FRAME_CLASSES: Readonly<Record<PanelSide, { readonly wide: string; readonly narrow: string }>> = {
  left: {
    wide: 'h-full w-64 shrink-0 border-r',
    narrow: 'fixed inset-y-0 left-0 z-[61] w-[calc(100%-3rem)] max-w-sm shadow-2xl'
  },
  right: {
    wide: 'h-full w-96 shrink-0 border-l',
    narrow: 'fixed inset-y-0 right-0 z-[61] w-[calc(100%-3rem)] max-w-md shadow-2xl'
  }
};

let nextHeadingId = 0;

/**
 * 侧边面板的框（epic-016）：宽屏是不挡页面的一栏，窄屏是盖住页面、带遮罩的抽屉
 *
 * @remarks
 * 标题、关闭按钮、Esc 与遮罩在这里；开不开、焦点回到哪由用它的槽位决定。面板里的 `<dialog>` 先处理自己的 Esc。
 */
@Component({
  selector: 'app-panel-frame',
  imports: [LucideDynamicIcon],
  host: { class: 'contents', '(keydown)': 'closeOnEscape($event)' },
  template: `
    @if (!wide()) {
      <!-- 只给指针用的关闭区：键盘走 Esc 与面板里的关闭按钮 -->
      <button
        class="bg-base-content/40 fixed inset-0 z-[60] cursor-default"
        [attr.data-testid]="testId() + '-backdrop'"
        (click)="closed.emit()"
        aria-hidden="true"
        tabindex="-1"
        type="button"
      ></button>
    }
    <aside
      class="bg-base-100 border-base-300 flex flex-col overflow-hidden"
      [attr.aria-labelledby]="headingId"
      [attr.aria-modal]="wide() ? null : 'true'"
      [attr.data-testid]="testId()"
      [attr.data-view]="view()"
      [attr.role]="wide() ? 'complementary' : 'dialog'"
      [class]="frameClass()"
      [id]="panelId()"
    >
      <div class="border-base-300 flex items-center justify-between gap-2 border-b px-4 py-2">
        <h2 class="text-sm font-semibold outline-none" #headingElement [id]="headingId" tabindex="-1">
          {{ heading() }}
        </h2>
        <button
          class="btn btn-ghost btn-sm btn-circle"
          [attr.aria-label]="closeLabel()"
          [attr.data-testid]="testId() + '-close'"
          (click)="closed.emit()"
          type="button"
        >
          <svg [lucideIcon]="X" size="16"></svg>
        </button>
      </div>
      <div class="min-h-0 flex-1 overflow-y-auto p-4">
        <ng-content />
      </div>
    </aside>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class PanelFrame {
  /** 在左侧还是右侧 */
  readonly side = input.required<PanelSide>();
  /** 宽屏占一栏，窄屏是抽屉 */
  readonly wide = input.required<boolean>();
  readonly heading = input.required<string>();
  /** 面板元素的 id：开关的 `aria-controls` 指向它 */
  readonly panelId = input.required<string>();
  /** e2e 锚点；遮罩与关闭按钮在它后面加 `-backdrop`、`-close` */
  readonly testId = input.required<string>();
  /** 面板里是哪个视图，写在 `data-view` 上 */
  readonly view = input<string | null>(null);
  readonly closeLabel = input('关闭面板');
  /** 点关闭、点遮罩或按 Esc */
  readonly closed = output<void>();

  readonly headingId = `panel-heading-${++nextHeadingId}`;
  readonly headingRef = viewChild<ElementRef<HTMLElement>>('headingElement');
  readonly frameClass = computed(() => FRAME_CLASSES[this.side()][this.wide() ? 'wide' : 'narrow']);
  readonly X = X;

  /** 焦点进标题：读屏从标题读起 */
  focusHeading(): void {
    this.headingRef()?.nativeElement.focus();
  }

  /** Esc 关面板；面板里的对话框先处理自己的 Esc（第一次 Esc 关对话框，第二次才关面板） */
  closeOnEscape(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    if (event.target instanceof Element && event.target.closest('dialog')) return;
    this.closed.emit();
  }
}
