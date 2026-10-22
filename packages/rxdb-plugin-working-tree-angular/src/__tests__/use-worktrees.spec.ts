/**
 * `useWorktrees` —— Angular 侧（只读检出位 US-313 阶段 D，可写检出位 US-314 C1）。
 *
 * @remarks
 * 与 React / Vue 的同名测试逐条对齐：同名方法、同名状态字段、同一组相位、同一个 `mounted`。
 * 只有容器形态不同 —— Angular 是 `Signal`。桩取自核心包的 `createWorktreeHookStubs()`。
 */
import { WorktreeTableSet, type RxDB } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import { WORKTREE_INITIAL_ASYNC_STATES, type WorktreeView } from '@aiao/rxdb-plugin-working-tree';
import { createWorktreeHookStubs } from '@aiao/rxdb-plugin-working-tree/testing';
import {
  createEnvironmentInjector,
  EnvironmentInjector,
  provideZonelessChangeDetection,
  runInInjectionContext
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktrees } from '../use-worktrees';

const createFixture = (rxdb?: RxDB) => {
  const stubs = createWorktreeHookStubs();
  TestBed.configureTestingModule({
    providers: [provideZonelessChangeDetection(), provideRxDB(rxdb ?? stubs.rxdb)]
  });
  return { ...stubs, worktrees: () => TestBed.runInInjectionContext(() => useWorktrees()) };
};

const viewStub = { id: 'v1', close: vi.fn(), release: vi.fn(), refresh: vi.fn() } as unknown as WorktreeView;
const shadow = WorktreeTableSet.of('wt_shadow', []);

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

afterEach(() => TestBed.resetTestingModule());

describe('useWorktrees', () => {
  it('十格全是 idle，mounted 是库此刻挂的表集；创建入口本身一次 IO 都不发', () => {
    const { checkouts, worktrees } = createFixture();
    const resource = worktrees();

    for (const key of Object.keys(WORKTREE_INITIAL_ASYNC_STATES) as (keyof typeof WORKTREE_INITIAL_ASYNC_STATES)[]) {
      expect(resource[key]().phase).toBe('idle');
    }
    expect(resource.mounted()).toBe(WorktreeTableSet.MAIN);
    expect(checkouts.list).not.toHaveBeenCalled();
  });

  it('mounted 跟着挂载流走：主表集 → 影子表集 → 重建后同后缀的新实例 → 主表集', () => {
    const { tableSet$, worktrees } = createFixture();
    const resource = worktrees();
    const rebuilt = WorktreeTableSet.of('wt_shadow', []);

    tableSet$.next(shadow);
    expect(resource.mounted()).toBe(shadow);
    tableSet$.next(rebuilt);
    expect(resource.mounted()).toBe(rebuilt);
    tableSet$.next(WorktreeTableSet.MAIN);
    expect(resource.mounted()).toBe(WorktreeTableSet.MAIN);
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

  it('mount()：先 loading 再 success，之后重读登记表', async () => {
    const { checkouts, worktrees } = createFixture();
    const resource = worktrees();
    let resolve: () => void = () => undefined;
    checkouts.mount.mockReturnValue(new Promise<void>(done => (resolve = done)));

    const running = resource.mount('w1');
    expect(resource.mountState().phase).toBe('loading');
    resolve();
    await running;
    await flush();

    expect(checkouts.mount).toHaveBeenCalledWith('w1');
    expect(resource.mountState()).toEqual({ phase: 'success', value: undefined });
    expect(checkouts.list).toHaveBeenCalledTimes(1);
  });

  it('attach() / remove() 失败：落在各自那一格并原样抛出', async () => {
    const { checkouts, worktrees } = createFixture();
    const resource = worktrees();
    const failure = new Error('in_use');
    checkouts.attach.mockRejectedValue(failure);
    checkouts.remove.mockRejectedValue(failure);

    await expect(resource.attach('v1')).rejects.toBe(failure);
    await expect(resource.remove('w1')).rejects.toBe(failure);

    expect(resource.attachState()).toEqual({ phase: 'error', error: failure });
    expect(resource.removeState()).toEqual({ phase: 'error', error: failure });
  });

  it('注入器销毁之后退订挂载流', () => {
    const { tableSet$ } = createFixture();
    const child = createEnvironmentInjector([], TestBed.inject(EnvironmentInjector));
    runInInjectionContext(child, () => useWorktrees());
    expect(tableSet$.observed).toBe(true);

    child.destroy();

    expect(tableSet$.observed).toBe(false);
  });

  it('挂载流没在订阅当下交出当前的表集：抛错', () => {
    const { checkouts } = createWorktreeHookStubs();
    const { worktrees } = createFixture({
      workingTree: { checkouts },
      worktreeTableSet$: new Subject()
    } as unknown as RxDB);
    expect(() => worktrees()).toThrow(/worktreeTableSet\$/);
  });

  it('库没装工作树插件：抛错', () => {
    const { worktrees } = createFixture({} as RxDB);
    expect(() => worktrees()).toThrow(/workingTree\.checkouts/);
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
