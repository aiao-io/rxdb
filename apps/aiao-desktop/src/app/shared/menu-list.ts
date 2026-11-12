import { Component, computed, inject, input } from '@angular/core';

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

/** 标准下拉菜单（原 `Pop.menu`）：宿主元素就是 `.pop` 玻璃面板。 */
@Component({
  selector: 'app-menu-list',
  imports: [Icon],
  host: { class: 'pop', '[class]': 'cls()' },
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
}
