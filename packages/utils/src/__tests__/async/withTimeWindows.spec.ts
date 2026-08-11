/**
 * 时间窗契约（RVU-010）。
 *
 * @remarks
 * 这段逻辑原本只存在于 `packages/rxdb-angular/src/rxdb-change-detector.directive.ts`。
 * Vue/React 补齐实体 patch 桥接后就是三份实现，而 RAN-011 修的正是「窗口是否挂入管道」
 * 这种一字之差的语义 —— 三份拷贝必然漂移，因此上收到 `@aiao/utils` 只留一份定义。
 */
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isActiveTimeWindow, withTimeWindows } from '../../async/withTimeWindows.js';

describe('isActiveTimeWindow', () => {
  it.each([
    ['正整数', 100],
    ['正小数', 0.5]
  ])('%s 是有效时间窗', (_label, duration) => {
    expect(isActiveTimeWindow(duration)).toBe(true);
  });

  // RAN-011：`0` 语义是「禁用」，负值/NaN 是无意义输入，Infinity 会让 debounceTime 永不放行
  it.each([
    ['零', 0],
    ['负数', -1],
    ['NaN', Number.NaN],
    ['正无穷', Number.POSITIVE_INFINITY],
    ['负无穷', Number.NEGATIVE_INFINITY]
  ])('%s 不是有效时间窗', (_label, duration) => {
    expect(isActiveTimeWindow(duration)).toBe(false);
  });
});

describe('withTimeWindows', () => {
  let source: Subject<number>;

  beforeEach(() => {
    vi.useFakeTimers();
    source = new Subject<number>();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('两个窗口都禁用时原样返回源流（同步透传）', () => {
    // 断言的是**引用相等**：只要挂了 operator，哪怕是 debounceTime(0)，
    // 值也要经 asyncScheduler 绕一圈，同步消费者当拍拿不到（RAN-011）
    expect(withTimeWindows(source, 0, 0)).toBe(source);
  });

  it('禁用时值同步到达', () => {
    const received: number[] = [];
    withTimeWindows(source, 0, 0).subscribe(value => received.push(value));

    source.next(1);

    expect(received).toEqual([1]);
  });

  it('只启用 debounce 时按安静期放行最后一个值', async () => {
    const received: number[] = [];
    withTimeWindows(source, 100, 0).subscribe(value => received.push(value));

    source.next(1);
    source.next(2);
    await vi.advanceTimersByTimeAsync(99);
    expect(received).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(received).toEqual([2]);
  });

  it('只启用 audit 时按采样窗放行', async () => {
    const received: number[] = [];
    withTimeWindows(source, 0, 50).subscribe(value => received.push(value));

    source.next(1);
    await vi.advanceTimersByTimeAsync(49);
    expect(received).toEqual([]);

    await vi.advanceTimersByTimeAsync(1);
    expect(received).toEqual([1]);
  });

  it('两者同时启用时串联生效，顺序为 debounceTime → auditTime', async () => {
    const received: number[] = [];
    withTimeWindows(source, 100, 50).subscribe(value => received.push(value));

    source.next(1);
    await vi.advanceTimersByTimeAsync(100);
    // debounce 在 t=100 放行后 audit 才起窗：串联而非二选一
    expect(received).toEqual([]);

    await vi.advanceTimersByTimeAsync(50);
    expect(received).toEqual([1]);
  });

  it.each([
    ['debounce 为负', -1, 0],
    ['audit 为 NaN', 0, Number.NaN],
    ['debounce 为 Infinity', Number.POSITIVE_INFINITY, 0]
  ])('%s 时对应 operator 不挂入管道', (_label, debounce, audit) => {
    const received: number[] = [];
    withTimeWindows(source, debounce, audit).subscribe(value => received.push(value));

    source.next(7);

    expect(received).toEqual([7]);
  });
});
