/**
 * 撤销 / 重做按钮停用时的说明（US-315）：三端实体列表共用这一份文案。
 */
import { describe, expect, it } from 'vitest';
import { describeHistoryBarrier } from '../../entity-list/history-barrier.js';

describe('describeHistoryBarrier', () => {
  it('撤销栈被子分支分叉点拦住：说明更早的改动被哪些分支继承了', () => {
    expect(describeHistoryBarrier('undo', { reason: 'inherited_by_branch', branchIds: ['feature'] })).toBe(
      '更早的改动已被分支 feature 继承，撤销不了'
    );
  });

  it('重做栈同理，多条分支依次列出', () => {
    expect(describeHistoryBarrier('redo', { reason: 'inherited_by_branch', branchIds: ['a', 'b'] })).toBe(
      '要重做的改动已被分支 a、b 继承，重做不了'
    );
  });

  it('不是被子分支拦住的：没有说明', () => {
    expect(describeHistoryBarrier('undo', null)).toBeNull();
  });
});
