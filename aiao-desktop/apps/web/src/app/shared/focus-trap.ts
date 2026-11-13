import { DOCUMENT } from '@angular/common';
import { Directive, ElementRef, OnDestroy, afterNextRender, computed, effect, inject, input } from '@angular/core';

import { tabTarget } from '../services/focus-order';
import { WindowManager } from '../services/window-manager';

/** 可能被 Tab 键到达的元素（再用 {@link isTabbable} 筛掉当前到不了的）。 */
const CANDIDATES = [
  'a[href]',
  'button',
  'input:not([type="hidden"])',
  'select',
  'textarea',
  'iframe',
  '[tabindex]',
  '[contenteditable="true"]'
].join(',');

/**
 * 元素此刻能不能用 Tab 键到达：`tabindex` 非负、没有禁用、渲染出了盒子（不是 `display: none`）、
 * `visibility` 不是 hidden、不在 `inert` 或 `hidden` 的子树里。
 */
export function isTabbable(element: HTMLElement): boolean {
  if (element.tabIndex < 0 || (element as HTMLButtonElement).disabled) return false;
  if (element.closest('[inert],[hidden]')) return false;
  if (element.getClientRects().length === 0) return false;
  return getComputedStyle(element).visibility !== 'hidden';
}

/** `root` 里能用 Tab 键到达的元素，文档顺序。 */
export function tabbablesIn(root: HTMLElement): HTMLElement[] {
  return [...root.querySelectorAll<HTMLElement>(CANDIDATES)].filter(isTabbable);
}

/**
 * 焦点陷阱：浮层（启动台、聚焦搜索、通知中心）打开时，Tab / Shift+Tab 只在浮层里循环，不会漏到下面的桌面；
 * 浮层关闭时把焦点还给打开它之前的元素。用法是把它加在浮层组件的标签上：
 *
 * ```html
 * <app-launchpad [appFocusTrap]="overlays.launchpad() === 'open'" [trapInitialFocus]="false" />
 * ```
 *
 * 宿主元素会得到 `tabindex="-1"`：没有任何可 Tab 的元素时焦点停在容器本身；点在浮层里的空白处，焦点也落在容器上，
 * 不会掉回 `body`（那样下一次 Tab 会从页面开头走起）。
 *
 * 还焦点只在焦点还留在浮层里（或已经丢了）的时候做：浮层关闭的同时用户已经去了别处（比如从聚焦搜索打开了一个应用，
 * 新窗口拿到了焦点）就不去抢。没有可还的元素（浮层是用鼠标在没有焦点的页面上打开的）时，焦点交给前台窗口。
 */
@Directive({
  selector: '[appFocusTrap]',
  exportAs: 'appFocusTrap',
  host: { tabindex: '-1', '(keydown)': 'trap($event)' }
})
export class FocusTrap implements OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly document = inject(DOCUMENT);
  private readonly windows = inject(WindowManager);
  private readonly active = computed(() => this.appFocusTrap() !== false);
  /** 打开浮层之前拿着焦点的元素；页面上没有焦点时为 `null`。 */
  private readonly opener = this.currentFocus();
  private released = false;

  /** 陷阱是否生效。浮层一开始关闭动画就置为 `false`：焦点此刻交还，不等节点真的被移除。 */
  readonly appFocusTrap = input<boolean | ''>(true);
  /** 出现时是否把焦点移进浮层（默认移到第一个可 Tab 的元素，`data-autofocus` 优先）；自己管初始焦点的浮层传 `false`。 */
  readonly trapInitialFocus = input(true);

  constructor() {
    afterNextRender(() => {
      if (this.active() && this.trapInitialFocus()) this.focusInitial();
    });
    effect(() => {
      if (!this.active()) this.release();
    });
  }

  ngOnDestroy(): void {
    this.release();
  }

  protected trap(event: KeyboardEvent): void {
    if (event.key !== 'Tab' || !this.active()) return;
    const items = tabbablesIn(this.host);
    const target = tabTarget(items, this.document.activeElement as HTMLElement | null, event.shiftKey);
    if (target) {
      event.preventDefault();
      target.focus();
    } else if (items.length === 0) {
      event.preventDefault();
    }
  }

  private currentFocus(): HTMLElement | null {
    const active = this.document.activeElement;
    return active instanceof HTMLElement && active !== this.document.body ? active : null;
  }

  private focusInitial(): void {
    const target = this.host.querySelector<HTMLElement>('[data-autofocus]') ?? tabbablesIn(this.host)[0] ?? this.host;
    target.focus({ preventScroll: true });
  }

  private release(): void {
    if (this.released) return;
    this.released = true;
    const active = this.document.activeElement;
    const stillHere = !active || active === this.document.body || this.host.contains(active);
    if (!stillHere) return;
    if (this.opener?.isConnected) this.opener.focus({ preventScroll: true });
    else this.windows.focusFront();
  }
}
