import { Service, Type, WritableSignal, computed, signal } from '@angular/core';

import { MenuEntry } from './menu';

/** 弹出层内容：标准菜单，或任意面板组件（组件宿主元素即弹出层根节点）。 */
export type PopoverContent =
  | { readonly kind: 'menu'; readonly items: readonly MenuEntry[]; readonly cls: string }
  | {
      readonly kind: 'component';
      readonly component: Type<unknown>;
      readonly inputs: Readonly<Record<string, unknown>>;
    };

/**
 * 弹出层是怎么关的。开启它的元素（菜单栏标题、Dock 图标、工具栏按钮）据此决定焦点去哪里：
 * Esc、Tab 与执行命令之后焦点回到开启它的元素（或前台窗口）；点外面或被另一个弹出层顶掉时，焦点已经在别处，不去抢。
 */
export type PopoverCloseReason =
  /** 没有特别的原因：程序关闭、再点一次同一个标题。 */
  | 'dismiss'
  | 'escape'
  /** 菜单里按 Tab 离开。 */
  | 'tab'
  /** 执行了一个菜单命令。 */
  | 'command'
  /** 点了弹出层外面。 */
  | 'outside'
  /** 被另一个弹出层顶掉。 */
  | 'replaced';

/** 关闭之后焦点要回到开启元素的原因（其余原因下焦点已经去了用户要去的地方）。 */
export const RETURNS_FOCUS: ReadonlySet<PopoverCloseReason> = new Set(['escape', 'tab', 'command']);

export interface PopoverOptions {
  readonly x: number;
  readonly y: number;
  readonly right?: boolean;
  readonly origin?: string;
  /**
   * 键盘（或读屏的「按下」）打开的弹出层：出现后把焦点交给第一个可用项 / 面板里第一个可 Tab 的元素；
   * `'last'` 交给最后一个可用项（菜单栏标题上按向上方向键展开）。
   */
  readonly focus?: boolean | 'last';
  /** 菜单的无障碍名称（菜单栏标题、应用名），读屏进入菜单时念出来。 */
  readonly label?: string;
  /** 关闭时调用，带着关闭原因（见 {@link PopoverCloseReason}）。 */
  readonly onClose?: (reason: PopoverCloseReason) => void;
  /** 菜单栏菜单里按左右方向键：切到相邻的菜单（`-1` 左，`1` 右）。没有提供时左右键什么也不做。 */
  readonly step?: (direction: -1 | 1) => void;
}

/** {@link PopoverService.menuUnder} 的选项。 */
export interface MenuUnderOptions {
  /** 由键盘（或读屏的「按下」）触发：焦点交给菜单第一项，关闭后回到锚点。 */
  readonly keyboard?: boolean;
  /** 菜单的无障碍名称。 */
  readonly label?: string;
}

export interface PopoverEntry {
  readonly id: number;
  readonly content: PopoverContent;
  readonly options: PopoverOptions;
  readonly leaving: WritableSignal<boolean>;
}

/** 菜单与面板共用的弹出层：同一时刻只有一个处于打开状态，关闭时淡出 110ms。 */
@Service({ autoProvided: false })
export class PopoverService {
  private readonly entriesState = signal<readonly PopoverEntry[]>([]);
  private readonly activeState = signal<PopoverEntry | null>(null);
  private seq = 0;

  readonly entries = this.entriesState.asReadonly();
  readonly active = this.activeState.asReadonly();
  readonly isOpen = computed(() => this.activeState() !== null);

  open(content: PopoverContent, options: PopoverOptions): void {
    this.close(true, 'replaced');
    const entry: PopoverEntry = { id: ++this.seq, content, options, leaving: signal(false) };
    this.entriesState.update(entries => [...entries, entry]);
    this.activeState.set(entry);
  }

  close(instant = false, reason: PopoverCloseReason = 'dismiss'): void {
    const entry = this.activeState();
    if (!entry) return;
    this.activeState.set(null);
    if (instant) this.remove(entry);
    else {
      entry.leaving.set(true);
      setTimeout(() => this.remove(entry), 110);
    }
    entry.options.onClose?.(reason);
  }

  openMenu(items: readonly MenuEntry[], options: PopoverOptions, cls = ''): void {
    this.open({ kind: 'menu', items, cls }, options);
  }

  openComponent(
    component: Type<unknown>,
    options: PopoverOptions,
    inputs: Readonly<Record<string, unknown>> = {}
  ): void {
    this.open({ kind: 'component', component, inputs }, options);
  }

  /** 右键菜单：贴着指针打开；`label` 是菜单的无障碍名称。 */
  contextMenu(event: MouseEvent, items: readonly MenuEntry[], label?: string): void {
    event.preventDefault();
    event.stopPropagation();
    this.openMenu(items, {
      x: event.clientX + 1,
      y: event.clientY + 1,
      origin: 'top left',
      ...(label ? { label } : {})
    });
  }

  /** 挂在工具栏按钮下方的菜单；键盘触发的（`keyboard`）焦点进菜单，关闭后回到按钮。 */
  menuUnder(anchor: Element, items: readonly MenuEntry[], { keyboard = false, label }: MenuUnderOptions = {}): void {
    const rect = anchor.getBoundingClientRect();
    this.openMenu(items, {
      x: rect.left,
      y: rect.bottom + 4,
      origin: 'top left',
      ...(label ? { label } : {}),
      ...(keyboard ?
        {
          focus: true,
          onClose: (reason: PopoverCloseReason) => {
            if (RETURNS_FOCUS.has(reason)) (anchor as HTMLElement).focus();
          }
        }
      : {})
    });
  }

  private remove(entry: PopoverEntry): void {
    this.entriesState.update(entries => entries.filter(item => item !== entry));
  }
}
