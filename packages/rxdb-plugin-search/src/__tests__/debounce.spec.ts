/**
 * T023 [US1] — Debounce 单测（先红）
 *
 * 覆盖：
 *  - 默认 300 ms 防抖（FR-007、research.md §4）
 *  - `0` 关闭防抖（直通）
 *  - 自定义 ms 生效
 *  - burst 输入：仅最后一个值在静止 N ms 后透出
 *  - 任意时刻 destroy 不再 emit
 *
 * 实现以 RxJS `debounceTime` 为底，封装为 `createDebouncedQueryStream(input$, ms)`，
 * 返回经防抖后的字符串流。
 */
import { Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDebouncedQueryStream } from '../core/debounce.js';

describe('debounce.createDebouncedQueryStream', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('默认 300 ms 防抖', () => {
    const input$ = new Subject<string>();
    const emitted: string[] = [];
    const sub = createDebouncedQueryStream(input$).subscribe(v => emitted.push(v));

    input$.next('a');
    vi.advanceTimersByTime(299);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual(['a']);

    sub.unsubscribe();
  });

  it('自定义 ms 生效', () => {
    const input$ = new Subject<string>();
    const emitted: string[] = [];
    const sub = createDebouncedQueryStream(input$, 100).subscribe(v => emitted.push(v));

    input$.next('x');
    vi.advanceTimersByTime(100);
    expect(emitted).toEqual(['x']);

    sub.unsubscribe();
  });

  it('debounce=0 关闭防抖（同步直通）', () => {
    const input$ = new Subject<string>();
    const emitted: string[] = [];
    const sub = createDebouncedQueryStream(input$, 0).subscribe(v => emitted.push(v));

    input$.next('a');
    input$.next('b');
    input$.next('c');
    expect(emitted).toEqual(['a', 'b', 'c']);

    sub.unsubscribe();
  });

  it('burst 输入仅最后一个被透出', () => {
    const input$ = new Subject<string>();
    const emitted: string[] = [];
    const sub = createDebouncedQueryStream(input$, 200).subscribe(v => emitted.push(v));

    input$.next('a');
    vi.advanceTimersByTime(50);
    input$.next('ab');
    vi.advanceTimersByTime(50);
    input$.next('abc');
    vi.advanceTimersByTime(199);
    expect(emitted).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(emitted).toEqual(['abc']);

    sub.unsubscribe();
  });

  it('unsubscribe 后不再 emit', () => {
    const input$ = new Subject<string>();
    const emitted: string[] = [];
    const sub = createDebouncedQueryStream(input$, 100).subscribe(v => emitted.push(v));

    input$.next('a');
    sub.unsubscribe();
    vi.advanceTimersByTime(200);
    expect(emitted).toEqual([]);
  });
});
