import type { RxDB } from '@aiao/rxdb';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router-dom';
import { afterEach, describe, expect, it } from 'vitest';
import { connectLocalAdapter, setDbConnectionError } from '../rxdb/db-connection';
import { RouteLoadError } from './RouteLoadError';

/**
 * @fileoverview 受守卫路由的 loader 失败时，错误留在布局里（US-221）。
 */

afterEach(() => {
  setDbConnectionError(null);
});

/** 布局里带一个标记，用来确认应用壳没有被根路由的默认错误页换掉。 */
const renderWithFailingLoader = (loader: () => Promise<null>) => {
  const router = createMemoryRouter(
    [
      {
        path: '/',
        element: (
          <div data-testid='layout'>
            <Outlet />
          </div>
        ),
        children: [{ path: 'gated', loader, errorElement: <RouteLoadError />, element: <p>page</p> }]
      }
    ],
    { initialEntries: ['/gated'] }
  );
  render(<RouterProvider router={router} />);
};

describe('RouteLoadError', () => {
  it('连不上数据库：路由区留空，布局还在（原因由应用壳的提示显示）', async () => {
    const failure = new Error('held by another context');
    const db = { config: { sync: { local: { adapter: 'sqlite-wasm' } } }, connect: () => Promise.reject(failure) };
    renderWithFailingLoader(async () => {
      await connectLocalAdapter(db as unknown as RxDB);
      return null;
    });

    expect(await screen.findByTestId('layout')).toBeTruthy();
    expect(screen.queryByTestId('route-load-error')).toBeNull();
    expect(screen.queryByText('page')).toBeNull();
  });

  it('其它错误：在布局里显示出来', async () => {
    renderWithFailingLoader(() => Promise.reject(new Error('boom')));

    expect((await screen.findByTestId('route-load-error')).textContent).toContain('boom');
    expect(screen.getByTestId('layout')).toBeTruthy();
  });
});
