/**
 * 把任意 throw / RxJS error 通道载荷归一化成 `Error`。
 *
 * @param cause - 原始载荷；RxJS 的 error 通道与 `throw` 都是 `unknown`
 * @returns 原样透传的 `Error`，或包住 `String(cause)` 的新 `Error`
 *
 * @remarks
 * RAN-008（三端保真度对齐）：`useInfiniteScroll` 早先把 cause 整个丢掉，
 * 一律换成 `Failed to load ${EntityType.name} cursor page` —— 消费者拿不到
 * 任何可诊断信息，与 Angular/React 侧「原样透传 Error 实例」的语义也不一致。
 *
 * 归一化只在这里做一次：`hooks.ts` 与 `useInfiniteScroll.ts` 共用，
 * 各自复制一份必然漂移。`Error` 实例原样透传（保留 identity、`cause`、子类与堆栈）。
 *
 * @internal
 */
export const toError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));
