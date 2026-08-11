import { renderHook } from '@testing-library/react';
import { vi } from 'vitest';
import { useOpfsRouteSync } from './useOpfsRouteSync';

describe('useOpfsRouteSync', () => {
  it('initializes from the deep link and follows later browser navigation', () => {
    const init = vi.fn();
    const navigateTo = vi.fn();
    const { rerender } = renderHook(
      ({ routePath, currentPath }) =>
        useOpfsRouteSync({
          available: true,
          routePath,
          currentPath,
          init,
          navigateTo
        }),
      { initialProps: { routePath: '/docs/', currentPath: '/' } }
    );

    expect(init).toHaveBeenCalledWith('/docs/');
    expect(navigateTo).not.toHaveBeenCalled();

    rerender({ routePath: '/docs/', currentPath: '/docs/' });
    rerender({ routePath: '/photos/', currentPath: '/docs/' });

    expect(navigateTo).toHaveBeenCalledTimes(1);
    expect(navigateTo).toHaveBeenCalledWith('/photos/');
  });

  it('waits for OPFS availability before initializing', () => {
    const init = vi.fn();
    const navigateTo = vi.fn();
    const { rerender } = renderHook(
      ({ available }) =>
        useOpfsRouteSync({
          available,
          routePath: '/',
          currentPath: '/',
          init,
          navigateTo
        }),
      { initialProps: { available: false } }
    );

    expect(init).not.toHaveBeenCalled();
    rerender({ available: true });
    expect(init).toHaveBeenCalledWith('/');
  });
});
