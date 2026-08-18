/**
 * @fileoverview 主进程侧的会话归属断言：会话 id 不是凭证。
 *
 * @remarks
 * 两族 bridge 都按 `sessionId` 记账窗口归属，但归属原本只用于**回收**（窗口销毁时关掉它名下的会话），
 * 请求路径上并不校验。于是任何一个渲染进程只要拿到别的窗口的 session id，就能拿它执行 SQL、
 * 关掉对方的会话、或放掉对方正持有的文件锁 —— 相当于把「UUID 不好猜」当成了授权。
 *
 * 判据与 Tauri 侧的 `reject_foreign_session`（`packages/rxdb-adapter-tauri/rust/src/router.rs`）逐字对应：
 * 只拒**属于别人**的会话；查不到持有者的一律放行，让 host 去答 `session_closed`。
 * 两族共用这一份实现而不是各抄一遍 —— 抄两份，改一份就是另一份悄悄失效。
 *
 * @module desktop-session-ownership
 */

/** 越权请求的应答；结构上是两族响应联合里的 `error` 分支。 */
export interface DesktopForeignSessionDenial {
  /** 恒为 `error`。 */
  readonly kind: 'error';
  /** 恒为 `permission_denied`：语义是「别再试了」，与可重连的 `session_closed` 相对。 */
  readonly code: 'permission_denied';
  /** 面向调用方的说明，不含持有者身份。 */
  readonly message: string;
}

/**
 * 从未经校验的请求负载上读出会话 id。
 *
 * @remarks
 * 负载来自 renderer，形状上不做任何假设：不是对象、没有 `sessionId`、`sessionId` 不是字符串，
 * 一律返回 `undefined`。归属记账因此不需要 `request as { sessionId: string }` 这种断言 ——
 * 断言在「应答是 close 就说明请求过了校验」这条推理上成立，但那条推理写不进类型，
 * 一旦 host 的校验或应答形状变了，编译期没有任何东西会提醒这里。
 *
 * @param request - 未经校验的请求负载
 * @returns 会话 id；形状不符时 `undefined`
 */
export function readSessionId(request: unknown): string | undefined {
  if (typeof request !== 'object' || request === null) return undefined;
  const sessionId = (request as Record<string, unknown>)['sessionId'];
  return typeof sessionId === 'string' ? sessionId : undefined;
}

/**
 * 请求指向的会话若属于别的窗口，给出拒绝应答。
 *
 * @remarks
 * 负载未经协议校验，因此这里对形状不做任何假设：不是对象、没有 `sessionId`、
 * `sessionId` 不是字符串，一律返回 `undefined` 交给 host 去报 `protocol_violation`。
 *
 * 查不到持有者时同样放行。会话不存在（从没开过，或已经关了）与会话属于别人是两回事：
 * 前者 host 会答 `session_closed`，调用方据此重连；后者答 `permission_denied`，调用方应当放弃。
 * 把前者也报成越权，等于把一次正常的重连变成一个死结。
 *
 * @typeParam TTarget - 窗口身份类型，按引用比较
 * @param targets - 会话 id 到持有窗口的记账表
 * @param request - 未经校验的请求负载
 * @param target - 发起本次请求的窗口
 * @returns 越权时返回拒绝应答，否则 `undefined`
 */
export function denyForeignSession<TTarget>(
  targets: ReadonlyMap<string, TTarget>,
  request: unknown,
  target: TTarget
): DesktopForeignSessionDenial | undefined {
  const sessionId = readSessionId(request);
  if (sessionId === undefined) return undefined;
  const holder = targets.get(sessionId);
  if (holder === undefined || holder === target) return undefined;
  // 不回显持有者：那是另一个窗口的信息，对发起方没有用处，只会多暴露一点东西。
  return { kind: 'error', code: 'permission_denied', message: `session ${sessionId} belongs to another window` };
}
