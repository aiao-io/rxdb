import { Component, ElementRef, computed, inject, input } from '@angular/core';

import { MenuCommand, MenuEntry, isMenuCommand } from '../services/menu';
import { PopoverService } from '../services/popover';
import { Icon } from './icon';

type MenuRow =
  | { readonly type: 'sep' }
  | { readonly type: 'head'; readonly text: string }
  | { readonly type: 'field'; readonly placeholder: string }
  | { readonly type: 'item'; readonly command: MenuCommand };

const toRow = (entry: MenuEntry): MenuRow => {
  if (entry === '-') return { type: 'sep' };
  if ('head' in entry) return { type: 'head', text: entry.head };
  if ('field' in entry) return { type: 'field', placeholder: entry.field };
  return { type: 'item', command: entry };
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
 * 标准下拉菜单（原 `Pop.menu`）：宿主元素就是 `.pop` 玻璃面板。
 * 键盘打开的菜单（`PopoverOptions.focus`）焦点在菜单项上：方向键、Home、End 移动，Enter 或空格执行，Esc 关闭，Tab 离开菜单。
 */
@Component({
  selector: 'app-menu-list',
  imports: [Icon],
  host: { class: 'pop', '[class]': 'cls()', '(keydown)': 'navigate($event)' },
  template: `
    @for (row of rows(); track $index) {
      @if (row.type === 'sep') {
        <div class="msep"></div>
      } @else if (row.type === 'head') {
        <div class="mhead">{{ row.text }}</div>
      } @else if (row.type === 'field') {
        <div class="mfield sfield">
          <svg appIcon="g-search"></svg><input [placeholder]="row.placeholder" spellcheck="false" />
        </div>
      } @else {
        <div
          class="mi"
          [attr.data-act]="row.command.id"
          [class.dis]="row.command.disabled"
          [class.on]="row.command.checked"
          (click)="run(row.command)"
          (keydown.enter)="run(row.command)"
          (keydown.space)="runByKey($event, row.command)"
          (mousedown)="hold($event, row.command)"
          tabindex="-1"
        >
          @if (checks()) {
            <span class="ck"><svg appIcon="g-check"></svg></span>
          }
          @if (row.command.icon; as icon) {
            <svg class="ico" [appIcon]="icon"></svg>
          }
          <span>{{ row.command.label }}</span>
          @if (row.command.key; as key) {
            <span class="k">{{ key }}</span>
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

  protected hold(event: MouseEvent, command: MenuCommand): void {
    if (!command.disabled) event.stopPropagation();
  }

  protected run(command: MenuCommand): void {
    if (command.disabled) return;
    this.popover.close();
    const action = command.run;
    if (action) setTimeout(action, 0);
  }

  protected runByKey(event: Event, command: MenuCommand): void {
    event.preventDefault();
    this.run(command);
  }

  protected navigate(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
      this.popover.close();
      return;
    }
    const items = [...this.host.querySelectorAll<HTMLElement>('.mi:not(.dis)')];
    const at = items.indexOf(this.host.ownerDocument.activeElement as HTMLElement);
    const next = items.length ? nextIndex(event.key, at, items.length) : null;
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  }
}
