import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { setDbConnectionError } from '../rxdb/db-connection';
import { DbConnectionAlert } from './DbConnectionAlert';

/**
 * @fileoverview 应用壳的数据库连接失败提示（US-221；Angular / Vue 端同名 spec 的移植）。
 */

afterEach(() => {
  act(() => setDbConnectionError(null));
});

describe('DbConnectionAlert', () => {
  it('连接正常时不渲染', () => {
    const { container } = render(<DbConnectionAlert />);

    expect(container.innerHTML).toBe('');
  });

  it('登记了连接失败：role=alert 显示错误信息，带重新加载按钮', () => {
    render(<DbConnectionAlert />);
    act(() => setDbConnectionError('OPFS database file "x.sqlite" is held by another context'));

    const alert = screen.getByRole('alert');
    expect(alert.getAttribute('data-testid')).toBe('app-db-error');
    expect(alert.textContent).toContain('数据库打不开');
    expect(alert.textContent).toContain('is held by another context');
    const button = screen.getByRole('button', { name: '重新加载' });
    expect(button.getAttribute('type')).toBe('button');
  });
});
