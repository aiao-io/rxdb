import { useEffect, useState, useSyncExternalStore } from 'react';

interface Subscribable<TSnapshot> {
  readonly snapshot: TSnapshot;
  subscribe(listener: () => void): () => void;
  dispose(): void;
}

function createControllerStore<TController extends Subscribable<TSnapshot>, TSnapshot>(controller: TController) {
  let snapshot = controller.snapshot;
  let lease = 0;
  return {
    controller,
    getSnapshot: () => snapshot,
    subscribe(listener: () => void): () => void {
      snapshot = controller.snapshot;
      return controller.subscribe(() => {
        snapshot = controller.snapshot;
        listener();
      });
    },
    retain(): () => void {
      const currentLease = ++lease;
      return () => {
        queueMicrotask(() => {
          if (lease === currentLease) controller.dispose();
        });
      };
    }
  };
}

/** 仅框架内部使用的控制器生命周期与稳定外部快照缓存。 */
export function useControllerStore<TController extends Subscribable<TSnapshot>, TSnapshot>(factory: () => TController) {
  const [store] = useState(() => createControllerStore<TController, TSnapshot>(factory()));
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  useEffect(() => store.retain(), [store]);
  return { controller: store.controller, snapshot };
}
