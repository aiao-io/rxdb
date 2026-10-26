import { WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import BranchMenu from './BranchMenu.vue';

/**
 * @fileoverview 分支下拉认当前分支（US-314 C2.1，Angular / React 端同名 spec 的移植）：挂在可写检出位上时，当前分支是那套表持有的分支，
 * 它的 `activated` 是假；主检出位停着的那条 `activated` 为真，却不是这里的当前分支。
 */

const shadow = WorktreeTableSet.of('wt_x', []);

const branch = (id: string, activeKey: string | null): RxDBBranch =>
  ({
    id,
    activeKey,
    activated: activeKey === WorktreeTableSet.MAIN.holderKey,
    createdAt: new Date(0),
    updatedAt: new Date(0)
  }) as unknown as RxDBBranch;

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

/** 搭一个展开着的分支下拉：挂在检出位上，当前分支是 feature（`activated` 为假）。 */
const mountMenu = () => {
  const wrapper = mount(BranchMenu, {
    props: {
      activeBranch: 'feature',
      branches: [branch('main', WorktreeTableSet.MAIN.holderKey), branch('feature', shadow.holderKey)],
      menuOpen: true,
      popupWidth: 320
    }
  });
  mounted.push(wrapper);
  const rowOf = (id: string) => wrapper.get(`[data-testid="wt-branch-item"][data-branch-id="${id}"]`);
  return { wrapper, rowOf };
};

describe('BranchMenu：当前分支（US-314 C2.1）', () => {
  it('挂在检出位上：持有分支那一行带 aria-current，主检出位停着的那一行不带', () => {
    const { rowOf } = mountMenu();

    expect(rowOf('feature').attributes('aria-current')).toBe('true');
    expect(rowOf('main').attributes('aria-current')).toBeUndefined();
  });

  it('点当前分支那一行只收起，不切换；点主检出位停着的那一行照常切换', async () => {
    const { wrapper, rowOf } = mountMenu();

    await rowOf('feature').trigger('click');
    expect(wrapper.emitted('switchBranch')).toBeUndefined();
    expect(wrapper.emitted('update:menuOpen')).toEqual([[false]]);

    await wrapper.get('[data-testid="wt-branch-menu"]').trigger('click');
    await rowOf('main').trigger('click');
    expect(wrapper.emitted('switchBranch')).toEqual([['main']]);
  });
});
