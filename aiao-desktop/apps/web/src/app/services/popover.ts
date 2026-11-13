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

export interface PopoverOptions {
  readonly x: number;
  readonly y: number;
  readonly right?: boolean;
  readonly origin?: string;
  /** 键盘打开的菜单：出现后把焦点交给第一个可用项，方向键与 Enter 在菜单里操作。 */
  readonly focus?: boolean;
  readonly onClose?: () => void;
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
    this.close(true);
    const entry: PopoverEntry = { id: ++this.seq, content, options, leaving: signal(false) };
    this.entriesState.update(entries => [...entries, entry]);
    this.activeState.set(entry);
  }

  close(instant = false): void {
    const entry = this.activeState();
    if (!entry) return;
    this.activeState.set(null);
    if (instant) this.remove(entry);
    else {
      entry.leaving.set(true);
      setTimeout(() => this.remove(entry), 110);
    }
    entry.options.onClose?.();
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

  /** 右键菜单：贴着指针打开。 */
  contextMenu(event: MouseEvent, items: readonly MenuEntry[]): void {
    event.preventDefault();
    event.stopPropagation();
    this.openMenu(items, { x: event.clientX + 1, y: event.clientY + 1, origin: 'top left' });
  }

  /** 挂在工具栏按钮下方的菜单。 */
  menuUnder(anchor: Element, items: readonly MenuEntry[]): void {
    const rect = anchor.getBoundingClientRect();
    this.openMenu(items, { x: rect.left, y: rect.bottom + 4, origin: 'top left' });
  }

  private remove(entry: PopoverEntry): void {
    this.entriesState.update(entries => entries.filter(item => item !== entry));
  }
}
