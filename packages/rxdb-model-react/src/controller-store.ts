import { useState, useSyncExternalStore } from 'react';

/** 绑定层对控制器的最小要求：可读快照与可订阅变化。 */
export interface Subscribable<TSnapshot> {
  readonly snapshot: TSnapshot;
  subscribe(listener: () => void): () => void;
}

function createControllerStore<TController extends Subscribable<TSnapshot>, TSnapshot>(controller: TController) {
  let snapshot = controller.snapshot;
  return {
    controller,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      snapshot = controller.snapshot;
      return controller.subscribe(() => {
        snapshot = controller.snapshot;
        listener();
      });
    }
  };
}

/**
 * 仅框架内部使用的控制器持有与稳定外部快照缓存。
 * @remarks 控制器放在 state 中，只有订阅随 effect 建立与清理。StrictMode 回放、`<Activity>` 隐藏与 Fast Refresh
 * 都会清理并重建 effects、保留 state，与真正卸载无从区分，因此这里不调用终态的 `dispose()`：
 * 重显后同一控制器照常可用，卸载后随组件回收。
 */
export function useControllerStore<TController extends Subscribable<TSnapshot>, TSnapshot>(factory: () => TController) {
  const [store] = useState(() => createControllerStore<TController, TSnapshot>(factory()));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  return { controller: store.controller, snapshot };
}
