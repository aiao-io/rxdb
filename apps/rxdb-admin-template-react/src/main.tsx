import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './app/router';
import { bindWorkbenchNavigator, workbenchShell } from './app/shell/workbench-shell';
import { getRootElement } from './main-root';

import './styles.css';

const basename = import.meta.env.BASE_URL;

const router = createBrowserRouter(routes, { basename });

bindWorkbenchNavigator(url => void router.navigate(url));
// 首次渲染之前就绑定浏览器：主题、布局变量在第一帧就位，避免闪烁
workbenchShell.attach();

const root = ReactDOM.createRoot(getRootElement(document));

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
