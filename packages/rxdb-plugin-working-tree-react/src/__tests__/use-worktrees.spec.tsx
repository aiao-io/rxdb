/**
 * `useWorktrees` —— React 侧（US-313 阶段 D）。
 *
 * @remarks
 * 与 Angular / Vue 的 `use-worktrees.spec.ts` 逐条对齐：同名方法、同名状态字段、同一组相位。
 * 只有容器形态不同 —— React 是渲染快照。桩只桩到 `RxDB.workingTree.checkouts` 那一层。
 */
import type { RxDB } from '@aiao/rxdb';
import { WORKTREE_INITIAL_ASYNC_STATES, type Worktree, type WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktrees } from '../use-worktrees.js';

const createDatabase = () => {
  const checkouts = {
    list: vi.fn<() => Promise<Worktree[]>>().mockResolvedValue([]),
    open: vi.fn<() => Promise<WorktreeView>>(),
    attach: vi.fn<() => Promise<WorktreeView>>(),
    prune: vi.fn<() => Promise<string[]>>()
  };
  return { checkouts, rxdb: { workingTree: { checkouts } } as unknown as RxDB };
};

const createFixture = () => {
  const { checkouts, rxdb } = createDatabase();
  const rendered = renderHook(() => useWorktrees(), {
    wrapper: ({ children }) => <RxDBProvider db={rxdb}>{children}</RxDBProvider>
  });
  return { checkouts, worktrees: () => rendered.result.current };
};

const viewStub = { id: 'v1', close: vi.fn(), release: vi.fn(), refresh: vi.fn() } as unknown as WorktreeView;

afterEach(cleanup);

describe('useWorktrees', () => {
  it('四格全是 idle，创建入口本身一次 IO 都不发', () => {
    const { checkouts, worktrees } = createFixture();

    expect([
      worktrees().listState.phase,
      worktrees().openState.phase,
      worktrees().attachState.phase,
      worktrees().pruneState.phase
    ]).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(checkouts.list).not.toHaveBeenCalled();
  });

  it('open()：先 loading 再 success，之后重读登记表', async () => {
    const { checkouts, worktrees } = createFixture();
    let resolve: (view: WorktreeView) => void = () => undefined;
    checkouts.open.mockReturnValue(new Promise(done => (resolve = done)));

    let running!: Promise<WorktreeView>;
    act(() => void (running = worktrees().open({ branchId: 'feature' })));
    expect(worktrees().openState.phase).toBe('loading');
    await act(async () => {
      resolve(viewStub);
      await running;
    });

    expect(worktrees().openState).toEqual({ phase: 'success', value: viewStub });
    expect(checkouts.list).toHaveBeenCalledTimes(1);
    expect(worktrees().listState).toEqual({ phase: 'empty', value: [] });
  });

  it('attach() 失败：落在 attachState 并原样抛出', async () => {
    const { checkouts, worktrees } = createFixture();
    const failure = new Error('in_use');
    checkouts.attach.mockRejectedValue(failure);

    await act(async () => {
      await expect(worktrees().attach('v1')).rejects.toBe(failure);
    });

    expect(worktrees().attachState).toEqual({ phase: 'error', error: failure });
  });

  it('换库：四格回到 idle，旧库迟到的结果不写进新库的状态', async () => {
    const first = createDatabase();
    const second = createDatabase();
    let current = first.rxdb;
    const rendered = renderHook(() => useWorktrees(), {
      wrapper: ({ children }) => <RxDBProvider db={current}>{children}</RxDBProvider>
    });
    let resolve: (view: WorktreeView) => void = () => undefined;
    first.checkouts.open.mockReturnValue(new Promise(done => (resolve = done)));
    let running!: Promise<WorktreeView>;
    act(() => void (running = rendered.result.current.open({ branchId: 'feature' })));
    expect(rendered.result.current.openState.phase).toBe('loading');

    current = second.rxdb;
    rendered.rerender();
    expect(rendered.result.current.openState.phase).toBe('idle');
    await act(async () => {
      resolve(viewStub);
      await running;
    });

    expect(rendered.result.current.openState.phase).toBe('idle');
    expect(rendered.result.current.listState.phase).toBe('idle');
    expect(second.checkouts.list).not.toHaveBeenCalled();
  });

  it('库没装工作树插件：抛错', () => {
    const rxdb = {} as RxDB;
    expect(() =>
      renderHook(() => useWorktrees(), {
        wrapper: ({ children }) => <RxDBProvider db={rxdb}>{children}</RxDBProvider>
      })
    ).toThrow(/workingTree\.checkouts/);
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
