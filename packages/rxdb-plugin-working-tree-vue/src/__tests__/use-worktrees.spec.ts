/**
 * `useWorktrees` —— Vue 侧（US-313 阶段 D）。
 *
 * @remarks
 * 与 Angular / React 的同名测试逐条对齐：同名方法、同名状态字段、同一组相位。
 * 只有容器形态不同 —— Vue 是 `ComputedRef`。桩只桩到 `RxDB.workingTree.checkouts` 那一层。
 */
import type { RxDB } from '@aiao/rxdb';
import { WORKTREE_INITIAL_ASYNC_STATES, type Worktree, type WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktrees, type WorktreesResource } from '../use-worktrees';
import { createRxDBProviderHarness } from './rxdb-provider-harness';
import { createSetupHarness } from './setup-harness';

const mounted: { unmount(): void }[] = [];

const mountWithProvider = (rxdb: RxDB): WorktreesResource => {
  let worktrees!: WorktreesResource;
  mounted.push(
    mount(
      createRxDBProviderHarness(
        rxdb,
        createSetupHarness(() => (worktrees = useWorktrees()))
      )
    )
  );
  return worktrees;
};

const createFixture = () => {
  const checkouts = {
    list: vi.fn<() => Promise<Worktree[]>>().mockResolvedValue([]),
    open: vi.fn<() => Promise<WorktreeView>>(),
    attach: vi.fn<() => Promise<WorktreeView>>(),
    prune: vi.fn<() => Promise<string[]>>()
  };
  return { checkouts, worktrees: mountWithProvider({ workingTree: { checkouts } } as unknown as RxDB) };
};

const viewStub = { id: 'v1', close: vi.fn(), release: vi.fn(), refresh: vi.fn() } as unknown as WorktreeView;

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => {
  while (mounted.length > 0) mounted.pop()?.unmount();
});

describe('useWorktrees', () => {
  it('四格全是 idle，创建入口本身一次 IO 都不发', () => {
    const { checkouts, worktrees } = createFixture();

    expect([
      worktrees.listState.value.phase,
      worktrees.openState.value.phase,
      worktrees.attachState.value.phase,
      worktrees.pruneState.value.phase
    ]).toEqual(['idle', 'idle', 'idle', 'idle']);
    expect(checkouts.list).not.toHaveBeenCalled();
  });

  it('open()：先 loading 再 success，之后重读登记表', async () => {
    const { checkouts, worktrees } = createFixture();
    let resolve: (view: WorktreeView) => void = () => undefined;
    checkouts.open.mockReturnValue(new Promise(done => (resolve = done)));

    const running = worktrees.open({ branchId: 'feature' });
    expect(worktrees.openState.value.phase).toBe('loading');
    resolve(viewStub);
    await running;
    await flush();

    expect(worktrees.openState.value).toEqual({ phase: 'success', value: viewStub });
    expect(checkouts.list).toHaveBeenCalledTimes(1);
    expect(worktrees.listState.value).toEqual({ phase: 'empty', value: [] });
  });

  it('attach() 失败：落在 attachState 并原样抛出', async () => {
    const { checkouts, worktrees } = createFixture();
    const failure = new Error('in_use');
    checkouts.attach.mockRejectedValue(failure);

    await expect(worktrees.attach('v1')).rejects.toBe(failure);

    expect(worktrees.attachState.value).toEqual({ phase: 'error', error: failure });
  });

  it('库没装工作树插件：抛错', () => {
    expect(() => mountWithProvider({} as RxDB)).toThrow(/workingTree\.checkouts/);
  });
});

describe('tri-framework-api.md §3 清单守卫', () => {
  // 三端 README 说「任一端加减成员都会红」，靠的就是这一段：比的是整个成员集合，不只是在不在场。
  // 状态格的名字取自核心的初值表，核心加减一格、而某一端没跟上，这里当场红。
  const METHODS = ['attach', 'list', 'open', 'prune'] as const;

  it('四个方法加四格状态，一个不多一个不少；四格与核心 WorktreeAsyncStates 同名同数', () => {
    const { worktrees } = createFixture();

    expect(Object.keys(worktrees).sort()).toEqual([...METHODS, ...Object.keys(WORKTREE_INITIAL_ASYNC_STATES)].sort());
    for (const method of METHODS) expect(typeof worktrees[method]).toBe('function');
  });
});
