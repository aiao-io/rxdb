import { StrictMode } from 'react';
import * as ReactDOM from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { routes } from './app/router';
import { getRootElement } from './main-root';

import './styles.css';

const basename = import.meta.env.BASE_URL;

const router = createBrowserRouter(routes, { basename });

const root = ReactDOM.createRoot(getRootElement(document));

root.render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>
);
