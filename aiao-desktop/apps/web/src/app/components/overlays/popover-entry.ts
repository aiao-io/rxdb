import { Component, ComponentRef, OnInit, ViewContainerRef, effect, inject, input } from '@angular/core';

import { tabTarget } from '../../services/focus-order';
import { PopoverEntry } from '../../services/popover';
import { tabbablesIn } from '../../shared/focus-trap';
import { clamp } from '../../shared/format';
import { MenuList } from '../../shared/menu-list';

/**
 * 渲染一条弹出层：内容组件作为 `#layer-menu` 的直接子节点插入，
 * 先隐藏测量，再按锚点夹到屏幕内。
 *
 * 键盘（或读屏的「按下」）打开的弹出层（`options.focus`）显示后把焦点交进去：菜单交给第一个可用项，
 * 面板交给第一个可 Tab 的元素（没有就交给面板自己）。面板里 Tab 只在面板内循环——弹出层是浮在桌面上的，
 * Tab 不能漏到下面的窗口；菜单里的 Tab 是「关闭菜单」，由 `MenuList` 处理。
 */
@Component({
  selector: 'app-popover-entry',
  host: { style: 'display: contents' },
  template: ''
})
export class PopoverEntryView implements OnInit {
  private readonly container = inject(ViewContainerRef);

  private node: HTMLElement | null = null;
  readonly entry = input.required<PopoverEntry>();

  constructor() {
    effect(() => {
      if (this.entry().leaving()) this.node?.classList.add('out');
    });
  }

  ngOnInit(): void {
    const { content, options } = this.entry();
    const ref: ComponentRef<unknown> =
      content.kind === 'menu' ?
        this.container.createComponent(MenuList)
      : this.container.createComponent(content.component);
    const inputs =
      content.kind === 'menu' ? { items: content.items, cls: content.cls, label: options.label ?? '' } : content.inputs;
    Object.entries(inputs).forEach(([name, value]) => ref.setInput(name, value));

    const node = ref.location.nativeElement as HTMLElement;
    this.node = node;
    if (content.kind === 'component') node.addEventListener('keydown', event => this.trap(event, node));
    node.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const left = clamp(options.right ? options.x - rect.width : options.x, 6, innerWidth - rect.width - 6);
      node.style.left = `${left}px`;
      node.style.top = `${clamp(options.y, 4, innerHeight - rect.height - 8)}px`;
      if (options.origin) node.style.transformOrigin = options.origin;
      node.style.visibility = '';
      if (options.focus) this.focusInside(node, options.focus === 'last');
    });
  }

  private focusInside(node: HTMLElement, last: boolean): void {
    const items = node.querySelectorAll<HTMLElement>('.mi:not(.dis)');
    const target = (last ? items[items.length - 1] : items[0]) ?? tabbablesIn(node)[0];
    if (target) target.focus();
    else {
      node.tabIndex = -1;
      node.focus();
    }
  }

  /** 面板里的 Tab 绕在面板内部（到头绕回另一头），不漏到下面的窗口。 */
  private trap(event: KeyboardEvent, node: HTMLElement): void {
    if (event.key !== 'Tab') return;
    const items = tabbablesIn(node);
    const target = tabTarget(items, node.ownerDocument.activeElement as HTMLElement | null, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus();
    } else if (items.length === 0) {
      event.preventDefault();
    }
  }
}
