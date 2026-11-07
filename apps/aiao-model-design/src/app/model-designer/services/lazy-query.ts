import { computed, type Signal } from '@angular/core';
import { toObservable } from '@angular/core/rxjs-interop';
import { filter, firstValueFrom, take } from 'rxjs';

/**
 * `useFindAll` 返回值里我们关心的三个信号。
 *
 * ⚠️ **这是一个反复踩中的陷阱，抽出来是为了别再犯第四次。**
 *
 * `useFindAll(...).value` 是 **lazy signal**：
 *
 * 1. **不读它，底层活查询就不会订阅**（`hasSubscriber` 只在 Observable 被订阅时置位）；
 * 2. 首次读到的是 `initialValue: []`，它表示「还没查完」而**不是**「确实没有数据」。
 *
 * 任何「读一次快照就做决定」的异步逻辑（复制、回滚、导出、判断是否已存在）
 * 都必须先等首帧真实数据，否则会拿空数组当结论。已知踩中的地方：
 * - `GenericChatSessionService.ensureSession`（重复建会话 + 聊天 0 气泡）
 * - `ModelDesignService.copy` / `rollback`（复制出**空**设计，2026-07-27 e2e 实测）
 *
 * ⚠️ **第四处是另一种形状：首帧之后不再发射**（[缺陷台账 #21](../../../../requirements/known-defects.md)）。
 * `useRepositoryQuery` 里活查询的错误回调是 `error: setFailure`——按 RxJS 语义，
 * **`error` 一触发订阅即终止，永不再 `next`**。于是信号冻在旧值：数据在库里、界面停在旧数量、
 * 刷新才恢复。而 `error` 信号本仓 **13 处调用点无一读过**，所以这一切是静默的。
 * `createQueryGate` 那种「等首帧」的闸门对它无效——首帧早就来过了。
 */
export interface LazyQuery<T> {
  value: Signal<T[]>;
  hasValue: Signal<boolean>;
  error: Signal<Error | undefined>;
}

/** 只需要错误通道的查询（`useFindAll` 的返回值天然满足） */
export type FailableQuery = Pick<LazyQuery<unknown>, 'error'>;

/**
 * 把一组活查询的错误折叠成一条可显示的消息。
 *
 * 活查询一旦 error，它的订阅就死了，界面会**永远**停在最后一帧——这不是「慢」，
 * 是不会再来了。所以宁可把原始 message 直接透出去，也不要让用户对着一个冻住的
 * 列表猜（[缺陷台账 #21](../../../../requirements/known-defects.md)）。
 *
 * @param queries 需要监视的查询集合
 * @returns 首个出错查询的消息；全部正常时为 `null`
 */
export function firstQueryError(queries: readonly FailableQuery[]): Signal<string | null> {
  return computed(() => {
    for (const query of queries) {
      const error = query.error();
      if (error) return `Live query failed: ${error.message}`;
    }
    return null;
  });
}

/**
 * 建一个「等这些查询都出过首帧数据」的闸门。
 *
 * ⚠️ **必须在注入上下文里调用**（字段初始化器 / 构造函数）——内部用了
 * `toObservable`，在普通 async 方法里调会抛 NG0203。
 *
 * @param queries 需要等待的查询集合
 * @returns 可在任意时刻 await 的闸门函数；已就绪时立即返回
 *
 * @example
 * ```ts
 * readonly #ready = createQueryGate([this.#entitiesQuery, this.#propsQuery]);
 *
 * async copy(id: string) {
 *   await this.#ready();   // 否则可能拿 initialValue: [] 当「没有数据」
 *   ...
 * }
 * ```
 */
export function createQueryGate(queries: readonly LazyQuery<unknown>[]): () => Promise<void> {
  const gates = queries.map(query => ({
    query,
    ready$: toObservable(query.hasValue).pipe(filter(Boolean), take(1))
  }));

  return async () => {
    // 先读一次触发订阅——lazy signal 不被读就永远不会有首帧
    for (const { query } of gates) query.value();

    const pending = gates.filter(gate => !gate.query.hasValue());
    if (pending.length === 0) return;

    await Promise.all(pending.map(gate => firstValueFrom(gate.ready$)));
  };
}
