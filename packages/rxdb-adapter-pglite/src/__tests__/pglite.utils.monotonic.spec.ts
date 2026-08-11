import type { EntityType } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { getMonotonicUpdatedAt, getSwitchUpdatedAt } from '../pglite.utils.js';

const makeEntity = (updatedAt?: unknown) => ({ updatedAt }) as unknown as InstanceType<EntityType>;

describe('getMonotonicUpdatedAt', () => {
  it('无 updatedAt 时返回当前时间', () => {
    const before = Date.now();
    const result = getMonotonicUpdatedAt(makeEntity());
    const after = Date.now();
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(after);
  });

  it('candidate 晚于 current 时返回 candidate', () => {
    const current = new Date(1000);
    const preferred = new Date(2000);
    const result = getMonotonicUpdatedAt(makeEntity(current), preferred);
    expect(result.getTime()).toBe(2000);
  });

  it('candidate 等于 current 时返回 current + 1ms', () => {
    const current = new Date(5000);
    const result = getMonotonicUpdatedAt(makeEntity(current), new Date(5000));
    expect(result.getTime()).toBe(5001);
  });

  it('candidate 早于 current 时返回 current + 1ms', () => {
    const current = new Date(9000);
    const result = getMonotonicUpdatedAt(makeEntity(current), new Date(3000));
    expect(result.getTime()).toBe(9001);
  });

  it('updatedAt 为无效值时回退到 candidate', () => {
    const preferred = new Date(12345);
    const result = getMonotonicUpdatedAt(makeEntity('not-a-date'), preferred);
    expect(result.getTime()).toBe(12345);
  });

  it('updatedAt 支持字符串形式', () => {
    const result = getMonotonicUpdatedAt(makeEntity('1970-01-01T00:00:01.000Z'), new Date(500));
    expect(result.getTime()).toBe(1001);
  });
});

// 水位是进程内单调的，一旦被「领先墙上时钟」的用例推到未来就再也回不来，
// 因此「返回当前时间」这条必须留在最前面。
describe('getSwitchUpdatedAt（P1-011）', () => {
  it('历史候选都比现在旧时返回当前时间', () => {
    const before = Date.now();
    const result = getSwitchUpdatedAt(['2000-01-01T00:00:00.000Z', new Date(1000)]);
    expect(result.getTime()).toBeGreaterThanOrEqual(before);
    expect(result.getTime()).toBeLessThanOrEqual(Date.now());
  });

  it('历史候选领先墙上时钟时越过其中最大的一个', () => {
    const ahead = Date.parse('2999-01-01T00:00:00.000Z');
    const result = getSwitchUpdatedAt([new Date(ahead - 1000), ahead]);
    expect(result.getTime()).toBe(ahead + 1);
  });

  it('非法 / 缺失的候选被忽略而不是产生 NaN', () => {
    const result = getSwitchUpdatedAt([undefined, null, true, 'not-a-date', new Date('invalid')]);
    expect(Number.isNaN(result.getTime())).toBe(false);
  });

  it('连续两次切换即便落在同一毫秒也严格递增（redo 紧跟 undo）', () => {
    const ahead = Date.parse('2999-01-01T00:00:00.000Z');
    const undo = getSwitchUpdatedAt([ahead]);
    // redo 只知道历史里的旧值，不知道 undo 刚写下的值——靠进程内水位兜住
    const redo = getSwitchUpdatedAt([ahead]);
    expect(redo.getTime()).toBeGreaterThan(undo.getTime());
  });
});
