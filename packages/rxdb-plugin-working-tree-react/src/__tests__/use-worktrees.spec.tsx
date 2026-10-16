/**
 * `useWorktrees` —— React 侧（US-313 阶段 D）。
 *
 * @remarks
 * 与 Angular / Vue 的 `use-worktrees.spec.ts` 逐条对齐：同名方法、同名状态字段、同一组相位。
 * 只有容器形态不同 —— React 是渲染快照。桩只桩到 `RxDB.workingTree.checkouts` 那一层。
 */
import type { RxDB } from '@aiao/rxdb';
import type { Worktree, WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktrees } from '../use-worktrees.js';

const createFixture = () => {
  const checkouts = {
    list: vi.fn<() => Promise<Worktree[]>>().mockResolvedValue([]),
    open: vi.fn<() => Promise<WorktreeView>>(),
    attach: vi.fn<() => Promise<WorktreeView>>(),
    prune: vi.fn<() => Promise<string[]>>()
  };
  const rxdb = { workingTree: { checkouts } } as unknown as RxDB;
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

  it('库没装工作树插件：抛错', () => {
    const rxdb = {} as RxDB;
    expect(() =>
      renderHook(() => useWorktrees(), {
        wrapper: ({ children }) => <RxDBProvider db={rxdb}>{children}</RxDBProvider>
      })
    ).toThrow(/workingTree\.checkouts/);
  });
});
