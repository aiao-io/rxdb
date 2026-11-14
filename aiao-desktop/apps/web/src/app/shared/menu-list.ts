import { Component, ElementRef, computed, inject, input } from '@angular/core';

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

/** 键盘上弹出上下文菜单的按键：Menu 键，或 Shift+F10。浏览器不一定自己派发 `contextmenu`，所以由元素自己处理。 */
export const isMenuKey = (event: KeyboardEvent): boolean =>
  event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey);

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
 * 标准下拉菜单（原 `Pop.menu`）：宿主元素就是 `.pop` 玻璃面板，`role="menu"`，项是 `menuitem`（带勾选的是
 * `menuitemcheckbox`），快捷键走 `aria-keyshortcuts` 而不是念进名称。
 * 键盘打开的菜单（`PopoverOptions.focus`）焦点在菜单项上：上下方向键、Home、End 移动，按首字母跳转，
 * Enter 或空格执行，Esc 关闭，Tab 离开菜单；菜单栏的菜单里左右方向键切到相邻的菜单（`PopoverOptions.step`）。
 * 菜单项的 `tabindex="-1"` 是菜单的 roving 焦点：整份菜单没有 Tab 停靠点，焦点靠方向键在项之间移动。
 */
@Component({
  selector: 'app-menu-list',
  imports: [Icon],
  host: {
    class: 'pop',
    role: 'menu',
    '[class]': 'cls()',
    '[attr.aria-label]': 'label() || null',
    '(keydown)': 'navigate($event)'
  },
  template: `
    @for (row of rows(); track $index) {
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
          [attr.aria-keyshortcuts]="row.aria.shortcut"
          [attr.data-act]="row.command.id"
          [attr.role]="row.aria.role"
          [class.dis]="row.command.disabled"
          [class.on]="row.command.checked"
          (click)="run(row.command)"
          (keydown.enter)="run(row.command)"
          (keydown.space)="runByKey($event, row.command)"
          (mousedown)="hold($event, row.command)"
          tabindex="-1"
        >
          @if (checks()) {
            <span class="ck" aria-hidden="true"><svg appIcon="g-check"></svg></span>
          }
          @if (row.command.icon; as icon) {
            <svg class="ico" [appIcon]="icon"></svg>
          }
          <span>{{ row.command.label }}</span>
          @if (row.command.key; as key) {
            <span class="k" aria-hidden="true">{{ key }}</span>
          }
        </div>
      }
    }
  `
})
export class MenuList {
  private readonly popover = inject(PopoverService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  protected readonly rows = computed(() => this.items().map(toRow));
  /** 任一项声明了 `checked` 时，整份菜单留出勾选列。 */
  protected readonly checks = computed(() =>
    this.items().some(entry => isMenuCommand(entry) && entry.checked !== undefined)
  );
  readonly items = input.required<readonly MenuEntry[]>();
  readonly cls = input('');
  /** 菜单的无障碍名称（菜单栏标题、应用名）。 */
  readonly label = input('');

  protected hold(event: MouseEvent, command: MenuCommand): void {
    if (!command.disabled) event.stopPropagation();
  }

  protected run(command: MenuCommand): void {
    if (command.disabled) return;
    this.popover.close(false, 'command');
    const action = command.run;
    if (action) setTimeout(action, 0);
  }

  protected runByKey(event: Event, command: MenuCommand): void {
    event.preventDefault();
    this.run(command);
  }

  protected navigate(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      this.popover.close(false, 'tab');
      return;
    }
    /* 帮助菜单顶部的搜索框里打字、移动光标不归菜单管（上下方向键仍可回到菜单项）。 */
    const typing = (event.target as Element).tagName === 'INPUT';
    if (typing && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const step = this.popover.active()?.options.step;
      if (!step) return;
      event.preventDefault();
      step(event.key === 'ArrowRight' ? 1 : -1);
      return;
    }
    const items = [...this.host.querySelectorAll<HTMLElement>('.mi:not(.dis)')];
    const at = items.indexOf(this.host.ownerDocument.activeElement as HTMLElement);
    const next = items.length ? this.target(event, items, at) : null;
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
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
}
