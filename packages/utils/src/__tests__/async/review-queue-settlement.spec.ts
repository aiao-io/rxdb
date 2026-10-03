import { describe, expect, it } from 'vitest';
import { AsyncQueueExecutor } from '../../async/AsyncQueueExecutor.js';

describe('实际代码评审：队列结算后的 ID 复用', () => {
  it('await 成功返回后同 ID 应执行新任务，而不是复用旧结果', async () => {
    const queue = new AsyncQueueExecutor(1);
    let calls = 0;
    const first = await queue.addTask(() => ++calls, 'same');
    const second = await queue.addTask(() => ++calls, 'same');
    await queue.waitForAll();
    expect({ first, second, calls }).toEqual({ first: 1, second: 2, calls: 2 });
  });
  it('尚未结算的同 ID 并发调用仍应去重', async () => {
    const queue = new AsyncQueueExecutor(1);
    let calls = 0;
    const first = queue.addTask(() => ++calls, 'same');
    const second = queue.addTask(() => ++calls, 'same');
    expect(first).toBe(second);
    await Promise.all([first, second]);
    await queue.waitForAll();
    expect(calls).toBe(1);
  });
  it('失败后的重试对照路径可正常执行', async () => {
    const queue = new AsyncQueueExecutor(1);
    let calls = 0;
    try {
      await queue.addTask(() => {
        calls++;
        throw new Error('expected');
      }, 'same');
    } catch {
      /* 预期失败 */
    }
    const value = await queue.addTask(() => ++calls, 'same');
    await queue.waitForAll();
    expect(value).toBe(2);
  });
});
