import type { OrbitClient } from '@aiao/orbit/client';
import { bindOrbitRoute } from '@modules/orbit';
import { StrictMode, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './app/router';
import { getRootElement } from './main-root';
import './styles.css';

export async function bootstrap(client: OrbitClient | undefined): Promise<void> {
  const basename = import.meta.env.BASE_URL;
  const router = createBrowserRouter(routes, { basename });
  const root = createRoot(getRootElement(document));
  let unbind: () => void = () => undefined;
  let stop: () => void = () => undefined;
  let closed = false;
  client?.onDispose(() => {
    closed = true;
    stop();
    unbind();
    root.unmount();
    void router.dispose();
  });
  const bindHostRoute = () => {
    if (closed) return;
    unbind = bindOrbitRoute({
      navigate: (path, replace) => void router.navigate(path, { replace }),
      subscribe: onChange =>
        router.subscribe(state => {
          const path = state.location.pathname;
          onChange(path.startsWith(basename) ? path.slice(basename.length) : path);
        })
    });
  };
  function Ready() {
    useEffect(() => {
      if (router.state.initialized) {
        bindHostRoute();
        client?.ready();
        return () => unbind();
      }
      stop = router.subscribe(state => {
        if (!state.initialized) return;
        stop();
        queueMicrotask(() => {
          if (!closed) {
            bindHostRoute();
            client?.ready();
          }
        });
      });
      return () => {
        stop();
        unbind();
      };
    }, []);
    return <RouterProvider router={router} />;
  }
  root.render(
    <StrictMode>
      <Ready />
    </StrictMode>
  );
}
