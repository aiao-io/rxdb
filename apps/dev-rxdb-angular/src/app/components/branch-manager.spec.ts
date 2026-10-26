import { RxDB, WorktreeTableSet } from '@aiao/rxdb';
import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BranchManager } from './branch-manager';

/**
 * @fileoverview 侧栏分支选择器认当前分支（US-314 C2.1，React / Vue 端同名用例的移植）：挂在可写检出位上时，
 * 当前分支是那套表持有的那一条，不是 `activated` 为真的那一条。
 */

const shadow = WorktreeTableSet.of('wt_x', []);

const mocks = vi.hoisted(() => ({
  branches: [] as unknown[],
  mounted: undefined as unknown as ReturnType<typeof signal<WorktreeTableSet>>
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: () => mocks.branches })
}));

vi.mock('@aiao/rxdb-plugin-working-tree-angular', () => ({
  useWorktrees: () => ({ mounted: mocks.mounted })
}));

beforeEach(async () => {
  mocks.branches = [
    { id: 'main', activated: true, activeKey: WorktreeTableSet.MAIN.holderKey },
    { id: 'feature', activated: false, activeKey: shadow.holderKey }
  ];
  mocks.mounted = signal<WorktreeTableSet>(shadow);
  await TestBed.configureTestingModule({
    imports: [BranchManager],
    providers: [{ provide: RxDB, useValue: { versionManager: { switchBranch: vi.fn(), createBranch: vi.fn() } } }]
  }).compileComponents();
});

afterEach(() => {
  TestBed.resetTestingModule();
});

describe('BranchManager：当前分支（US-314 C2.1）', () => {
  it('挂在检出位上选中的是那套表持有的分支；挂回主检出位选中主检出位停着的那条', async () => {
    const fixture = TestBed.createComponent(BranchManager);
    fixture.detectChanges();
    await fixture.whenStable();
    const select = (fixture.nativeElement as HTMLElement).querySelector<HTMLSelectElement>(
      '[data-testid="app-branch-select"]'
    );
    if (select === null) throw new Error('找不到侧栏的分支选择器');

    expect(select.getAttribute('aria-label')).toBe('当前分支');
    expect(select.value).toBe('feature');

    mocks.mounted.set(WorktreeTableSet.MAIN);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(select.value).toBe('main');
  });
});
