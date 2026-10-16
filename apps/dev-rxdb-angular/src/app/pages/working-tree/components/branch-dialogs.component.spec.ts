import type { BranchComparison, MergePreview } from '@aiao/rxdb-plugin-history';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BranchDiffLoad } from '../working-tree.branch-diff';
import { WorkingTreeCompareDialogComponent, type CompareDialogState } from './compare-dialog.component';
import { WorkingTreeMergeDialogComponent, type MergeDialogState } from './merge-dialog.component';

/**
 * @fileoverview 合并预览与对比对话框的展示契约（React / Vue 端同名 spec 的移植）。
 *
 * @remarks
 * 预览只是参考：读失败只显示错误，合并照常能点。两个对话框共用一个外壳：背板与面板是兄弟节点，
 * 打开时焦点进面板，面板里按 Escape 关闭，Tab 在面板里首尾回绕，关闭后焦点还给打开前持有它的元素。
 */

const dialog: MergeDialogState = { sourceBranchId: 'feature', strategy: 'squash', deleteSource: false };

const preview: MergePreview = {
  sourceBranchId: 'feature',
  targetBranchId: 'main',
  strategy: 'squash',
  merged: 1,
  entries: [
    {
      namespace: 'public',
      entity: 'Todo',
      entityId: 't1',
      operation: 'UPDATE',
      patch: { title: 'from-feature' },
      inversePatch: { title: 'from-main' },
      conflict: { kind: 'overwrite', fields: ['title'] }
    }
  ]
};

const find = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement | null =>
  (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);

const get = (fixture: ComponentFixture<unknown>, selector: string): HTMLElement => {
  const element = find(fixture, selector);
  if (element === null) throw new Error(`找不到 ${selector}`);
  return element;
};

/** 模板里的换行缩进折成单个空格，与读屏、Playwright 的 toHaveText 同口径。 */
const textOf = (element: Element): string => element.textContent?.replace(/\s+/g, ' ').trim() ?? '';

/** 对话框的可读名：`aria-labelledby` 指向的标题文本。 */
const accessibleName = (fixture: ComponentFixture<unknown>): string => {
  const id = get(fixture, '[role="dialog"]').getAttribute('aria-labelledby') ?? '';
  const title = document.getElementById(id);
  return title === null ? '' : textOf(title);
};

const pressEscape = (element: HTMLElement): void => {
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
};

/** 焦点放到 `element` 上按一下 Tab（`shiftKey` 为 Shift+Tab）。 */
const pressTab = (element: HTMLElement, shiftKey = false): void => {
  element.focus();
  element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true }));
};

const createMergeDialog = async (load: BranchDiffLoad<MergePreview> = { phase: 'success', value: preview }) => {
  const fixture = TestBed.createComponent(WorkingTreeMergeDialogComponent);
  fixture.componentRef.setInput('dialog', dialog);
  fixture.componentRef.setInput('activeBranch', 'main');
  fixture.componentRef.setInput('preview', load);
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
};

const createCompareDialog = async (comparison: CompareDialogState['comparison']) => {
  const fixture = TestBed.createComponent(WorkingTreeCompareDialogComponent);
  fixture.componentRef.setInput('dialog', { branchId: 'feature', comparison });
  fixture.componentRef.setInput('activeBranch', 'main');
  fixture.detectChanges();
  await fixture.whenStable();
  return fixture;
};

beforeEach(async () => {
  await TestBed.configureTestingModule({
    imports: [WorkingTreeMergeDialogComponent, WorkingTreeCompareDialogComponent]
  }).compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('WorkingTreeMergeDialogComponent 的预览', () => {
  it('成功：摘要、条目与覆盖说明；对话框以标题命名，焦点进面板', async () => {
    const fixture = await createMergeDialog();

    expect(accessibleName(fixture)).toBe('Merge branch');
    expect(document.activeElement).toBe(get(fixture, '[role="dialog"]'));
    expect(textOf(get(fixture, '[data-testid="wt-merge-preview-summary"]'))).toBe(
      'Merges 1 change from feature into main. 1 entity overlaps with changes made on main.'
    );
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[data-testid="wt-branch-diff-item"]')).toHaveLength(
      1
    );
    expect(textOf(get(fixture, '[data-testid="wt-branch-diff-conflict"]'))).toBe("Overwrites main's changes to title");
  });

  it('读失败只显示错误，合并照常能点', async () => {
    const fixture = await createMergeDialog({ phase: 'error', message: 'boom' });
    const confirm = vi.fn();
    fixture.componentInstance.confirm.subscribe(confirm);

    expect(textOf(get(fixture, '[data-testid="wt-merge-preview-error"]'))).toContain('boom');
    expect(find(fixture, '[data-testid="wt-branch-diff-list"]')).toBeNull();
    get(fixture, '[data-testid="wt-merge-confirm"]').click();
    expect(confirm).toHaveBeenCalledOnce();
  });

  it('读取中给出提示，不画列表', async () => {
    const fixture = await createMergeDialog({ phase: 'loading' });

    expect(find(fixture, '[data-testid="wt-merge-preview-loading"]')).not.toBeNull();
    expect(find(fixture, '[data-testid="wt-branch-diff-list"]')).toBeNull();
  });

  it('逐条合并的变更互相抵消：有计数、列表给空态', async () => {
    const fixture = await createMergeDialog({
      phase: 'success',
      value: { ...preview, strategy: 'normal', merged: 2, entries: [] }
    });

    expect(textOf(get(fixture, '[data-testid="wt-merge-preview-summary"]'))).toBe(
      'Merges 2 changes from feature into main.'
    );
    expect(textOf(get(fixture, '[data-testid="wt-branch-diff-empty"]'))).toBe(
      'These changes cancel out; nothing on main changes.'
    );
  });

  it('面板里按 Escape、点背板都请求关闭；点面板本身不关', async () => {
    const fixture = await createMergeDialog();
    const closeRequested = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closeRequested);

    get(fixture, '[role="dialog"]').click();
    expect(closeRequested).not.toHaveBeenCalled();
    pressEscape(get(fixture, '[data-testid="wt-merge-strategy-normal"]'));
    expect(closeRequested).toHaveBeenCalledOnce();
    get(fixture, '[aria-label="Close dialog"]').click();
    expect(closeRequested).toHaveBeenCalledTimes(2);
  });

  it('背板不包着面板（按钮的子孙不许可聚焦）', async () => {
    const fixture = await createMergeDialog();

    expect(get(fixture, '[aria-label="Close dialog"]').contains(get(fixture, '[role="dialog"]'))).toBe(false);
  });

  it('焦点陷阱：Tab 从最后一个控件回到第一个，Shift+Tab 从第一个或面板本身去最后一个', async () => {
    const fixture = await createMergeDialog();
    const first = get(fixture, '[data-testid="wt-merge-strategy-squash"]');
    const last = get(fixture, '[data-testid="wt-merge-confirm"]');

    pressTab(last);
    expect(document.activeElement).toBe(first);
    pressTab(first, true);
    expect(document.activeElement).toBe(last);
    pressTab(get(fixture, '[role="dialog"]'), true);
    expect(document.activeElement).toBe(last);
  });

  it('关闭后焦点还给打开前持有它的元素', async () => {
    const opener = document.body.appendChild(document.createElement('button'));
    opener.focus();
    const fixture = await createMergeDialog();
    expect(document.activeElement).toBe(get(fixture, '[role="dialog"]'));

    fixture.componentRef.setInput('dialog', null);
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
    opener.remove();
  });
});

describe('WorkingTreeCompareDialogComponent', () => {
  const comparison = (entries: BranchComparison['entries']): BranchComparison => ({
    fromBranchId: 'main',
    toBranchId: 'feature',
    entries
  });

  it('列出差异，字段读作「当前分支的值 → 那条分支的值」', async () => {
    const fixture = await createCompareDialog({
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
    });

    expect(accessibleName(fixture)).toBe('Compare branches');
    expect(textOf(get(fixture, '[data-testid="wt-compare-summary"]'))).toBe(
      '1 entity differs between main and feature.'
    );
    expect(textOf(get(fixture, '[data-testid="wt-branch-diff-item"]'))).toContain('"a"');
    expect(textOf(get(fixture, '[data-testid="wt-branch-diff-item"]'))).toContain('"b"');
  });

  it('两侧一样：只有摘要，没有列表；Close 与 Escape 都请求关闭', async () => {
    const fixture = await createCompareDialog({ phase: 'success', value: comparison([]) });
    const closeRequested = vi.fn();
    fixture.componentInstance.closeRequested.subscribe(closeRequested);

    expect(textOf(get(fixture, '[data-testid="wt-compare-summary"]'))).toBe('No differences between main and feature.');
    expect(find(fixture, '[data-testid="wt-branch-diff-list"]')).toBeNull();
    get(fixture, '[data-testid="wt-compare-close"]').click();
    pressEscape(get(fixture, '[role="dialog"]'));
    expect(closeRequested).toHaveBeenCalledTimes(2);
  });

  it('读失败显示错误', async () => {
    const fixture = await createCompareDialog({ phase: 'error', message: "Branch 'feature' not found" });

    expect(textOf(get(fixture, '[data-testid="wt-compare-error"]'))).toContain("Branch 'feature' not found");
  });
});
