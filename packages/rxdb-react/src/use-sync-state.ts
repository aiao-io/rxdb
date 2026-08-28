import type { SyncState } from '@aiao/rxdb';
import { useCallback, useSyncExternalStore } from 'react';
import { useRxDB } from './rxdb-react.js';

/**
 * {@link useSyncState} 在当前 render 返回的同步状态快照。
 *
 * @remarks
 * 字段与核心的 `SyncState` 一一对应，取值就是普通只读值，可以直接解构。
 *
 * 状态没变时**引用稳定**（同一个对象跨 render 复用），因此可以安全地放进
 * `useEffect` / `useMemo` 的依赖数组。
 *
 * 三端等价实现：Angular `useSyncState`（`Signal`）、Vue `useSyncState`（`ComputedRef`），
 * 字段名与语义完全一致，只是容器形态不同。
 *
 * @public
 */
export type SyncStateResource = Readonly<SyncState>;

/**
 * 读取当前数据库的同步状态。
 *
 * @returns 见 {@link SyncStateResource}
 * @throws 组件树中没有 Provider、Provider 没拿到 `db`、异步 source 尚未就绪时各抛一条
 *   不同的文案；异步 source 创建失败时原样抛出创建异常（与 `useRxDB` 同语义）
 *
 * @example
 * ```tsx
 * const sync = useSyncState();
 *
 * return sync.online ? null : <span>离线 · 待推 {sync.pendingCount} 条</span>;
 * ```
 *
 * @remarks
 * 走 `useSyncExternalStore` 而不是 `useState` + `useEffect`：状态源在 React 之外
 * （RxJS 流），而 `useEffect` 版本会在挂载后多渲染一帧「初值」再切到真值 ——
 * 面板会先闪一下「在线、0 条待推」，恰好是最不该撒的谎。`getSnapshot` 读的是 hub 自己
 * 缓存的那份对象，同一状态跨 render 引用不变，因此不会引起额外重渲染。
 *
 * 第三个参数（`getServerSnapshot`）与客户端读同一份快照：hub 在库构造时就存在，
 * SSR 下同样有值可读，不需要另立一套服务端初值。
 *
 * 数据库取不到时**抛错而不是**返回一份「一切正常」的默认值：那会把「面板没接上」
 * 伪装成「没有待推变更」，恰好是最需要出声的时候不出声。
 *
 * @public
 */
export const useSyncState = (): SyncStateResource => {
  const { syncState } = useRxDB();

  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      const subscription = syncState.state$.subscribe(onStoreChange);
      return () => subscription.unsubscribe();
    },
    [syncState]
  );
  const getSnapshot = useCallback(() => syncState.snapshot, [syncState]);

  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
};
