import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, HostListener, input, output } from '@angular/core';

/** 右键菜单里的一项。 */
export interface WorkingTreeContextMenuItem {
  /** 页面上按它分发动作的键；分隔线占位项也用（互不重复即可）。 */
  readonly id: string;
  readonly label: string;
  /** 危险操作（丢弃）用红色字。 */
  readonly danger?: boolean;
  /** e2e 锚点；只有带测试语义的项才给。 */
  readonly testId?: string;
  /** 分隔线占位项：不渲染按钮（GitHub Desktop 菜单里动作与复制之间的横线）。 */
  readonly separator?: boolean;
}

/** 右键菜单的开合状态：位置 + 菜单项。 */
export interface WorkingTreeContextMenuState {
  readonly x: number;
  readonly y: number;
  readonly items: readonly WorkingTreeContextMenuItem[];
}

/** 菜单的预估尺寸；位置按它夹回视口内。 */
const MENU_WIDTH = 208;
const ITEM_HEIGHT = 30;
const SEPARATOR_HEIGHT = 9;

/**
 * GitHub Desktop 形态的右键菜单。
 *
 * @remarks
 * 内联渲染（fixed 定位在本页面 DOM 里），形态与分支下拉同源：透明背板点哪都关，
 * Escape 走 document 级监听。菜单项是 `<button role="menuitem">`，键盘可达。
 * 位置按视口夹回：贴边右键时菜单不会伸出窗口（GitHub Desktop 的同款行为）。
 */
@Component({
  selector: 'app-working-tree-context-menu',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule],
  template: `
    @if (menu(); as menu) {
      <!-- 点外面关闭的透明背板（与分支菜单同一种形态） -->
      <div
        class="fixed inset-0 z-40"
        (click)="closeRequested.emit()"
        (keydown.escape)="closeRequested.emit()"
        aria-label="Close context menu"
        role="button"
        tabindex="0"
      ></div>
      <div
        class="gd-menu fixed z-50 py-1"
        [style.left.px]="clampedX()"
        [style.top.px]="clampedY()"
        [style.width.px]="MENU_WIDTH"
        aria-label="Context menu"
        role="menu"
      >
        @for (item of menu.items; track item.id) {
          @if (item.separator === true) {
            <div class="gd-menu-divider" role="separator"></div>
          } @else {
            <button
              class="gd-menu-row"
              [attr.data-testid]="item.testId ?? null"
              [class.gd-btn-danger]="item.danger === true"
              (click)="itemSelected.emit(item)"
              role="menuitem"
              type="button"
            >
              {{ item.label }}
            </button>
          }
        }
      </div>
    }
  `
})
export class WorkingTreeContextMenuComponent {
  /** 夹回视口内的横坐标：贴右边缘右键时菜单完整可见。 */
  protected readonly clampedX = computed(() => {
    const menu = this.menu();
    if (menu === null) return 0;
    return Math.max(8, Math.min(menu.x, window.innerWidth - MENU_WIDTH - 8));
  });

  protected readonly clampedY = computed(() => {
    const menu = this.menu();
    if (menu === null) return 0;
    const height =
      menu.items.reduce((total, item) => total + (item.separator === true ? SEPARATOR_HEIGHT : ITEM_HEIGHT), 0) + 12;
    return Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));
  });

  protected readonly MENU_WIDTH = MENU_WIDTH;

  readonly menu = input<WorkingTreeContextMenuState | null>(null);

  readonly itemSelected = output<WorkingTreeContextMenuItem>();
  readonly closeRequested = output<void>();

  @HostListener('document:keydown.escape')
  onDocumentEscape(): void {
    if (this.menu() !== null) this.closeRequested.emit();
  }
}
