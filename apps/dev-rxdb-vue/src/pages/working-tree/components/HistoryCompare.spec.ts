import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { mount, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import HistoryCompare, { type HistoryCompareState } from './HistoryCompare.vue';

/**
 * @fileoverview History 顶部的分支对比（GitHub Desktop 的「Select branch to compare…」，Angular / React 端同名 spec 的移植）。
 */

const comparison = (entries: BranchComparison['entries']): BranchComparison => ({
  fromBranchId: 'main',
  toBranchId: 'feature',
  entries
});

const mounted: VueWrapper[] = [];

afterEach(() => {
  for (const wrapper of mounted.splice(0)) wrapper.unmount();
});

/** 挂一个对比栏；组件交出来的事件从 `wrapper.emitted()` 读。 */
const mountCompare = (compare: HistoryCompareState | null, branches: readonly string[] = ['feature']) => {
  const wrapper = mount(HistoryCompare, { props: { activeBranch: 'main', branches, compare } });
  mounted.push(wrapper);
  return wrapper;
};

const select = (wrapper: VueWrapper) => wrapper.get<HTMLSelectElement>('[data-testid="wt-compare-select"]');

describe('HistoryCompare', () => {
  it('没在对比：只有选分支的下拉，占位写「Select branch to compare…」；选一条就交出它', async () => {
    const wrapper = mountCompare(null, ['feature', 'other']);

    expect(select(wrapper).attributes('aria-label')).toBe('Select branch to compare');
    expect(wrapper.findAll('option').map(option => option.text())).toEqual([
      'Select branch to compare…',
      'feature',
      'other'
    ]);
    expect(wrapper.find('[data-testid="wt-compare-view"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="wt-compare-clear"]').exists()).toBe(false);

    await select(wrapper).setValue('other');
    expect(wrapper.emitted('selectBranch')).toEqual([['other']]);
  });

  it('没有别的分支：下拉写「No branches to compare」并置灰', () => {
    const wrapper = mountCompare(null, []);

    expect(select(wrapper).element.disabled).toBe(true);
    expect(select(wrapper).text()).toBe('No branches to compare');
  });

  it('对比结果：差异逐条列出，字段读作「当前分支的值 → 那条分支的值」；底部可合并进当前分支', async () => {
    const wrapper = mountCompare({
      branchId: 'feature',
      comparison: {
        phase: 'success',
        value: comparison([
          {
            namespace: 'public',
            entity: 'Todo',
            entityId: 't1',
            operation: 'UPDATE',
            patch: { title: 'b' },
            inversePatch: { title: 'a' }
          }
        ])
      }
    });

    expect(select(wrapper).element.value).toBe('feature');
    expect(wrapper.get('[data-testid="wt-compare-summary"]').text()).toBe('1 entity differs between main and feature.');
    expect(wrapper.get('[data-testid="wt-branch-diff-item"]').text()).toContain('"a"');
    expect(wrapper.get('[data-testid="wt-branch-diff-item"]').text()).toContain('"b"');
    expect(wrapper.get('[data-testid="wt-compare-merge"]').text()).toBe('Merge into main');

    await wrapper.get('[data-testid="wt-compare-merge"]').trigger('click');
    expect(wrapper.emitted('mergeRequest')).toEqual([['feature']]);
  });

  it('两侧一样：只有摘要，没有列表；清除交出请求', async () => {
    const wrapper = mountCompare({ branchId: 'feature', comparison: { phase: 'success', value: comparison([]) } });

    expect(wrapper.get('[data-testid="wt-compare-summary"]').text()).toBe('No differences between main and feature.');
    expect(wrapper.find('[data-testid="wt-branch-diff-list"]').exists()).toBe(false);
    await wrapper.get('[data-testid="wt-compare-clear"]').trigger('click');
    expect(wrapper.emitted('clearRequested')).toHaveLength(1);
  });

  it('读取中与读失败', async () => {
    const wrapper = mountCompare({ branchId: 'feature', comparison: { phase: 'loading' } });
    expect(wrapper.get('[data-testid="wt-compare-loading"]').text()).toBe('Comparing…');

    await wrapper.setProps({
      compare: { branchId: 'feature', comparison: { phase: 'error', message: "Branch 'feature' not found" } }
    });
    expect(wrapper.get('[data-testid="wt-compare-error"]').text()).toContain("Branch 'feature' not found");
  });
});
