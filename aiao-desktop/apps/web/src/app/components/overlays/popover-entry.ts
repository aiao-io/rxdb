import { Component, ComponentRef, OnInit, ViewContainerRef, effect, inject, input } from '@angular/core';

import { PopoverEntry } from '../../services/popover';
import { clamp } from '../../shared/format';
import { MenuList } from '../../shared/menu-list';

/**
 * 渲染一条弹出层：内容组件作为 `#layer-menu` 的直接子节点插入，
 * 先隐藏测量，再按锚点夹到屏幕内。
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
    const inputs = content.kind === 'menu' ? { items: content.items, cls: content.cls } : content.inputs;
    Object.entries(inputs).forEach(([name, value]) => ref.setInput(name, value));

    const node = ref.location.nativeElement as HTMLElement;
    this.node = node;
    node.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const rect = node.getBoundingClientRect();
      const left = clamp(options.right ? options.x - rect.width : options.x, 6, innerWidth - rect.width - 6);
      node.style.left = `${left}px`;
      node.style.top = `${clamp(options.y, 4, innerHeight - rect.height - 8)}px`;
      if (options.origin) node.style.transformOrigin = options.origin;
      node.style.visibility = '';
      if (options.focus) node.querySelector<HTMLElement>('.mi:not(.dis)')?.focus();
    });
  }
}
