import { Injectable, signal } from '@angular/core';

/** `RemoteSyncState` 里被 `resolveRemoteSync` 写入的那一面。 */
export interface RemoteSyncStateWriter {
  markConnected(connected: boolean): void;
}

/**
 * 远端（Supabase）是否真的连上了。
 *
 * @remarks
 * P1-2：resolver 早就算出了这个 boolean 并挂在 route data 的 `supabase` 键上，
 * **但没有任何页面读它** —— 两个 todo 页都没注入 `ActivatedRoute`。
 * 结果是纯本地模式下 pull / push 按钮照样可点，点完报一条与原因无关的错。
 *
 * 用一个 root 级 signal 承载它，比让每个页面去解 route data 更直接，
 * 也让"是否连上远端"变成可以被组件模板直接绑定的状态。
 */
@Injectable({ providedIn: 'root' })
export class RemoteSyncState {
  readonly #connected = signal(false);

  /** 远端适配器是否已连接；`false` 表示纯本地模式。 */
  readonly $connected = this.#connected.asReadonly();

  markConnected(connected: boolean): void {
    this.#connected.set(connected);
  }
}
