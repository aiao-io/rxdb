/**
 * 把任意 throw / RxJS error 通道载荷归一化成 `Error`。
 *
 * @param cause - 原始载荷；RxJS 的 error 通道与 `throw` 都是 `unknown`
 * @returns 原样透传的 `Error`，或包住 `String(cause)` 的新 `Error`
 *
 * @remarks
 * RAN-008：`InfiniteScrollingList.error` 与 {@link RxDBResource.error} 都声明为
 * `Error | undefined`，但 RxJS 的 error 通道实际是 `unknown` —— 仓库抛字符串时，
 * 未归一化的写入会让消费者按声明读 `.message` 得到 `undefined`。
 *
 * 归一化只在这里做一次：`hooks.ts` 与 `InfiniteScrollingList.ts` 共用，
 * 各自复制一份必然漂移。抽成独立模块而不是从 `hooks.ts` 导出，
 * 是为了避免 `InfiniteScrollingList` ↔ `hooks` 互相 import 形成循环依赖。
 *
 * `Error` 实例原样透传（保留 identity、`cause`、子类与堆栈），
 * 与 React 侧 `@aiao/rxdb-react` 的 `toError` 同语义。
 *
 * @internal
 */
export const toError = (cause: unknown): Error => (cause instanceof Error ? cause : new Error(String(cause)));
