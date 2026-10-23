/**
 * `useWorktrees` —— React 侧（只读检出位 US-313 阶段 D，可写检出位 US-314 C1）。
 *
 * @remarks
 * 与 Angular / Vue 的 `use-worktrees.spec.ts` 逐条对齐：同名方法、同名状态字段、同一组相位、同一个 `mounted`。
 * 只有容器形态不同 —— React 是渲染快照。桩取自核心包的 `createWorktreeHookStubs()`，只桩到
 * `RxDB.workingTree.checkouts` 与 `RxDB.worktreeTableSet$` 那一层。
 */
import { WorktreeTableSet, type RxDB } from '@aiao/rxdb';
import { WORKTREE_INITIAL_ASYNC_STATES, type WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { createWorktreeHookStubs } from '@aiao/rxdb-plugin-working-tree/testing';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { StrictMode } from 'react';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktrees } from '../use-worktrees.js';

const createFixture = () => {
  const stubs = createWorktreeHookStubs();
  const rendered = renderHook(() => useWorktrees(), {
    wrapper: ({ children }) => <RxDBProvider db={stubs.rxdb}>{children}</RxDBProvider>
  });
  return { ...stubs, rendered, worktrees: () => rendered.result.current };
};

const viewStub = { id: 'v1', close: vi.fn(), release: vi.fn(), refresh: vi.fn() } as unknown as WorktreeView;
const shadow = WorktreeTableSet.of('wt_shadow', []);

afterEach(cleanup);

describe('useWorktrees', () => {
  it('十格全是 idle，mounted 是库此刻挂的表集；创建入口本身一次 IO 都不发', () => {
    const { checkouts, worktrees } = createFixture();

    for (const key of Object.keys(WORKTREE_INITIAL_ASYNC_STATES) as (keyof typeof WORKTREE_INITIAL_ASYNC_STATES)[]) {
      expect(worktrees()[key].phase).toBe('idle');
    }
    expect(worktrees().mounted).toBe(WorktreeTableSet.MAIN);
    expect(checkouts.list).not.toHaveBeenCalled();
  });

  it('mounted 跟着挂载流走：主表集 → 影子表集 → 重建后同后缀的新实例 → 主表集', () => {
    const { tableSet$, worktrees } = createFixture();
    const rebuilt = WorktreeTableSet.of('wt_shadow', []);

    act(() => tableSet$.next(shadow));
    expect(worktrees().mounted).toBe(shadow);
    act(() => tableSet$.next(rebuilt));
    expect(worktrees().mounted).toBe(rebuilt);
    act(() => tableSet$.next(WorktreeTableSet.MAIN));
    expect(worktrees().mounted).toBe(WorktreeTableSet.MAIN);
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

  it('mount()：先 loading 再 success，之后重读登记表', async () => {
    const { checkouts, worktrees } = createFixture();
    let resolve: () => void = () => undefined;
    checkouts.mount.mockReturnValue(new Promise<void>(done => (resolve = done)));

    let running!: Promise<void>;
    act(() => void (running = worktrees().mount('w1')));
    expect(worktrees().mountState.phase).toBe('loading');
    await act(async () => {
      resolve();
      await running;
    });

    expect(checkouts.mount).toHaveBeenCalledWith('w1');
    expect(worktrees().mountState).toEqual({ phase: 'success', value: undefined });
    expect(checkouts.list).toHaveBeenCalledTimes(1);
  });

  it('attach() / remove() 失败：落在各自那一格并原样抛出', async () => {
    const { checkouts, worktrees } = createFixture();
    const failure = new Error('in_use');
    checkouts.attach.mockRejectedValue(failure);
    checkouts.remove.mockRejectedValue(failure);

    await act(async () => {
      await expect(worktrees().attach('v1')).rejects.toBe(failure);
      await expect(worktrees().remove('w1')).rejects.toBe(failure);
    });

    expect(worktrees().attachState).toEqual({ phase: 'error', error: failure });
    expect(worktrees().removeState).toEqual({ phase: 'error', error: failure });
  });

  it('卸载之后退订挂载流；StrictMode 的二次挂载不留下多余的订阅', () => {
    const plain = createFixture();
    expect(plain.tableSet$.observed).toBe(true);
    plain.rendered.unmount();
    expect(plain.tableSet$.observed).toBe(false);

    const stubs = createWorktreeHookStubs();
    const strict = renderHook(() => useWorktrees(), {
      wrapper: ({ children }) => (
        <StrictMode>
          <RxDBProvider db={stubs.rxdb}>{children}</RxDBProvider>
        </StrictMode>
      )
    });
    act(() => stubs.tableSet$.next(shadow));
    expect(strict.result.current.mounted).toBe(shadow);
    strict.unmount();
    expect(stubs.tableSet$.observed).toBe(false);
  });

  it('换库：十格回到 idle，mounted 换成新库的；旧库迟到的结果与之后的换挂都不写进来', async () => {
    const first = createWorktreeHookStubs();
    const second = createWorktreeHookStubs();
    second.tableSet$.next(shadow);
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
    expect(rendered.result.current.mounted).toBe(shadow);
    await act(async () => {
      resolve(viewStub);
      await running;
    });
    act(() => first.tableSet$.next(WorktreeTableSet.of('wt_stale', [])));

    expect(rendered.result.current.openState.phase).toBe('idle');
    expect(rendered.result.current.listState.phase).toBe('idle');
    expect(rendered.result.current.mounted).toBe(shadow);
    expect(first.tableSet$.observed).toBe(false);
    expect(second.checkouts.list).not.toHaveBeenCalled();
  });

  it('挂载流没在订阅当下交出当前的表集：抛错', () => {
    const { checkouts } = createWorktreeHookStubs();
    const rxdb = { workingTree: { checkouts }, worktreeTableSet$: new Subject() } as unknown as RxDB;
    expect(() =>
      renderHook(() => useWorktrees(), {
        wrapper: ({ children }) => <RxDBProvider db={rxdb}>{children}</RxDBProvider>
      })
    ).toThrow(/worktreeTableSet\$/);
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
  const METHODS = [
    'add',
    'attach',
    'list',
    'mount',
    'mountMain',
    'open',
    'prune',
    'release',
    'remove',
    'rename'
  ] as const;

  it('十个方法、十格状态加 mounted，一个不多一个不少；状态格与核心 WorktreeAsyncStates 同名同数', () => {
    const { worktrees } = createFixture();
    const resource = worktrees();

    expect(Object.keys(resource).sort()).toEqual(
      [...METHODS, ...Object.keys(WORKTREE_INITIAL_ASYNC_STATES), 'mounted'].sort()
    );
    for (const method of METHODS) expect(typeof resource[method]).toBe('function');
  });
});
