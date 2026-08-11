import { Injectable, signal } from '@angular/core';

/** {@link RxDBConnectionState} 里被 initializer 写入的那一面。 */
export interface RxDBConnectionStateWriter {
  markFailed(error: unknown): void;
}

/**
 * 本地数据库连接失败的应用内状态。
 *
 * @remarks
 * TAURI-01：连接原先直接在 app initializer 里 reject —— Angular 会**中止 bootstrap**，
 * 组件树根本不渲染，`main.ts` 只有一句 `console.error`，用户看到的是空窗口。
 * 而 `home.page.html` 里那块 `@case ('error')` 诊断面板**永远到不了**：
 * 它需要组件先渲染出来才有机会显示。
 *
 * 把失败降级成状态之后，bootstrap 照常完成，那块面板第一次真正可达。
 */
@Injectable({ providedIn: 'root' })
export class RxDBConnectionState {
  readonly #error = signal<unknown>(null);

  /** 连接失败时的原始错误；`null` 表示未失败。 */
  readonly $error = this.#error.asReadonly();

  markFailed(error: unknown): void {
    this.#error.set(error);
  }
}
