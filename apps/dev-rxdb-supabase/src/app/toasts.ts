import { DestroyRef, inject, Injectable, signal } from '@angular/core';

/** 消息的轻重：成功与提示自己消失，警告与错误留到用户关掉 */
export type ToastKind = 'success' | 'info' | 'warning' | 'error';

/** 消息上的一颗按钮，如身份不匹配时的「重新加载」 */
export interface ToastAction {
  readonly label: string;
  run(): void;
}

/** 要弹出的一条消息 */
export interface ToastInput {
  readonly kind: ToastKind;
  readonly message: string;
  readonly action?: ToastAction;
  /** 消息从哪来，如 `sync-round-3`；e2e 靠它认出这一轮的结果 */
  readonly source?: string;
}

/** 弹出中的一条消息 */
export interface Toast extends ToastInput {
  readonly id: number;
}

/** 成功与提示停留多久 */
export const TOAST_DURATION_MS = 5000;

/** 同时最多留几条：再来新的，挤掉最早的那条 */
const MAX_TOASTS = 4;

/**
 * 操作结果的消息（toast）
 *
 * @remarks
 * 只放「刚做完的事」：推拉结果、撤销重做的失败、写入成功、切换身份失败。会一直成立的状态（本地模式、访客、
 * 会话已在别处换了身份、订单的依赖说明）留在页面里；表单与编辑框里的失败原因也留在原处——原生 `<dialog>` 的模态在
 * 浏览器的顶层之上，消息盖不过它。
 */
@Injectable({ providedIn: 'root' })
export class Toasts {
  readonly #list = signal<readonly Toast[]>([]);
  readonly #timers = new Map<number, ReturnType<typeof setTimeout>>();
  #nextId = 0;

  /** 弹出中的消息，最早的在前 */
  readonly list = this.#list.asReadonly();

  constructor() {
    inject(DestroyRef).onDestroy(() => {
      for (const timer of this.#timers.values()) clearTimeout(timer);
      this.#timers.clear();
    });
  }

  /**
   * 弹出一条消息
   *
   * @param input - 消息
   * @returns 消息 id，交给 {@link Toasts.dismiss}
   */
  show(input: ToastInput): number {
    const toast: Toast = { ...input, id: ++this.#nextId };
    const next = [...this.#list(), toast];
    for (const dropped of next.slice(0, Math.max(0, next.length - MAX_TOASTS))) this.#clearTimer(dropped.id);
    this.#list.set(next.slice(-MAX_TOASTS));
    if (input.kind === 'success' || input.kind === 'info') {
      this.#timers.set(
        toast.id,
        setTimeout(() => this.dismiss(toast.id), TOAST_DURATION_MS)
      );
    }
    return toast.id;
  }

  /** 关掉一条消息；已经关掉的什么也不做 */
  dismiss(id: number): void {
    this.#clearTimer(id);
    this.#list.update(list => list.filter(toast => toast.id !== id));
  }

  #clearTimer(id: number): void {
    const timer = this.#timers.get(id);
    if (timer === undefined) return;
    clearTimeout(timer);
    this.#timers.delete(id);
  }
}
