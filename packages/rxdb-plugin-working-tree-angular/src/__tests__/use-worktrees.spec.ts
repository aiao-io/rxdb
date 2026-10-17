/**
 * `useWorktrees` —— Angular 侧（US-313 阶段 D）。
 *
 * @remarks
 * 与 React / Vue 的同名测试逐条对齐：同名方法、同名状态字段、同一组相位。
 * 只有容器形态不同 —— Angular 是 `Signal`。桩只桩到 `RxDB.workingTree.checkouts` 那一层。
 */
import type { RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { WORKTREE_INITIAL_ASYNC_STATES, type Worktree, type WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktrees } from '../use-worktrees';

const createFixture = (rxdb?: RxDB) => {
  const checkouts = {
    list: vi.fn<() => Promise<Worktree[]>>().mockResolvedValue([]),
    open: vi.fn<() => Promise<WorktreeView>>(),
    attach: vi.fn<() => Promise<WorktreeView>>(),
    prune: vi.fn<() => Promise<string[]>>()
  };
  TestBed.configureTestingModule({
    providers: [
      provideZonelessChangeDetection(),
      provideRxDB(rxdb ?? ({ workingTree: { checkouts } } as unknown as RxDB))
    ]
  });
  return { checkouts, worktrees: () => TestBed.runInInjectionContext(() => useWorktrees()) };
};

const viewStub = { id: 'v1', close: vi.fn(), release: vi.fn(), refresh: vi.fn() } as unknown as WorktreeView;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => TestBed.resetTestingModule());

describe('useWorktrees', () => {
  it('四格全是 idle，创建入口本身一次 IO 都不发', () => {
    const { checkouts, worktrees } = createFixture();
    const resource = worktrees();

    expect([
      resource.listState().phase,
      resource.openState().phase,
      resource.attachState().phase,
      resource.pruneState().phase
    ]).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(checkouts.list).not.toHaveBeenCalled();
  });

  it('open()：先 loading 再 success，之后重读登记表', async () => {
    const { checkouts, worktrees } = createFixture();
    const resource = worktrees();
    let resolve: (view: WorktreeView) => void = () => undefined;
    checkouts.open.mockReturnValue(new Promise(done => (resolve = done)));

    const running = resource.open({ branchId: 'feature' });
    expect(resource.openState().phase).toBe('loading');
    resolve(viewStub);
    await running;
    await flush();

    expect(resource.openState()).toEqual({ phase: 'success', value: viewStub });
    expect(checkouts.list).toHaveBeenCalledTimes(1);
    expect(resource.listState()).toEqual({ phase: 'empty', value: [] });
  });

  it('attach() 失败：落在 attachState 并原样抛出', async () => {
    const { checkouts, worktrees } = createFixture();
    const resource = worktrees();
    const failure = new Error('in_use');
    checkouts.attach.mockRejectedValue(failure);

    await expect(resource.attach('v1')).rejects.toBe(failure);

    expect(resource.attachState()).toEqual({ phase: 'error', error: failure });
  });

  it('库没装工作树插件：抛错', () => {
    const { worktrees } = createFixture({} as RxDB);
    expect(() => worktrees()).toThrow(/workingTree\.checkouts/);
  });
});

describe('tri-framework-api.md §3 清单守卫', () => {
  // 三端 README 说「任一端加减成员都会红」，靠的就是这一段：比的是整个成员集合，不只是在不在场。
  // 状态格的名字取自核心的初值表，核心加减一格、而某一端没跟上，这里当场红。
  const METHODS = ['attach', 'list', 'open', 'prune'] as const;

  it('四个方法加四格状态，一个不多一个不少；四格与核心 WorktreeAsyncStates 同名同数', () => {
    const { worktrees } = createFixture();
    const resource = worktrees();

    expect(Object.keys(resource).sort()).toEqual([...METHODS, ...Object.keys(WORKTREE_INITIAL_ASYNC_STATES)].sort());
    for (const method of METHODS) expect(typeof resource[method]).toBe('function');
  });
});
