/**
 * @fileoverview pullable 计数结算规则的真值表（RXD-034）
 *
 * 旧实现里 `VersionManager.pull()` 无条件 `resetPullableCount()`：
 * 只拉了一部分仓库（`repositoryFilter`）、或者还有下一页（`hasMore`）、
 * 或者有仓库失败（`failures`）时，全局计数照样归零 —— 界面上「远端有 N 条待拉」
 * 直接变 0，而那些变更根本没拉下来。`sync()` 走的又是另一条路，压根不归零。
 *
 * 这里把「什么才算一次完整同步」和「不完整时该怎么结算」钉成纯函数，
 * 让两条调用路径共用同一份口径。
 */

import { describe, expect, it } from 'vitest';
import { isCompletePull, settledPullableCount } from '../../version/pullable-count.js';
import type { PullOptions, PullResult } from '../../version/VersionManager.interface.js';

const pullResult = (overrides: Partial<PullResult> = {}): PullResult =>
  ({
    pulled: 3,
    compacted: 0,
    applied: 3,
    hasMore: false,
    conflictsResolved: 0,
    conflictsDeferred: 0,
    persistedProgress: true,
    historyInvalidated: true,
    failures: [],
    ...overrides
  }) as PullResult;

const failure: PullResult['failures'][number] = {
  repository: { namespace: 'public', entity: 'User' },
  error: new Error('boom')
};

describe('isCompletePull（RXD-034）', () => {
  it('没有过滤、没有下一页、没有失败 —— 才算完整同步', () => {
    expect(isCompletePull(undefined, pullResult())).toBe(true);
    expect(isCompletePull({ limit: 100, fetchAll: true }, pullResult())).toBe(true);
  });

  it('repositoryFilter 只覆盖了部分仓库，不算完整', () => {
    const options: PullOptions = { repositoryFilter: ['public:User'] };
    expect(isCompletePull(options, pullResult())).toBe(false);
  });

  it('空的 repositoryFilter 等于没过滤', () => {
    // 「传了字段但是空数组」在语义上就是不过滤，按不完整处理会让正常 pull 永远清不掉计数
    expect(isCompletePull({ repositoryFilter: [] }, pullResult())).toBe(true);
  });

  it('还有下一页时不算完整', () => {
    expect(isCompletePull(undefined, pullResult({ hasMore: true }))).toBe(false);
  });

  it('有仓库失败时不算完整', () => {
    expect(isCompletePull(undefined, pullResult({ failures: [failure] }))).toBe(false);
  });
});

describe('settledPullableCount（RXD-034）', () => {
  it('完整同步且期间没有新事件 —— 归零', () => {
    expect(settledPullableCount(9, { complete: true, concurrent: false, pulled: 3 })).toBe(0);
  });

  it('不完整同步只扣掉实际拉到的数量', () => {
    expect(settledPullableCount(9, { complete: false, concurrent: false, pulled: 3 })).toBe(6);
  });

  it('完整同步但期间来了新的远端事件 —— 只扣不清', () => {
    // 那些事件是在快照之后到的，本次 pull 没覆盖它们；归零等于把它们吞掉
    expect(settledPullableCount(9, { complete: true, concurrent: true, pulled: 3 })).toBe(6);
  });

  it('扣减不会跌破 0', () => {
    expect(settledPullableCount(2, { complete: false, concurrent: false, pulled: 5 })).toBe(0);
  });

  it('一条都没拉到时保持原值', () => {
    expect(settledPullableCount(4, { complete: false, concurrent: true, pulled: 0 })).toBe(4);
  });
});
