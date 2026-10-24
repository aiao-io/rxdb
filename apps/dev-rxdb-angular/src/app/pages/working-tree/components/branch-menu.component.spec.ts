import { WorktreeTableSet, type RxDBBranch } from '@aiao/rxdb';
import { TestBed, type ComponentFixture } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WorkingTreeBranchMenuComponent } from './branch-menu.component';

/**
 * @fileoverview 分支下拉认当前分支（US-314 C2.1，React / Vue 端同名 spec 的移植）：挂在可写检出位上时，当前分支是那套表持有的分支，
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

const rowOf = (fixture: ComponentFixture<WorkingTreeBranchMenuComponent>, id: string): HTMLElement => {
  const row = (fixture.nativeElement as HTMLElement).querySelector<HTMLElement>(
    `[data-testid="wt-branch-item"][data-branch-id="${id}"]`
  );
  if (row === null) throw new Error(`找不到分支行 ${id}`);
  return row;
};

/** 搭一个展开着的分支下拉：挂在检出位上，当前分支是 feature（`activated` 为假）。 */
const createMenu = async () => {
  const fixture = TestBed.createComponent(WorkingTreeBranchMenuComponent);
  const switched: string[] = [];
  fixture.componentInstance.switchBranch.subscribe(id => switched.push(id));
  fixture.componentRef.setInput('branches', [
    branch('main', WorktreeTableSet.MAIN.holderKey),
    branch('feature', shadow.holderKey)
  ]);
  fixture.componentRef.setInput('activeBranch', 'feature');
  fixture.componentRef.setInput('menuOpen', true);
  fixture.detectChanges();
  await fixture.whenStable();
  return { fixture, switched };
};

beforeEach(async () => {
  await TestBed.configureTestingModule({ imports: [WorkingTreeBranchMenuComponent] }).compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('WorkingTreeBranchMenuComponent：当前分支（US-314 C2.1）', () => {
  it('挂在检出位上：持有分支那一行带 aria-current，主检出位停着的那一行不带', async () => {
    const { fixture } = await createMenu();

    expect(rowOf(fixture, 'feature').getAttribute('aria-current')).toBe('true');
    expect(rowOf(fixture, 'main').getAttribute('aria-current')).toBeNull();
  });

  it('点当前分支那一行只收起，不切换；点主检出位停着的那一行照常切换', async () => {
    const { fixture, switched } = await createMenu();

    rowOf(fixture, 'feature').click();
    expect(switched).toEqual([]);
    expect(fixture.componentInstance.menuOpen()).toBe(false);

    fixture.componentInstance.menuOpen.set(true);
    fixture.detectChanges();
    await fixture.whenStable();
    rowOf(fixture, 'main').click();
    expect(switched).toEqual(['main']);
  });
});
