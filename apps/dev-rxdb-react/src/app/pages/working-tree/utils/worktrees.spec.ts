import { WorktreeBranchHeldError, WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { currentBranchOf, heldElsewhere, WorktreeCreation } from './worktrees';

/**
 * @fileoverview 工作树页的检出位口径（US-314 C2，Angular / Vue 端同名 spec 的移植）。
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

describe('新检出位的可重试创建', () => {
  it('未指定分支时按名称创建分支，换挂失败后重试沿用已创建检出位', async () => {
    const attempt = new WorktreeCreation();
    const commands = {
      createBranch: vi.fn(async () => undefined),
      add: vi.fn(async () => ({ id: 'new-tree' })),
      mount: vi.fn(async () => undefined)
    };
    commands.mount.mockRejectedValueOnce(new Error('mount failed'));
    const request = { name: 'new-topic', branchId: '' };
    await expect(attempt.run(request, commands)).rejects.toThrow('mount failed');
    await attempt.run(request, commands);
    expect(commands.createBranch).toHaveBeenCalledExactlyOnceWith('new-topic');
    expect(commands.add).toHaveBeenCalledExactlyOnceWith('new-topic', { name: 'new-topic' });
    expect(commands.mount).toHaveBeenCalledTimes(2);
  });

  it('显式分支不创建分支，创建检出位失败后重试不重复创建新分支', async () => {
    const commands = {
      createBranch: vi.fn(async () => undefined),
      add: vi.fn(async () => ({ id: 'new-tree' })),
      mount: vi.fn(async () => undefined)
    };
    const attempt = new WorktreeCreation();
    await attempt.run({ name: 'Work', branchId: 'feature' }, commands);
    expect(commands.createBranch).not.toHaveBeenCalled();
    expect(commands.add).toHaveBeenCalledExactlyOnceWith('feature', { name: 'Work' });
  });
});
