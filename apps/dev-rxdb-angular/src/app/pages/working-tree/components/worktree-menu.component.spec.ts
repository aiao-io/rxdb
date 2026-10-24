import { WorktreeTableSet } from '@aiao/rxdb';
import type { Worktree } from '@aiao/rxdb-plugin-working-tree';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkingTreeWorktreeMenuComponent } from './worktree-menu.component';

const shadow = WorktreeTableSet.of('wt_shadow', []);
const worktree = (id: string, name: string, suffix: string): Worktree =>
  ({ id, mode: 'writable', name, branchId: `${name}-branch`, tableSetSuffix: suffix, state: 'ready' }) as Worktree;

const find = (fixture: ComponentFixture<WorkingTreeWorktreeMenuComponent>, selector: string): HTMLElement => {
  const element = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(selector);
  if (element === null) throw new Error(`找不到 ${selector}`);
  return element;
};

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [WorkingTreeWorktreeMenuComponent] }).compileComponents();
});

afterEach(() => TestBed.resetTestingModule());

describe('WorkingTreeWorktreeMenuComponent', () => {
  it('按 Main / Linked 两组渲染，并给当前行 aria-current', async () => {
    const fixture = TestBed.createComponent(WorkingTreeWorktreeMenuComponent);
    fixture.componentRef.setInput('records', [worktree('wt-1', 'Feature work', shadow.suffix!)]);
    fixture.componentRef.setInput('mounted', shadow);
    fixture.componentRef.setInput('menuOpen', true);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(fixture.nativeElement.textContent).toContain('Main worktree');
    expect(fixture.nativeElement.textContent).toContain('Linked worktrees');
    expect(
      find(fixture, '[data-testid="wt-worktree-item"][data-worktree-id="wt-1"]').getAttribute('aria-current')
    ).toBe('true');
    expect(
      find(fixture, '[data-testid="wt-worktree-item"][data-worktree-id="main"]').getAttribute('aria-current')
    ).toBeNull();
  });

  it('点击当前项只关闭，点击其它检出位发出切换事件', async () => {
    const fixture = TestBed.createComponent(WorkingTreeWorktreeMenuComponent);
    fixture.componentRef.setInput('records', [worktree('wt-1', 'Feature work', shadow.suffix!)]);
    fixture.componentRef.setInput('mounted', WorktreeTableSet.MAIN);
    fixture.componentRef.setInput('menuOpen', true);
    const selected: string[] = [];
    fixture.componentInstance.selectWorktree.subscribe(value => selected.push(value.id));
    fixture.detectChanges();
    await fixture.whenStable();

    find(fixture, '[data-testid="wt-worktree-item"][data-worktree-id="main"]').click();
    expect(fixture.componentInstance.menuOpen()).toBe(false);
    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    find(fixture, '[data-testid="wt-worktree-item"][data-worktree-id="wt-1"]').click();
    expect(selected).toEqual(['wt-1']);
  });
});
