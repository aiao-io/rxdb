import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOAST_DURATION_MS, Toasts } from './toasts';

describe('Toasts', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('成功与提示过一会儿自己消失；警告与错误留到用户关掉', () => {
    const toasts = TestBed.inject(Toasts);

    toasts.show({ kind: 'success', message: '拉取完成' });
    toasts.show({ kind: 'info', message: '已加入星河零售' });
    toasts.show({ kind: 'warning', message: '被拒 1 条' });
    toasts.show({ kind: 'error', message: '推送失败' });
    vi.advanceTimersByTime(TOAST_DURATION_MS);

    expect(toasts.list().map(toast => toast.message)).toEqual(['被拒 1 条', '推送失败']);
  });

  it('新的排在最后，带着来源与动作；关掉一条只关那一条', () => {
    const toasts = TestBed.inject(Toasts);
    const reload = vi.fn();

    const first = toasts.show({ kind: 'error', message: '身份不匹配', action: { label: '重新加载', run: reload } });
    toasts.show({ kind: 'error', message: '撤销失败', source: 'workbench' });
    toasts.dismiss(first);

    expect(toasts.list()).toEqual([expect.objectContaining({ message: '撤销失败', source: 'workbench' })]);
  });

  it('同时最多留几条：再来新的，挤掉最早的那条', () => {
    const toasts = TestBed.inject(Toasts);

    for (let index = 1; index <= 6; index++) toasts.show({ kind: 'error', message: `第 ${index} 条` });

    expect(toasts.list().map(toast => toast.message)).toEqual(['第 3 条', '第 4 条', '第 5 条', '第 6 条']);
  });
});
