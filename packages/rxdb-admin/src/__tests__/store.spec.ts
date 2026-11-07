import { describe, expect, it, vi } from 'vitest';
import { Store, derive } from '../store.js';

describe('Store', () => {
  it('同步快照随 set 更新，subscribe 只通知后续变更', () => {
    const store = new Store(1);
    const listener = vi.fn();
    store.subscribe(listener);
    expect(listener).not.toHaveBeenCalled();
    store.set(2);
    expect(store.value).toBe(2);
    expect(listener).toHaveBeenCalledExactlyOnceWith(2);
  });

  it('同引用的 set 不触发通知', () => {
    const state = { a: 1 };
    const store = new Store(state);
    const listener = vi.fn();
    store.subscribe(listener);
    store.set(state);
    expect(listener).not.toHaveBeenCalled();
  });

  it('update 以当前值计算下一个值', () => {
    const store = new Store(1);
    store.update(value => value + 1);
    expect(store.value).toBe(2);
  });

  it('退订后不再通知', () => {
    const store = new Store(0);
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    unsubscribe();
    store.set(1);
    expect(listener).not.toHaveBeenCalled();
  });

  it('changes$ 回放当前值并推送后续变更', () => {
    const store = new Store('a');
    const seen: string[] = [];
    const subscription = store.changes$.subscribe(value => seen.push(value));
    store.set('b');
    store.set('b');
    subscription.unsubscribe();
    expect(seen).toEqual(['a', 'b']);
  });
});

describe('derive', () => {
  it('由多个源计算，输入引用不变时返回同一引用（useSyncExternalStore 要求快照稳定）', () => {
    const a = new Store(1);
    const b = new Store(2);
    const project = vi.fn((x: number, y: number) => ({ sum: x + y }));
    const sum = derive([a, b], project);
    const first = sum.value;
    expect(sum.value).toBe(first);
    expect(project).toHaveBeenCalledTimes(1);
    a.set(3);
    expect(sum.value).toEqual({ sum: 5 });
    expect(sum.value).not.toBe(first);
  });

  it('任一源变更都会通知订阅者', () => {
    const a = new Store(1);
    const b = new Store(2);
    const sum = derive([a, b], (x, y) => x + y);
    const listener = vi.fn();
    sum.subscribe(listener);
    a.set(10);
    b.set(20);
    expect(listener.mock.calls.map(([value]) => value)).toEqual([12, 30]);
  });

  it('投影结果相同则不通知', () => {
    const a = new Store(1);
    const parity = derive([a], x => x % 2);
    const listener = vi.fn();
    parity.subscribe(listener);
    a.set(3);
    expect(listener).not.toHaveBeenCalled();
  });

  it('changes$ 回放当前投影值', () => {
    const a = new Store(2);
    const double = derive([a], x => x * 2);
    const seen: number[] = [];
    const subscription = double.changes$.subscribe(value => seen.push(value));
    a.set(3);
    subscription.unsubscribe();
    expect(seen).toEqual([4, 6]);
  });
});
