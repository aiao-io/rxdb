import type { PullResult, PushResult } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { describePullOutcome, describePushOutcome } from './sync-outcome';

const pushResult = (overrides: Partial<PushResult>): PushResult => ({
  pushed: 3,
  rejected: 0,
  failed: 0,
  compacted: 0,
  originalCount: 3,
  failures: [],
  ...overrides
});

const pullResult = (overrides: Partial<PullResult>): PullResult => ({
  pulled: 4,
  compacted: 0,
  applied: 4,
  hasMore: false,
  conflictsResolved: 0,
  conflictsDeferred: 0,
  failures: [],
  persistedProgress: true,
  historyInvalidated: true,
  ...overrides
});

describe('describePushOutcome / describePullOutcome', () => {
  it('推送报出推上去与被拒的条数；推上去了就说明推送前的修改不能再撤销', () => {
    expect(describePushOutcome(pushResult({}))).toEqual({
      notice: '推送完成：推上去 3 条。推送前的修改不能再撤销',
      error: null
    });
    expect(describePushOutcome(pushResult({ pushed: 2, rejected: 1 }))).toEqual({
      notice: '推送完成：推上去 2 条，被拒 1 条（见同步中心）。推送前的修改不能再撤销',
      error: null
    });
  });

  it('一条都没推上去时不提撤销', () => {
    expect(describePushOutcome(pushResult({ pushed: 0, rejected: 1 }))).toEqual({
      notice: '推送完成：推上去 0 条，被拒 1 条（见同步中心）',
      error: null
    });
  });

  it('拉取报出拉到与落库的条数', () => {
    expect(describePullOutcome(pullResult({ pulled: 4, applied: 3 }))).toEqual({
      notice: '拉取完成：拉到 4 条，落库 3 条',
      error: null
    });
  });

  it('有仓库失败时按实体报出原因，不报完成', () => {
    const failures = [{ repository: { namespace: 'public', entity: 'DemoOrder' }, error: new Error('网络断了') }];
    expect(describePushOutcome(pushResult({ failures }))).toEqual({
      notice: null,
      error: '推送没有全部完成：DemoOrder：网络断了'
    });
    expect(describePullOutcome(pullResult({ failures }))).toEqual({
      notice: null,
      error: '拉取没有全部完成：DemoOrder：网络断了'
    });
  });
});
