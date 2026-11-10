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
  // 分支表的活查询：信号，改它就像分支数据回传
  branches: undefined as unknown as ReturnType<typeof signal<unknown[]>>,
  mounted: undefined as unknown as ReturnType<typeof signal<WorktreeTableSet>>
}));

vi.mock('@aiao/rxdb-angular', () => ({
  useFindAll: () => ({ value: mocks.branches })
}));

vi.mock('@aiao/rxdb-plugin-working-tree-angular', () => ({
  useWorktrees: () => ({ mounted: mocks.mounted })
}));

/** 主检出位停在 `active` 上：那一条持有主检出位的哨兵、`activated` 为真 */
const mainCheckoutOn = (active: 'main' | 'feature') => [
  { id: 'main', activated: active === 'main', activeKey: active === 'main' ? WorktreeTableSet.MAIN.holderKey : null },
  {
    id: 'feature',
    activated: active === 'feature',
    activeKey: active === 'feature' ? WorktreeTableSet.MAIN.holderKey : null
  }
];

beforeEach(async () => {
  mocks.branches = signal<unknown[]>([
    { id: 'main', activated: true, activeKey: WorktreeTableSet.MAIN.holderKey },
    { id: 'feature', activated: false, activeKey: shadow.holderKey }
  ]);
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

// 与 React 端「rolls back the selection and exposes switch failures」「switches branches and waits for the
// active branch source」同一场景
describe('BranchManager：切换分支', () => {
  async function renderOnMain() {
    mocks.branches.set(mainCheckoutOn('main'));
    mocks.mounted.set(WorktreeTableSet.MAIN);
    const fixture = TestBed.createComponent(BranchManager);
    fixture.detectChanges();
    await fixture.whenStable();
    const host = fixture.nativeElement as HTMLElement;
    const select = host.querySelector<HTMLSelectElement>('[data-testid="app-branch-select"]');
    if (select === null) throw new Error('找不到侧栏的分支选择器');
    expect(select.value).toBe('main');
    const choose = async (branch: string) => {
      select.value = branch;
      select.dispatchEvent(new Event('change'));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    return { choose, fixture, host, select };
  }

  it('切换失败后选择器回到真实分支，并显示失败原因', async () => {
    const switchBranch = vi.mocked(TestBed.inject(RxDB).versionManager.switchBranch);
    switchBranch.mockRejectedValue(new Error('switch failed'));
    const { choose, host, select } = await renderOnMain();

    await choose('feature');

    expect(switchBranch).toHaveBeenCalledWith('feature');
    expect(select.value).toBe('main');
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('switch failed');
  });

  it('切换成功后等分支数据回传再改选中项，并清掉上一次的失败原因', async () => {
    const switchBranch = vi.mocked(TestBed.inject(RxDB).versionManager.switchBranch);
    switchBranch.mockRejectedValueOnce(new Error('switch failed')).mockResolvedValueOnce(undefined);
    const { choose, fixture, host, select } = await renderOnMain();
    await choose('feature');

    await choose('feature');

    expect(switchBranch).toHaveBeenCalledTimes(2);
    expect(host.querySelector('[role="alert"]')).toBeNull();
    expect(select.value).toBe('main');
    mocks.branches.set(mainCheckoutOn('feature'));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(select.value).toBe('feature');
  });
});
