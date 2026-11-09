/**
 * `usePersistedState` 的客户端 hydrate 快照（RV-01a1ba4b4adf）。
 *
 * @remarks
 * 服务端只渲染本次调用的 `initialValue`；hydrate 必须用同一个值对齐服务端 HTML，
 * 提交之后再切到盘上值。用盘上值去 hydrate 会触发 React 的 hydration mismatch。
 */
import { act } from '@testing-library/react';
import { hydrateRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePersistedState } from '../use-persisted-state';

const store = new Map<string, string>();

beforeEach(() => {
  store.clear();
  Object.defineProperty(globalThis, 'localStorage', {
    value: {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => store.set(key, value),
      removeItem: (key: string) => store.delete(key)
    },
    writable: true
  });
});

let root: Root | undefined;

afterEach(() => {
  act(() => root?.unmount());
  root = undefined;
  document.body.innerHTML = '';
});

const Theme = ({ namespace }: { namespace: string }) => (
  <span>{usePersistedState(namespace, 'theme', 'dark').value}</span>
);

describe('usePersistedState（hydrate）', () => {
  it('先用 initialValue 对齐服务端 HTML，提交后切到盘上值，不产生 hydration mismatch', async () => {
    store.set('hydrate-theme:theme', JSON.stringify('light'));
    const container = document.createElement('div');
    container.innerHTML = '<span>dark</span>';
    document.body.appendChild(container);
    const recoverable = vi.fn();

    await act(async () => {
      root = hydrateRoot(container, <Theme namespace='hydrate-theme' />, { onRecoverableError: recoverable });
    });

    expect(recoverable).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe('<span>light</span>');
  });
});
