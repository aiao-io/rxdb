import { bindWujieRoute } from '@aiao/utils';
import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './app/router';
import { getRootElement } from './main-root';

import './styles.css';

const basename = import.meta.env.BASE_URL;

const router = createBrowserRouter(routes, { basename });

/**
 * 剥掉 basename，换成宿主约定的语义化路径。
 *
 * `navigate()` 收的是 basename 相对路径，但 `state.location.pathname` 带着 basename，
 * 两端不对称，回传前必须先削平。补前导斜杠交给 `bindWujieRoute` 内部的归一化。
 */
const stripBasename = (pathname: string): string =>
  pathname.startsWith(basename) ? pathname.slice(basename.length) : pathname;

/** 与文档站宿主同步路由。独立运行时 `bindWujieRoute` 自己会静默跳过。 */
const bindHostRoute = () =>
  bindWujieRoute({
    navigate: (path, replace) => void router.navigate(path, { replace }),
    subscribe: onChange => router.subscribe(state => onChange(stripBasename(state.location.pathname)))
  });

const root = ReactDOM.createRoot(getRootElement(document));

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);

// data router 由 RouterProvider 挂载时才 initialize，此前的 navigate 会被初始加载顶掉；
// 已经初始化就直接接，否则会一直等一个可能永远不来的下一次状态更新。
if (router.state.initialized) bindHostRoute();
else {
  let stop: () => void = () => undefined;
  stop = router.subscribe(state => {
    if (!state.initialized) return;
    stop();
    bindHostRoute();
  });
}
