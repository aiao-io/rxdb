import type { BranchComparison } from '@aiao/rxdb-plugin-history';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkingTreeHistoryCompareComponent, type HistoryCompareState } from './history-compare.component';

/**
 * @fileoverview History 顶部的分支对比（GitHub Desktop 的「Select branch to compare…」，React / Vue 端同名 spec 的移植）。
 */

const comparison = (entries: BranchComparison['entries']): BranchComparison => ({
  fromBranchId: 'main',
  toBranchId: 'feature',
  entries
});

const find = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

const get = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement => {
  const element = find(fixture, selector);
  if (element === null) throw new Error(`找不到 ${selector}`);
  return element;
};

/** 模板里的换行缩进折成单个空格，与读屏、Playwright 的 toHaveText 同口径。 */
const textOf = (element: Element): string => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** 搭一个对比栏；组件交出来的事件记在 `events` 里。 */
const createCompare = async (compare: HistoryCompareState | null, branches: readonly string[] = ['feature']) => {
  const fixture = TestBed.createComponent(WorkingTreeHistoryCompareComponent);
  const events = { selected: [] as string[], cleared: 0, merged: [] as string[] };
  fixture.componentInstance.selectBranch.subscribe(id => events.selected.push(id));
  fixture.componentInstance.clearRequested.subscribe(() => events.cleared++);
  fixture.componentInstance.mergeRequest.subscribe(id => events.merged.push(id));
  fixture.componentRef.setInput('activeBranch', 'main');
  fixture.componentRef.setInput('branches', branches);
  fixture.componentRef.setInput('compare', compare);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, events };
};

const select = (fixture: ComponentFixture<unknown>): HTMLSelectElement =>
  get(fixture, '[data-testid="wt-compare-select"]') as HTMLSelectElement;

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [WorkingTreeHistoryCompareComponent] }).compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('WorkingTreeHistoryCompareComponent', () => {
  it('没在对比：只有选分支的下拉，占位写「Select branch to compare…」；选一条就交出它', async () => {
    const { fixture, events } = await createCompare(null, ['feature', 'other']);

    expect(select(fixture).getAttribute('aria-label')).toBe('Select branch to compare');
    expect([...select(fixture).options].map(option => option.textContent?.trim())).toEqual([
      'Select branch to compare…',
      'feature',
      'other'
    ]);
    expect(find(fixture, '[data-testid="wt-compare-view"]')).toBeNull();
    expect(find(fixture, '[data-testid="wt-compare-clear"]')).toBeNull();

    select(fixture).value = 'other';
    select(fixture).dispatchEvent(new Event('change'));
    expect(events.selected).toEqual(['other']);
  });

  it('没有别的分支：下拉写「No branches to compare」并置灰', async () => {
    const { fixture } = await createCompare(null, []);

    expect(select(fixture).disabled).toBe(true);
    expect(textOf(select(fixture))).toBe('No branches to compare');
  });

  it('对比结果：差异逐条列出，字段读作「当前分支的值 → 那条分支的值」；底部可合并进当前分支', async () => {
    const { fixture, events } = await createCompare({
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

    expect(select(fixture).value).toBe('feature');
    expect(textOf(get(fixture, '[data-testid="wt-compare-summary"]'))).toBe(
      '1 entity differs between main and feature.'
    );
    expect(textOf(get(fixture, '[data-testid="wt-branch-diff-item"]'))).toContain('"a"');
    expect(textOf(get(fixture, '[data-testid="wt-branch-diff-item"]'))).toContain('"b"');
    expect(textOf(get(fixture, '[data-testid="wt-compare-merge"]'))).toBe('Merge into main');

    get(fixture, '[data-testid="wt-compare-merge"]').click();
    expect(events.merged).toEqual(['feature']);
  });

  it('两侧一样：只有摘要，没有列表；清除交出请求', async () => {
    const { fixture, events } = await createCompare({
      branchId: 'feature',
      comparison: { phase: 'success', value: comparison([]) }
    });

    expect(textOf(get(fixture, '[data-testid="wt-compare-summary"]'))).toBe('No differences between main and feature.');
    expect(find(fixture, '[data-testid="wt-branch-diff-list"]')).toBeNull();
    get(fixture, '[data-testid="wt-compare-clear"]').click();
    expect(events.cleared).toBe(1);
  });

  it('读取中与读失败', async () => {
    const { fixture } = await createCompare({ branchId: 'feature', comparison: { phase: 'loading' } });
    expect(textOf(get(fixture, '[data-testid="wt-compare-loading"]'))).toBe('Comparing…');

    fixture.componentRef.setInput('compare', {
      branchId: 'feature',
      comparison: { phase: 'error', message: "Branch 'feature' not found" }
    });
    fixture.detectChanges();
    expect(textOf(get(fixture, '[data-testid="wt-compare-error"]'))).toContain("Branch 'feature' not found");
  });
});
