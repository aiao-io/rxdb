import { WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkingTreeWorktreeDialogsComponent } from './worktree-dialogs.component';

const branch = (id: string, activeKey: string | null): RxDBBranch => ({ id, activeKey }) as RxDBBranch;
const target = {
  id: 'wt-1',
  name: 'Feature work',
  branchId: 'feature',
  tableSetSuffix: WorktreeTableSet.of('wt_shadow', []).suffix
} as Worktree;

const find = (fixture: ComponentFixture<WorkingTreeWorktreeDialogsComponent>, selector: string): HTMLElement => {
  const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`找不到 ${selector}`);
  return element;
};

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [WorkingTreeWorktreeDialogsComponent] }).compileComponents();
});

afterEach(() => TestBed.resetTestingModule());

describe('WorkingTreeWorktreeDialogsComponent', () => {
  it('新建对话框要求名称与未占用分支，Enter 提交并正确标注 aria', async () => {
    const fixture = TestBed.createComponent(WorkingTreeWorktreeDialogsComponent);
    fixture.componentRef.setInput('createOpen', true);
    fixture.componentRef.setInput('branches', [branch('main', 'active'), branch('feature', null)]);
    fixture.componentInstance.createName.set('New worktree');
    fixture.componentInstance.createBranch.set('feature');
    const requests: Array<{ name: string; branchId: string }> = [];
    fixture.componentInstance.createConfirmed.subscribe(value => requests.push(value));
    fixture.detectChanges();
    await fixture.whenStable();

    expect(find(fixture, '[role="dialog"]').getAttribute('aria-labelledby')).toBe('wt-worktree-create-title');
    expect(find(fixture, '[data-testid="wt-worktree-create-confirm"]').hasAttribute('disabled')).toBe(false);
    find(fixture, '[data-testid="wt-worktree-create-name"]').dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })
    );
    expect(requests).toEqual([{ name: 'New worktree', branchId: 'feature' }]);
  });

  it('删除对话框显示未提交警告', async () => {
    const fixture = TestBed.createComponent(WorkingTreeWorktreeDialogsComponent);
    fixture.componentRef.setInput('deleteTarget', target);
    fixture.componentRef.setInput('deleteDirty', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(find(fixture, '[data-testid="wt-worktree-delete-dialog"]')).toBeTruthy();
    expect(find(fixture, '[data-testid="wt-worktree-delete-warning"]').textContent).toContain('uncommitted');
  });
});
