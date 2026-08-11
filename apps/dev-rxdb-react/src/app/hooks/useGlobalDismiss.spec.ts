import { fireEvent, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useGlobalDismiss } from './useGlobalDismiss';

describe('useGlobalDismiss', () => {
  it('active 为 false 时不挂监听', () => {
    const onDismiss = vi.fn();
    renderHook(() => useGlobalDismiss(false, onDismiss));

    fireEvent.click(document.body);
    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('active 期间 click 与 Escape 都会触发关闭', () => {
    const onDismiss = vi.fn();
    renderHook(() => useGlobalDismiss(true, onDismiss));

    fireEvent.click(document.body);
    expect(onDismiss).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onDismiss).toHaveBeenCalledTimes(2);
  });

  it('其它按键不触发关闭', () => {
    const onDismiss = vi.fn();
    renderHook(() => useGlobalDismiss(true, onDismiss));

    fireEvent.keyDown(document, { key: 'Enter' });
    fireEvent.keyDown(document, { key: 'a' });

    expect(onDismiss).not.toHaveBeenCalled();
  });

  it('active 由 true 变 false 后立刻停止监听', () => {
    const onDismiss = vi.fn();
    const { rerender } = renderHook(({ active }) => useGlobalDismiss(active, onDismiss), {
      initialProps: { active: true }
    });

    rerender({ active: false });
    fireEvent.click(document.body);

    expect(onDismiss).not.toHaveBeenCalled();
  });
});
