import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { WorkingTreeHistoryCompare, type HistoryCompareState } from './HistoryCompare';

/**
 * @fileoverview History 顶部的分支对比（GitHub Desktop 的「Select branch to compare…」，Angular / Vue 端同名 spec 的移植）。
 */

const comparison = (entries: BranchComparison['entries']): BranchComparison => ({
  fromBranchId: 'main',
  toBranchId: 'feature',
  entries
});

/** 搭一个对比栏；组件交出来的事件记在返回的 mock 上，`setCompare` 换一份对比状态重渲染。 */
const renderCompare = (compare: HistoryCompareState | null, branches: readonly string[] = ['feature']) => {
  const handlers = { onClearRequested: vi.fn(), onMergeRequest: vi.fn(), onSelectBranch: vi.fn() };
  const view = (next: HistoryCompareState | null) => (
    <WorkingTreeHistoryCompare activeBranch='main' branches={branches} compare={next} {...handlers} />
  );
  const { rerender } = render(view(compare));
  return { ...handlers, setCompare: (next: HistoryCompareState | null) => rerender(view(next)) };
};

const select = (): HTMLSelectElement => screen.getByTestId<HTMLSelectElement>('wt-compare-select');

describe('WorkingTreeHistoryCompare', () => {
  it('没在对比：只有选分支的下拉，占位写「Select branch to compare…」；选一条就交出它', () => {
    const { onSelectBranch } = renderCompare(null, ['feature', 'other']);

    expect(select().getAttribute('aria-label')).toBe('Select branch to compare');
    expect(Array.from(select().options, option => option.textContent)).toEqual([
      'Select branch to compare…',
      'feature',
      'other'
    ]);
    expect(screen.queryByTestId('wt-compare-view')).toBeNull();
    expect(screen.queryByTestId('wt-compare-clear')).toBeNull();

    fireEvent.change(select(), { target: { value: 'other' } });
    expect(onSelectBranch.mock.calls).toEqual([['other']]);
  });

  it('没有别的分支：下拉写「No branches to compare」并置灰', () => {
    renderCompare(null, []);

    expect(select().disabled).toBe(true);
    expect(select().textContent).toBe('No branches to compare');
  });

  it('对比结果：差异逐条列出，字段读作「当前分支的值 → 那条分支的值」；底部可合并进当前分支', () => {
    const { onMergeRequest } = renderCompare({
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

    expect(select().value).toBe('feature');
    expect(screen.getByTestId('wt-compare-summary').textContent).toBe('1 entity differs between main and feature.');
    expect(screen.getByTestId('wt-branch-diff-item').textContent).toContain('"a"');
    expect(screen.getByTestId('wt-branch-diff-item').textContent).toContain('"b"');
    expect(screen.getByTestId('wt-compare-merge').textContent).toBe('Merge into main');

    fireEvent.click(screen.getByTestId('wt-compare-merge'));
    expect(onMergeRequest.mock.calls).toEqual([['feature']]);
  });

  it('两侧一样：只有摘要，没有列表；清除交出请求', () => {
    const { onClearRequested } = renderCompare({
      branchId: 'feature',
      comparison: { phase: 'success', value: comparison([]) }
    });

    expect(screen.getByTestId('wt-compare-summary').textContent).toBe('No differences between main and feature.');
    expect(screen.queryByTestId('wt-branch-diff-list')).toBeNull();
    fireEvent.click(screen.getByTestId('wt-compare-clear'));
    expect(onClearRequested).toHaveBeenCalledOnce();
  });

  it('读取中与读失败', () => {
    const { setCompare } = renderCompare({ branchId: 'feature', comparison: { phase: 'loading' } });
    expect(screen.getByTestId('wt-compare-loading').textContent).toBe('Comparing…');

    setCompare({ branchId: 'feature', comparison: { phase: 'error', message: "Branch 'feature' not found" } });
    expect(screen.getByTestId('wt-compare-error').textContent).toContain("Branch 'feature' not found");
  });
});
