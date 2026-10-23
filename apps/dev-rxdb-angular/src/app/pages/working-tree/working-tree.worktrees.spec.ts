import { WorktreeBranchHeldError, WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { currentBranchOf, heldElsewhere } from './working-tree.worktrees';

/**
 * @fileoverview 工作树页的检出位口径（US-314 C2，React / Vue 端同名 spec 的移植）。
 */

/** 分支行只取口径用得到的两列；`activated` 照真实数据只在主检出位持有时为真 */
const branch = (id: string, activeKey: string | null): RxDBBranch =>
  ({ id, activeKey, activated: activeKey === WorktreeTableSet.MAIN.holderKey }) as unknown as RxDBBranch;

const shadow = WorktreeTableSet.of('wt_x', []);

describe('工作树页的检出位口径（US-314 C2）', () => {
  it('当前分支是持有键等于挂着那套表的持有键的那一条；挂在检出位上时不看 activated', () => {
    const branches = [
      branch('main', WorktreeTableSet.MAIN.holderKey),
      branch('feature', shadow.holderKey),
      branch('idle', null)
    ];

    expect(currentBranchOf(branches, WorktreeTableSet.MAIN)).toBe('main');
    expect(currentBranchOf(branches, shadow)).toBe('feature');
    expect(currentBranchOf([branch('idle', null)], shadow)).toBe('');
  });

  it('被别处持有：主检出位与别的可写检出位持有的都算，交回持有键；没人持有、本套持有的不算', () => {
    expect(heldElsewhere(branch('main', WorktreeTableSet.MAIN.holderKey), shadow)?.holderKey).toBe(
      WorktreeTableSet.MAIN.holderKey
    );
    expect(heldElsewhere(branch('other', '*worktree:wt_y*'), shadow)).toBeInstanceOf(WorktreeBranchHeldError);
    expect(heldElsewhere(branch('other', '*worktree:wt_y*'), shadow)?.holderKey).toBe('*worktree:wt_y*');
    expect(heldElsewhere(branch('feature', shadow.holderKey), shadow)).toBeNull();
    expect(heldElsewhere(branch('idle', null), shadow)).toBeNull();
    expect(heldElsewhere(branch('main', WorktreeTableSet.MAIN.holderKey), WorktreeTableSet.MAIN)).toBeNull();
  });
});
