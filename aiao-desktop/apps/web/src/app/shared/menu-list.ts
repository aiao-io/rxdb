import { NgTemplateOutlet } from '@angular/common';
import { Component, ElementRef, computed, inject, input, signal } from '@angular/core';

import { MenuItemAria, menuItemAria } from '../services/aria';
import { typeaheadIndex } from '../services/focus-order';
import { MenuCommand, MenuEntry, isMenuCommand } from '../services/menu';
import { PopoverService } from '../services/popover';
import { Icon } from './icon';

type MenuRow =
  | { readonly type: 'sep' }
  | { readonly type: 'head'; readonly text: string }
  | { readonly type: 'field'; readonly placeholder: string }
  | { readonly type: 'item'; readonly command: MenuCommand; readonly aria: MenuItemAria };

const toRow = (entry: MenuEntry): MenuRow => {
  if (entry === '-') return { type: 'sep' };
  if ('head' in entry) return { type: 'head', text: entry.head };
  if ('field' in entry) return { type: 'field', placeholder: entry.field };
  return { type: 'item', command: entry, aria: menuItemAria(entry) };
};

/** 子菜单大致宽度：只用来决定往右还是往左展开，不参与精确布局。 */
const FLYOUT_WIDTH = 200;

/**
 * 方向键、Home、End 在 `count` 个可用项里要去的下标；不是导航键时为 `null`。
 * 焦点不在任何项上（`at` 为 -1）时，向下去第一项，向上去最后一项。
 */
export function nextIndex(key: string, at: number, count: number): number | null {
  if (key === 'Home') return 0;
  if (key === 'End') return count - 1;
  if (key === 'ArrowDown') return (at + 1) % count;
  if (key === 'ArrowUp') return at < 0 ? count - 1 : (at - 1 + count) % count;
  return null;
}

/**
 * 子菜单相对菜单面板的位置：默认贴在被展开项的右侧；右边放不下时改为左对齐展开。
 * `top` 夹在视口里，避免靠近屏幕底部时展开到屏幕外。
 */
export function submenuPlacement(
  host: { readonly clientWidth: number; readonly top: number },
  row: {
    readonly offsetLeft: number;
    readonly offsetTop: number;
    readonly offsetWidth: number;
    readonly right: number;
  },
  height: number,
  viewport: { readonly width: number; readonly height: number }
): { readonly left: number | null; readonly right: number | null; readonly top: number } {
  const top = Math.max(0, Math.min(row.offsetTop - 5, viewport.height - host.top - height - 8));
  if (row.right + FLYOUT_WIDTH > viewport.width - 8)
    return { left: null, right: Math.max(4, host.clientWidth - row.offsetLeft - 4), top };
  return { left: row.offsetLeft + row.offsetWidth - 4, right: null, top };
}

interface Flyout {
  readonly command: MenuCommand;
  readonly rows: readonly MenuRow[];
  readonly checks: boolean;
  readonly left: number | null;
  readonly right: number | null;
  readonly top: number;
}

/**
 * 标准下拉菜单（原 `Pop.menu`）：宿主元素就是 `.pop` 玻璃面板，`role="menu"`，项是 `menuitem`（带勾选的是
 * `menuitemcheckbox`），快捷键走 `aria-keyshortcuts` 而不是念进名称。
 * 键盘打开的菜单（`PopoverOptions.focus`）焦点在菜单项上：上下方向键、Home、End 移动，按首字母跳转，
 * Enter 或空格执行，Esc 关闭，Tab 离开菜单；菜单栏的菜单里左右方向键切到相邻的菜单（`PopoverOptions.step`）。
 * 菜单项的 `tabindex="-1"` 是菜单的 roving 焦点：整份菜单没有 Tab 停靠点，焦点靠方向键在项之间移动。
 *
 * 子菜单（`MenuCommand.submenu`）：鼠标悬停或右方向键展开一层；焦点在子菜单里时左方向键 / Esc 关掉子菜单并回到父项。
 * 子菜单渲染在同一个菜单面板里（绝对定位），所以整份菜单仍是一个弹出层、一个 Esc 层级。
 */
@Component({
  selector: 'app-menu-list',
  imports: [Icon, NgTemplateOutlet],
  host: {
    class: 'pop',
    role: 'menu',
    '[class]': 'cls()',
    '[class.has-sub]': 'hasSubmenu()',
    '[attr.aria-label]': 'label() || null',
    '(keydown)': 'navigate($event)',
    '(pointerleave)': 'closeSubmenu()'
  },
  template: `
    <ng-template #menuRow let-checks="checks" let-inSubmenu="inSubmenu" let-row>
      @if (row.type === 'sep') {
        <div class="msep" role="separator"></div>
      } @else if (row.type === 'head') {
        <div class="mhead" role="presentation">{{ row.text }}</div>
      } @else if (row.type === 'field') {
        <div class="mfield sfield">
          <svg appIcon="g-search"></svg
          ><input [attr.aria-label]="row.placeholder" [placeholder]="row.placeholder" spellcheck="false" />
        </div>
      } @else {
        <div
          class="mi"
          [attr.aria-checked]="row.aria.checked"
          [attr.aria-disabled]="row.command.disabled ? 'true' : null"
          [attr.aria-expanded]="isOpen(row.command) ? 'true' : null"
          [attr.aria-haspopup]="row.command.submenu ? 'menu' : null"
          [attr.aria-keyshortcuts]="row.aria.shortcut"
          [attr.data-act]="row.command.id"
          [attr.role]="row.aria.role"
          [class.dis]="row.command.disabled"
          [class.on]="row.command.checked"
          (click)="activate(row.command, $event)"
          (keydown.enter)="activateByKey($event, row.command)"
          (keydown.space)="activateByKey($event, row.command)"
          (mousedown)="hold($event, row.command)"
          (pointerenter)="hover(row.command, inSubmenu, $event)"
          tabindex="-1"
        >
          @if (checks) {
            <span class="ck" aria-hidden="true"><svg appIcon="g-check"></svg></span>
          }
          @if (row.command.icon; as icon) {
            <svg class="ico" [appIcon]="icon"></svg>
          }
          <span>{{ row.command.label }}</span>
          @if (row.command.submenu) {
            <span class="subarr" aria-hidden="true">›</span>
          } @else if (row.command.key; as key) {
            <span class="k" aria-hidden="true">{{ key }}</span>
          }
        </div>
      }
    </ng-template>
    @for (row of rows(); track $index) {
      <ng-container *ngTemplateOutlet="menuRow; context: { $implicit: row, inSubmenu: false, checks: checks() }" />
    }
    @if (flyout(); as fly) {
      <div
        class="mfly"
        [attr.aria-label]="fly.command.label"
        [style.left.px]="fly.left"
        [style.right.px]="fly.right"
        [style.top.px]="fly.top"
        role="menu"
      >
        @for (row of fly.rows; track $index) {
          <ng-container *ngTemplateOutlet="menuRow; context: { $implicit: row, inSubmenu: true, checks: fly.checks }" />
        }
      </div>
    }
  `
})
export class MenuList {
  private readonly popover = inject(PopoverService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly flyoutState = signal<Flyout | null>(null);

  protected readonly rows = computed(() => this.items().map(toRow));
  /** 任一项声明了 `checked` 时，整份菜单留出勾选列。 */
  protected readonly checks = computed(() =>
    this.items().some(entry => isMenuCommand(entry) && entry.checked !== undefined)
  );
  /** 有子菜单时面板不能裁掉展开的那一层。 */
  protected readonly hasSubmenu = computed(() =>
    this.items().some(entry => isMenuCommand(entry) && Boolean(entry.submenu?.length))
  );
  protected readonly flyout = this.flyoutState.asReadonly();

  readonly items = input.required<readonly MenuEntry[]>();
  readonly cls = input('');
  /** 菜单的无障碍名称（菜单栏标题、应用名）。 */
  readonly label = input('');

  protected hold(event: MouseEvent, command: MenuCommand): void {
    if (!command.disabled) event.stopPropagation();
  }

  protected isOpen(command: MenuCommand): boolean {
    return this.flyout()?.command === command;
  }

  /** 点击、回车或空格：子菜单项展开下一层，其余执行命令。 */
  protected activate(command: MenuCommand, event?: Event): void {
    if (command.disabled) return;
    if (command.submenu?.length) {
      const row = event?.currentTarget as HTMLElement | null;
      if (row) this.openSubmenu(command, row, false);
      return;
    }
    this.run(command);
  }

  protected activateByKey(event: Event, command: MenuCommand): void {
    event.preventDefault();
    if (command.disabled) return;
    if (command.submenu?.length) {
      const row = event.currentTarget as HTMLElement | null;
      if (row) this.openSubmenu(command, row, true);
      return;
    }
    this.run(command);
  }

  /** 鼠标悬停：子菜单项展开；悬停普通项收起已展开的那一层。 */
  protected hover(command: MenuCommand, inSubmenu: boolean, event: PointerEvent): void {
    if (command.disabled) return;
    if (command.submenu?.length) {
      const row = event.currentTarget as HTMLElement | null;
      if (row) this.openSubmenu(command, row, false);
      return;
    }
    if (!inSubmenu) this.closeSubmenu();
  }

  protected closeSubmenu(focusParent = false): void {
    const current = this.flyout();
    if (!current) return;
    this.flyoutState.set(null);
    if (!focusParent) return;
    const row = this.rootRow(current.command.id);
    row?.focus();
  }

  protected navigate(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      this.popover.close(false, 'tab');
      return;
    }
    const target = event.target as Element;
    const inSubmenu = Boolean(target.closest('.mfly'));
    if (inSubmenu) {
      /* 子菜单里：左方向键 / Esc 只关掉这一层并回到父项，不关整份菜单。 */
      if (event.key === 'Escape' || event.key === 'ArrowLeft') {
        event.preventDefault();
        event.stopPropagation();
        this.closeSubmenu(true);
        return;
      }
      /* 当前只支持一层子菜单，子菜单里的右方向键不继续展开。 */
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        return;
      }
      if (target.tagName === 'INPUT' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
      this.moveFocus(event, '.mfly .mi:not(.dis)');
      return;
    }

    const active = this.host.ownerDocument.activeElement as HTMLElement | null;
    const command = this.commandAt(active);
    if (event.key === 'ArrowRight' && command?.submenu?.length && active) {
      event.preventDefault();
      this.openSubmenu(command, active, true);
      return;
    }
    if (event.key === 'ArrowLeft' && this.flyout()) {
      event.preventDefault();
      this.closeSubmenu();
      return;
    }
    /* 帮助菜单顶部的搜索框里打字、移动光标不归菜单管（上下方向键仍可回到菜单项）。 */
    if (target.tagName === 'INPUT' && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = this.popover.active()?.options.step;
      if (!step) return;
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (this.flyout()) this.closeSubmenu();
    this.moveFocus(event, ':scope > .mi:not(.dis)');
  }

  private run(command: MenuCommand): void {
    if (command.disabled) return;
    this.popover.close(false, 'command');
    const action = command.run;
    if (action) setTimeout(action, 0);
  }

  private openSubmenu(command: MenuCommand, row: HTMLElement, keyboard: boolean): void {
    if (command.disabled || !command.submenu?.length) return;
    if (this.flyout()?.command === command) return;
    const rows = command.submenu.map(toRow);
    const checks = command.submenu.some(entry => isMenuCommand(entry) && entry.checked !== undefined);
    const rect = row.getBoundingClientRect();
    const placement = submenuPlacement(
      { clientWidth: this.host.clientWidth, top: this.host.getBoundingClientRect().top },
      {
        offsetLeft: row.offsetLeft,
        offsetTop: row.offsetTop,
        offsetWidth: row.offsetWidth,
        right: rect.right
      },
      rows.length * 24 + 10,
      { width: innerWidth, height: innerHeight }
    );
    this.flyoutState.set({ command, rows, checks, ...placement });
    if (keyboard) setTimeout(() => this.host.querySelector<HTMLElement>('.mfly .mi:not(.dis)')?.focus(), 0);
  }

  /** 这次按键要去的菜单项下标：方向键、Home、End，或不带修饰键的首字母；不归菜单管的按键为 `null`。 */
  private target(event: KeyboardEvent, items: readonly HTMLElement[], at: number): number | null {
    const moved = nextIndex(event.key, at, items.length);
    if (moved !== null || event.ctrlKey || event.metaKey || event.altKey) return moved;
    return typeaheadIndex(
      items.map(item => item.textContent?.trim() ?? ''),
      at,
      event.key
    );
  }

  private moveFocus(event: KeyboardEvent, selector: string): void {
    const items = [...this.host.querySelectorAll<HTMLElement>(selector)];
    const at = items.indexOf(this.host.ownerDocument.activeElement as HTMLElement);
    const next = items.length ? this.target(event, items, at) : null;
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  }

  private commandAt(element: Element | null): MenuCommand | null {
    const id = element?.closest<HTMLElement>('.mi')?.dataset['act'];
    if (id === undefined) return null;
    return (
      [...this.rows(), ...(this.flyout()?.rows ?? [])].find(
        (row): row is Extract<MenuRow, { readonly type: 'item' }> => row.type === 'item' && row.command.id === id
      )?.command ?? null
    );
  }

  private rootRow(id: string): HTMLElement | null {
    return this.host.querySelector<HTMLElement>(`:scope > .mi[data-act="${CSS.escape(id)}"]`);
  }
}
