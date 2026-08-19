/**
 * preload 注入桌面宿主桥接时挂在全局上的键名。
 *
 * @remarks
 * 这里刻意**抄一份字面量**，而不是 `import` 适配器包里的同名常量。本探针要在建库之前跑
 * （候选表靠它选后端），所以它在主 chunk 里；而包里这个常量与 `DesktopSqliteClient`
 * 同住一个模块，import 它就等于把桌面传输客户端整个拽进 `main.js` —— 正是 US-207 E11 与
 * US-505 AC#10 要挡的那件事。
 *
 * 代价由 `desktop-environment.spec.ts` 兜住：那里 import 包里的常量并断言二者相等，
 * 且用它去构造探针的输入。单测走源码、不进产物，所以这个 import 不花 bundle 的钱，
 * 而键名漂了会当场变红 —— 不会拖成运行时的「桌面窗口里探不到桥接，静默退回 wa-sqlite」。
 */
const DESKTOP_HOST_TRANSPORT_KEY = '__aiaoRxdbDesktopHost__';

/**
 * 判断给定对象上是否挂着 preload 注入的桌面宿主桥接。
 *
 * @param value - 待检测对象，实际调用时传 `globalThis`
 * @returns 对象上存在 {@link DESKTOP_HOST_TRANSPORT_KEY} 时为 `true`
 *
 * @remarks
 * 参数化而非直接读全局 `window`，与 Tauri demo 的 `isTauriRuntime` 同构 ——
 * 浏览器预览与 Electron 窗口两条分支都要能在单测里跑到。
 *
 * **探的是 RxDB 自己的那把钥匙，不是 `window.electron`。** 后者是本 demo 的业务 IPC 桥，
 * 存在与否只说明 preload 跑过，说明不了「桌面适配器能不能工作」—— preload 少注册一条
 * `contextBridge` 就能让两者分家。探测用的键与后续 `resolveDesktopHostTransport()` 取用的
 * 是同一个（前者抄的字面量由单测钉住），判定与取用才不会各说各话。
 *
 * 判定只看键在不在，不去 `request()` 一次：探针必须无副作用（见 `LocalBackendCandidate.isAvailable`），
 * 而握手失败本来就该在 `connect()` 里以 `host_unavailable` 抛出来，不该被降级成「换个后端」。
 */
export function isDesktopHostRuntime(value: unknown): boolean {
  return typeof value === 'object' && value !== null && DESKTOP_HOST_TRANSPORT_KEY in value;
}
