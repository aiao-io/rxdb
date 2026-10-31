import { of, Subject } from 'rxjs';
import { describe, expect, it } from 'vitest';

import { readFirst, sameIdSet } from '../query.js';

describe('readFirst', () => {
  it('Promise 与 Observable 都返回首个快照的独立数组', async () => {
    const rows = [1, 2];
    for (const query of [Promise.resolve(rows), of(rows)]) {
      const snapshot = await readFirst(query);
      expect(snapshot).toEqual(rows);
      expect(snapshot).not.toBe(rows);
    }
  });

  it('取首个快照后取消订阅，并透传查询失败', async () => {
    const source = new Subject<readonly number[]>();
    const result = readFirst(source);
    source.next([1]);
    source.next([2]);
    await expect(result).resolves.toEqual([1]);
    expect(source.observed).toBe(false);
    await expect(readFirst(Promise.reject(new Error('查询失败')))).rejects.toThrow('查询失败');
  });
});

describe('sameIdSet', () => {
  it('按集合比较：顺序与重复都不计，缺项或多项即不等', () => {
    expect(sameIdSet(['a', 'b'], ['b', 'a'])).toBe(true);
    expect(sameIdSet(['a', 'a'], ['a', 'a'])).toBe(true);
    expect(sameIdSet(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(true);
    expect(sameIdSet([], [])).toBe(true);
    expect(sameIdSet(['a', 'b'], ['a', 'a'])).toBe(false);
    expect(sameIdSet(['a'], ['a', 'b'])).toBe(false);
  });
});
