import type { HistoryScopeAPI } from '@aiao/rxdb';
import { DestroyRef, DOCUMENT, inject, Injectable, signal, type Signal } from '@angular/core';
import { getErrorMessage } from './error-message';

/** 顶栏上一颗按钮背后的命令，由页面登记 */
export interface WorkbenchAction {
  /** 点下去做什么 */
  run(): Promise<unknown>;
  /** 按钮上的数字；0 不显示 */
  readonly count: Signal<number>;
  /** 正在执行 */
  readonly pending: Signal<boolean>;
  /** 不能点的原因，悬停与读屏都读得到；`null` 表示可以点 */
  readonly disabledReason: Signal<string | null>;
}

/**
 * 页面登记给顶栏的内容（epic-016）
 *
 * @remarks
 * 顶栏不认识任何页面：要哪几颗按钮、按钮做什么、现在能不能点，都由页面在这里说清。不需要的按钮登记为 `null`。
 * 撤销、重做与操作历史是本页作用域的；推送、拉取三页都登记整机的那一组（`SyncCommands`）。
 */
export interface PageWorkbenchRegistration {
  /** 页面标题，宽屏时顶栏显示 */
  readonly title: string;
  /** 撤销、重做与操作历史的作用域，写在编辑组上，如「本页：商品」 */
  readonly scopeLabel: string;
  readonly undo: WorkbenchAction | null;
  readonly redo: WorkbenchAction | null;
  /** 操作历史面板读这个作用域；`null` 不显示操作历史开关 */
  readonly history: HistoryScopeAPI | null;
  readonly push: WorkbenchAction | null;
  readonly pull: WorkbenchAction | null;
}

/**
 * 当前页面登记的顶栏内容，以及撤销、重做的快捷键
 *
 * @remarks
 * 同一时刻只有一份登记：后进的页面覆盖先前的，先走的页面注销时不会把后进的那份清掉。
 */
@Injectable({ providedIn: 'root' })
export class PageWorkbench {
  readonly #current = signal<PageWorkbenchRegistration | null>(null);
  readonly #error = signal<string | null>(null);

  /** 当前页面的登记；首页等不登记的页面为 `null` */
  readonly current = this.#current.asReadonly();
  /** 上一次经顶栏执行的命令失败的原因 */
  readonly error = this.#error.asReadonly();

  constructor() {
    const document = inject(DOCUMENT);
    const onKeydown = (event: KeyboardEvent) => this.#handleShortcut(event);
    document.addEventListener('keydown', onKeydown);
    inject(DestroyRef).onDestroy(() => document.removeEventListener('keydown', onKeydown));
  }

  register(registration: PageWorkbenchRegistration): void {
    this.#current.set(registration);
    this.#error.set(null);
  }

  unregister(registration: PageWorkbenchRegistration): void {
    if (this.#current() === registration) this.#current.set(null);
  }

  /**
   * 执行一条命令
   *
   * @param action - 页面登记的命令
   * @remarks 不可用或正在执行时什么也不做；失败的原因记在 {@link PageWorkbench.error}，下一次执行前清掉
   */
  async run(action: WorkbenchAction | null): Promise<void> {
    if (!action || action.disabledReason() !== null || action.pending()) return;
    this.#error.set(null);
    try {
      await action.run();
    } catch (error) {
      this.#error.set(getErrorMessage(error, '操作失败'));
    }
  }

  #handleShortcut(event: KeyboardEvent): void {
    const action = shortcutAction(event, this.#current());
    if (!action) return;
    event.preventDefault();
    void this.run(action);
  }
}

/**
 * 快捷键对应的命令
 *
 * @param event - 键盘事件
 * @param registration - 当前页面的登记
 * @returns ⌘/Ctrl+Z 是撤销，⌘/Ctrl+Shift+Z 与 Ctrl+Y 是重做；焦点在可编辑区域里或输入法组字时为 `null`，交给浏览器原生的撤销
 */
export function shortcutAction(
  event: KeyboardEvent,
  registration: PageWorkbenchRegistration | null
): WorkbenchAction | null {
  if (!registration || event.isComposing || isEditableTarget(event.target)) return null;
  if (!(event.metaKey || event.ctrlKey) || event.altKey) return null;
  const key = event.key.toLowerCase();
  if (key === 'z') return event.shiftKey ? registration.redo : registration.undo;
  if (key === 'y' && event.ctrlKey && !event.shiftKey) return registration.redo;
  return null;
}

const EDITABLE = 'input, textarea, select, [contenteditable]:not([contenteditable="false"])';

const isEditableTarget = (target: EventTarget | null): boolean =>
  target instanceof Element && target.closest(EDITABLE) !== null;

/**
 * 在页面的注入上下文里登记顶栏内容，页面销毁时注销
 *
 * @param registration - 页面要的按钮与它们的命令、状态
 */
export function registerPageWorkbench(registration: PageWorkbenchRegistration): void {
  const workbench = inject(PageWorkbench);
  workbench.register(registration);
  inject(DestroyRef).onDestroy(() => workbench.unregister(registration));
}
