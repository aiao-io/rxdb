/**
 * @fileoverview 桌面 host 请求 kind 的闭集守卫（US-904 阶段 D，AC#50）。
 *
 * @remarks
 * 三族 host（SQLite / 文件 / PGlite）共用一条 IPC 通道，主进程按 `kind` 分派，而 SQLite
 * 是唯一的**兜底分支**：那边把「不是 open/close/version 的」一律当 `execute` 处理。一个
 * 同源脚本（renderer 里任何一段 JS 都能拿到 `contextBridge` 暴露的桥）绕过 connector 直接
 * 打桥、带一个协议不认识的 `kind`，就整段落进 SQLite 兜底——虽然最终会被 `parseDesktopHostRequest`
 * 拒掉，但「分派之前的显式拒绝」才是这道闸存在的意义：它让未知 kind 在**任何 host 被触碰之前**
 * 就以 `protocol_violation` 收口，而不是靠兜底分支事后拦截。
 *
 * 这是 AC#50「connector / preload / host 各自校验」里的**第二道**：connector 在页内做
 * capability × mutationPolicy 三层授权，本模块与 preload 内联副本做 kind 形状闸，host 做
 * 协议 / 会话归属 / 越界路径 / 脱敏。preload 在 `sandbox: true` 下不能值导入同目录文件
 * （ELEC-15），因此它的 kind 闸是**逐字内联**的；本模块是那份内联名单的唯一真相源，
 * 由主进程统一 host 的 dispatch 前置校验直接消费，并由 spec 把 preload 的内联副本钉回这里。
 *
 * @module desktop-host-request-guard
 */

/** SQLite 族的请求 kind（`desktop-host-protocol.ts` 的 `REQUEST_KINDS`；协议未导出谓词，故此处内联）。 */
const SQLITE_REQUEST_KINDS: readonly string[] = ['handshake', 'open', 'execute', 'version', 'close'];

/** 文件族请求 kind（`desktop-host-protocol.ts` 的 `FILE_REQUEST_KINDS`）。 */
const FILE_REQUEST_KINDS: readonly string[] = [
  'file.open',
  'file.close',
  'file.stat',
  'file.list',
  'file.mkdir',
  'file.rmdir',
  'file.remove',
  'file.move',
  'file.read',
  'file.writeBegin',
  'file.writeChunk',
  'file.writeCommit',
  'file.writeAbort',
  'file.lockAcquire',
  'file.lockRelease'
];

/** PGlite 族请求 kind（`desktop-pglite-protocol.ts` 的 `PGLITE_REQUEST_KINDS`）。 */
const PGLITE_REQUEST_KINDS: readonly string[] = [
  'pg.handshake',
  'pg.open',
  'pg.query',
  'pg.exec',
  'pg.begin',
  'pg.commit',
  'pg.rollback',
  'pg.version',
  'pg.close'
];

/** 三族请求 kind 的闭集；分派与 preload 闸都只认这个集合。 */
export const DESKTOP_HOST_REQUEST_KINDS: ReadonlySet<string> = new Set<string>([
  ...SQLITE_REQUEST_KINDS,
  ...FILE_REQUEST_KINDS,
  ...PGLITE_REQUEST_KINDS
]);

/** 从未经校验的负载上安全读出 `kind`；形状不符时返回 `undefined`（由 host 去报 `protocol_violation`）。 */
export function readDesktopHostRequestKind(payload: unknown): string | undefined {
  if (typeof payload !== 'object' || payload === null) return undefined;
  const kind = (payload as Record<string, unknown>)['kind'];
  return typeof kind === 'string' ? kind : undefined;
}

/**
 * 判断负载的 `kind` 是否在三族协议闭集内。
 *
 * @remarks
 * 这是**形状闸**而不是协议校验：只回答「这个 kind 是不是本协议认识的」，不碰 SQL、绑定值、
 * 路径或任何载荷内容——那留待各 host 的 `parseDesktopHost*Request` 与越界路径判定。脱敏也
 * 因此成立：拒绝应答里不回显调用方送进来的 `kind` 值。
 *
 * @param payload - 未经校验的 IPC 入参。
 * @returns `kind` 是三族之一时为 `true`。
 */
export function isKnownDesktopHostRequestKind(payload: unknown): boolean {
  const kind = readDesktopHostRequestKind(payload);
  return kind !== undefined && DESKTOP_HOST_REQUEST_KINDS.has(kind);
}
