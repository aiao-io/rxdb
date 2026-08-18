import { DESKTOP_HOST_TRANSPORT_KEY } from '@aiao/rxdb-adapter-electron';

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
 * `contextBridge` 就能让两者分家。用同一个常量探测和取用，判定与后续 `resolveDesktopHostTransport()`
 * 才不会各说各话。
 *
 * 判定只看键在不在，不去 `request()` 一次：探针必须无副作用（见 `LocalBackendCandidate.isAvailable`），
 * 而握手失败本来就该在 `connect()` 里以 `host_unavailable` 抛出来，不该被降级成「换个后端」。
 */
export function isDesktopHostRuntime(value: unknown): boolean {
  return typeof value === 'object' && value !== null && DESKTOP_HOST_TRANSPORT_KEY in value;
}
