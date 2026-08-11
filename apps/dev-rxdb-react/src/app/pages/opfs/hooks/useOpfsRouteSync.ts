import { useEffect, useRef } from 'react';

interface OpfsRouteSyncOptions {
  available: boolean;
  routePath: string;
  currentPath: string;
  init: (path: string) => Promise<void>;
  navigateTo: (path: string) => Promise<void>;
}

export function useOpfsRouteSync({ available, routePath, currentPath, init, navigateTo }: OpfsRouteSyncOptions): void {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (!available) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      void init(routePath);
      return;
    }
    if (routePath !== currentPath) void navigateTo(routePath);
  }, [available, currentPath, init, navigateTo, routePath]);
}
