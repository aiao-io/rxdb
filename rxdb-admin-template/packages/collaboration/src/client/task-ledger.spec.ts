import { describe, expect, it } from 'vitest';
import { receiptRetentionMs } from '../model.js';
import { autoRetryWindowMs, contextKey, retryWindowPassed, TaskLedger, type TaskEntry } from './task-ledger.js';
import { memoryStorage } from './team.testing.js';

const context = (taskId: string, userId = 'alice', teamId = 'team') => ({ userId, teamId, appId: 'app', taskId });
const entry = (taskId: string, userId = 'alice', teamId = 'team'): TaskEntry => ({
  context: context(taskId, userId, teamId),
  name: `Task ${taskId}`,
  base: 'root',
  branchId: `task/${taskId}/1`,
  remoteHead: 'root',
  uploads: [],
  locked: false,
  verifiedAt: 1
});

describe('本机任务账本：只记同步与解锁需要的元数据，记录本身在团队库里', () => {
  it('按用户 × 团队 × 应用 × 任务存取，键里带全部四项，跨用户的条目互不可见', () => {
    const storage = memoryStorage();
    const ledger = new TaskLedger(storage);
    ledger.write(context('a'), () => entry('a'));
    ledger.write(context('b', 'alice', 'other'), () => entry('b', 'alice', 'other'));
    ledger.write(context('c', 'bob'), () => entry('c', 'bob'));
    expect(ledger.read(context('a'))?.name).toBe('Task a');
    expect(ledger.read(context('a', 'alice', 'other'))).toBeUndefined();
    expect(ledger.list('alice').map(item => item.context.taskId)).toEqual(['a', 'b']);
    expect(ledger.list('bob').map(item => item.context.taskId)).toEqual(['c']);
    expect(contextKey(context('a'))).toBe(JSON.stringify(['alice', 'team', 'app', 'a']));
    // 每个用户一个存储键，键里带用户；内容只有元数据，没有任何记录取值
    expect([...storage.keys()].sort()).toEqual([
      'admin-collaboration-tasks-v1:alice',
      'admin-collaboration-tasks-v1:bob'
    ]);
  });

  it('改写时交给回调当前条目（没有时为 undefined），回调交回的上下文必须与键一致，返回的是副本', () => {
    const ledger = new TaskLedger(memoryStorage());
    const created = ledger.write(context('a'), current => {
      expect(current).toBeUndefined();
      return entry('a');
    });
    created.name = '外部改动不回写';
    const renamed = ledger.write(context('a'), current => ({ ...current!, name: '改名' }));
    expect(renamed.name).toBe('改名');
    expect(ledger.read(context('a'))?.name).toBe('改名');
    expect(() => ledger.write(context('a'), () => entry('other'))).toThrow('本地上下文不匹配');
    expect(ledger.read(context('a'))?.name).toBe('改名');
  });

  it('跨实例持久：同一份存储上新建的账本读得到之前写下的条目（刷新页面、另开标签页）', () => {
    const storage = memoryStorage();
    new TaskLedger(storage).write(context('a'), () => entry('a'));
    expect(new TaskLedger(storage).read(context('a'))).toEqual(entry('a'));
  });

  it('锁定只锁当前用户的全部条目，不删除；其他用户的条目不受影响', () => {
    const ledger = new TaskLedger(memoryStorage());
    ledger.write(context('a'), () => entry('a'));
    ledger.write(context('b'), () => entry('b'));
    ledger.write(context('c', 'bob'), () => entry('c', 'bob'));
    ledger.lock('alice');
    expect(ledger.list('alice').map(item => item.locked)).toEqual([true, true]);
    expect(ledger.list('bob').map(item => item.locked)).toEqual([false]);
  });
});

describe('自动重试期限：比服务端回执保留期早一天', () => {
  it('期限内可以自动重试，到期或没有有效时间时不再自动重试', () => {
    expect(autoRetryWindowMs).toBe(receiptRetentionMs - 86_400_000);
    const now = 1_000_000_000_000;
    expect(retryWindowPassed(now - autoRetryWindowMs + 1, now)).toBe(false);
    expect(retryWindowPassed(now - autoRetryWindowMs, now)).toBe(true);
    expect(retryWindowPassed(undefined, now)).toBe(true);
    expect(retryWindowPassed(Number.NaN, now)).toBe(true);
  });
});
