import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { Toast } from './toast';

function setup(): Toast {
  configureServices([Toast]);
  return TestBed.inject(Toast);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Toast', () => {
  it('一开始没有提示', () => {
    const toast = setup();
    expect(toast.message()).toBe('');
    expect(toast.visible()).toBe(false);
  });

  it('show 显示提示，2.1 秒后自动隐藏', () => {
    const toast = setup();
    toast.show('Copied');
    expect(toast.message()).toBe('Copied');
    expect(toast.visible()).toBe(true);

    vi.advanceTimersByTime(2099);
    expect(toast.visible()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(toast.visible()).toBe(false);
    expect(toast.message()).toBe('Copied');
  });

  it('连续 show 以最后一条为准，并从头计时', () => {
    const toast = setup();
    toast.show('first');
    vi.advanceTimersByTime(1500);
    toast.show('second');
    vi.advanceTimersByTime(1500);
    expect(toast.message()).toBe('second');
    expect(toast.visible()).toBe(true);

    vi.advanceTimersByTime(600);
    expect(toast.visible()).toBe(false);
  });
});
