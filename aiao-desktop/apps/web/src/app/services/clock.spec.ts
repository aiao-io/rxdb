import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { configureServices } from '../testing/angular';
import { Clock } from './clock';

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 6, 27, 16, 34, 0));
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Clock', () => {
  it('从创建的那一刻开始，每秒跳一次', () => {
    configureServices([Clock]);
    const clock = TestBed.inject(Clock);
    expect(clock.now().getTime()).toBe(new Date(2026, 6, 27, 16, 34, 0).getTime());

    vi.advanceTimersByTime(999);
    expect(clock.now().getSeconds()).toBe(0);
    vi.advanceTimersByTime(1);
    expect(clock.now().getSeconds()).toBe(1);
    vi.advanceTimersByTime(59_000);
    expect(clock.now().getMinutes()).toBe(35);
  });

  it('宿主销毁后不再计时，没有遗留的定时器', () => {
    configureServices([Clock]);
    const clock = TestBed.inject(Clock);
    expect(vi.getTimerCount()).toBe(1);

    TestBed.resetTestingModule();
    expect(vi.getTimerCount()).toBe(0);
    const frozen = clock.now().getTime();
    vi.advanceTimersByTime(5000);
    expect(clock.now().getTime()).toBe(frozen);
  });
});
