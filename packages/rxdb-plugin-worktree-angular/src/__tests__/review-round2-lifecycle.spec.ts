import { RxDBError } from '@aiao/rxdb';
import { provideRxDB } from '@aiao/rxdb-angular';
import type { CommitResult, WorktreeDiff, WorktreeStatus } from '@aiao/rxdb-plugin-worktree';
import {
  createWorktreeHookStubs,
  CREDENTIALS,
  deferred,
  diffWith,
  statusWith
} from '@aiao/rxdb-plugin-worktree/testing';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  createComponent,
  createEnvironmentInjector,
  DestroyRef,
  EnvironmentInjector,
  input,
  provideZonelessChangeDetection,
  runInInjectionContext
} from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { useWorktree } from '../index.js';

@Component({
  selector: 'review-worktree-panel',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span data-testid="branch">{{ branchId() }}</span>
    <span data-testid="phase">{{ tree.statusState().phase }}</span>
    <span data-testid="diff-phase">{{ tree.diffState().phase }}</span>
    <button (click)="selectBranch()">切分支</button>
  `
})
class WorktreePanel {
  readonly branchId = input('main');
  readonly tree = useWorktree();
  readonly second = useWorktree();

  selectBranch(): Promise<void> {
    return this.tree.switchBranch(this.branchId());
  }
}

const mount = () => {
  const stubs = createWorktreeHookStubs();
  TestBed.configureTestingModule({
    imports: [WorktreePanel],
    providers: [provideZonelessChangeDetection(), provideRxDB(stubs.rxdb)]
  });
  const fixture = TestBed.createComponent(WorktreePanel);
  fixture.detectChanges();
  return { ...stubs, fixture, tree: fixture.componentInstance.tree };
};

const branchStatus = (branchId: string, count: number): WorktreeStatus => ({ ...statusWith(count), branchId });

const branchDiff = (branchId: string, count: number): WorktreeDiff => ({ ...diffWith(count), branchId });

const branchText = (element: unknown): string | null => {
  if (!(element instanceof HTMLElement)) throw new Error('组件没有真实 DOM 根节点');
  return element.querySelector('[data-testid="branch"]')?.textContent ?? null;
};

const phaseText = (element: unknown): string | null => {
  if (!(element instanceof HTMLElement)) throw new Error('组件没有真实 DOM 根节点');
  return element.querySelector('[data-testid="phase"]')?.textContent ?? null;
};

afterEach(() => TestBed.resetTestingModule());

describe('R2-07 Angular 注入、signal 与命令所有权', () => {
  it('脱离注入上下文直接调用会抛错', () => {
    expect(() => useWorktree()).toThrow();
  });

  it('缺插件在创建入口时显式报错，不伪造干净工作树', () => {
    const stubs = createWorktreeHookStubs();
    Reflect.deleteProperty(stubs.rxdb, 'worktree');
    TestBed.configureTestingModule({ providers: [provideRxDB(stubs.rxdb)] });

    expect(() => TestBed.runInInjectionContext(useWorktree)).toThrow(RxDBError);
    expect(stubs.worktree.enable).not.toHaveBeenCalled();
    expect(stubs.worktree.status).not.toHaveBeenCalled();
  });

  it('实际 OnPush 组件创建不发 IO，未启用状态不触发隐式 enable', async () => {
    const { worktree, fixture, tree } = mount();
    worktree.isEnabled.mockResolvedValue(false);

    expect(phaseText(fixture.nativeElement)).toBe('idle');
    expect(worktree.status).not.toHaveBeenCalled();
    expect(worktree.enable).not.toHaveBeenCalled();
    await expect(tree.isEnabled()).resolves.toBe(false);
    expect(tree.isEnabledState()).toEqual({ phase: 'success', value: false });
    expect(worktree.enable).not.toHaveBeenCalled();
  });

  it('同组件两次入口互不共享状态，diff 不重算 status 的下游 computed', async () => {
    const { worktree, fixture, tree } = mount();
    let reads = 0;
    const statusPhase = computed(() => {
      reads += 1;
      return tree.statusState().phase;
    });
    expect(statusPhase()).toBe('idle');
    worktree.diff.mockResolvedValue(diffWith(1));
    await tree.diff();
    expect(statusPhase()).toBe('idle');
    expect(reads).toBe(1);
    expect(fixture.componentInstance.second.diffState().phase).toBe('idle');
    expect(tree.diffState().phase).toBe('success');
  });

  it('OnPush DOM 可观察 pending/error/empty，而不是只测返回值', async () => {
    const { worktree, fixture, tree } = mount();
    const pending = deferred<WorktreeStatus>();
    worktree.status.mockReturnValueOnce(pending.promise);
    const running = tree.status();
    fixture.detectChanges();
    expect(phaseText(fixture.nativeElement)).toBe('loading');
    pending.resolve(statusWith(0));
    await running;
    fixture.detectChanges();
    expect(phaseText(fixture.nativeElement)).toBe('empty');

    const failure = new Error('工作树不可读');
    worktree.status.mockRejectedValueOnce(failure);
    await expect(tree.status()).rejects.toBe(failure);
    fixture.detectChanges();
    expect(phaseText(fixture.nativeElement)).toBe('error');
  });

  it('输入改变不偷偷切库或分支，显式命令透传当前输入', async () => {
    const { worktree, versionManager, fixture, tree } = mount();
    worktree.diff.mockResolvedValue(branchDiff('main', 1));
    await tree.diff();
    const before = tree.diffState();
    fixture.componentRef.setInput('branchId', 'feature');
    fixture.detectChanges();

    expect(branchText(fixture.nativeElement)).toBe('feature');
    expect(versionManager.switchBranch).not.toHaveBeenCalled();
    expect(tree.diffState()).toBe(before);
    worktree.status.mockResolvedValue(branchStatus('feature', 0));
    await fixture.componentInstance.selectBranch();
    expect(versionManager.switchBranch).toHaveBeenCalledTimes(1);
    expect(versionManager.switchBranch).toHaveBeenCalledWith('feature', undefined);
    expect(tree.statusState()).toEqual({ phase: 'empty', value: branchStatus('feature', 0) });
  });

  it('同一格并发按发起代次收尾，旧 promise 仍将自己的结果给原调用方', async () => {
    const { worktree, tree } = mount();
    const older = deferred<WorktreeDiff>();
    const newer = deferred<WorktreeDiff>();
    worktree.diff.mockReturnValueOnce(older.promise).mockReturnValueOnce(newer.promise);
    const first = tree.diff({ limit: 1 });
    const second = tree.diff({ limit: 2 });
    newer.resolve(branchDiff('feature', 2));
    await second;
    older.resolve(branchDiff('main', 1));
    await expect(first).resolves.toEqual(branchDiff('main', 1));
    expect(tree.diffState()).toEqual({ phase: 'success', value: branchDiff('feature', 2) });
    expect(worktree.diff).toHaveBeenNthCalledWith(1, { limit: 1 });
    expect(worktree.diff).toHaveBeenNthCalledWith(2, { limit: 2 });
  });

  it('子 environment provider 覆盖只影响子组件，并保持外部数据库所有权', async () => {
    const { fixture: parentFixture, worktree: parentIO } = mount();
    const childStubs = createWorktreeHookStubs();
    const destroy = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(childStubs.rxdb, 'destroy', { value: destroy });
    const childInjector = createEnvironmentInjector(
      [provideRxDB(childStubs.rxdb)],
      TestBed.inject(EnvironmentInjector)
    );
    const child = createComponent(WorktreePanel, { environmentInjector: childInjector });
    try {
      childStubs.worktree.status.mockResolvedValue(branchStatus('child', 2));
      await child.instance.tree.status();
      expect(child.instance.tree.statusState()).toEqual({ phase: 'success', value: branchStatus('child', 2) });
      expect(parentFixture.componentInstance.tree.statusState().phase).toBe('idle');
      expect(parentIO.status).not.toHaveBeenCalled();
    } finally {
      child.destroy();
      childInjector.destroy();
    }
    expect(destroy).not.toHaveBeenCalled();
  });

  it('组件销毁后旧 status 的完成不会污染重新挂载的实例', async () => {
    const { worktree, fixture, tree } = mount();
    const pending = deferred<WorktreeStatus>();
    worktree.status.mockReturnValueOnce(pending.promise);
    const running = tree.status();
    const destroyRef = fixture.componentRef.injector.get(DestroyRef);
    fixture.destroy();
    expect(destroyRef.destroyed).toBe(true);
    const next = TestBed.createComponent(WorktreePanel);
    pending.resolve(branchStatus('old', 1));
    await running;

    expect(next.componentInstance.tree.statusState().phase).toBe('idle');
    expect(tree.statusState()).toEqual({ phase: 'success', value: branchStatus('old', 1) });
  });

  it('销毁后旧命令仍刷新旧库，但不会回写另一个 provider 的新状态', async () => {
    const { worktree: oldIO, fixture, tree: oldTree } = mount();
    const pending = deferred<CommitResult>();
    oldIO.commit.mockReturnValueOnce(pending.promise);
    const options = { ...CREDENTIALS, authorId: 'alice', operationId: 'round2-old-owner' };
    const running = oldTree.commit('旧库提交', options);
    fixture.destroy();

    const nextStubs = createWorktreeHookStubs();
    const nextInjector = createEnvironmentInjector([provideRxDB(nextStubs.rxdb)], TestBed.inject(EnvironmentInjector));
    try {
      const nextTree = runInInjectionContext(nextInjector, useWorktree);
      nextStubs.worktree.status.mockResolvedValue(branchStatus('next', 4));
      await nextTree.status();
      pending.resolve({ ok: true, commitId: 'old-commit', changeSetCount: 1, headRevision: 3 });
      await running;
      expect(oldIO.commit).toHaveBeenCalledTimes(1);
      expect(oldIO.commit).toHaveBeenCalledWith('旧库提交', options);
      expect(oldIO.status).toHaveBeenCalledTimes(1);
      expect(nextStubs.worktree.status).toHaveBeenCalledTimes(1);
      expect(nextTree.statusState()).toEqual({ phase: 'success', value: branchStatus('next', 4) });
      expect(nextTree.commitState().phase).toBe('idle');
    } finally {
      nextInjector.destroy();
    }
  });

  it('销毁中的拒绝仍归原调用方，不转成新实例的错误', async () => {
    const { worktree, fixture, tree } = mount();
    const pending = deferred<WorktreeStatus>();
    const failure = new Error('旧 owner 读取失败');
    worktree.status.mockReturnValueOnce(pending.promise);
    const running = tree.status();
    const observed = expect(running).rejects.toBe(failure);
    fixture.destroy();
    const next = TestBed.createComponent(WorktreePanel);
    pending.reject(failure);
    await observed;

    expect(next.componentInstance.tree.statusState().phase).toBe('idle');
    expect(tree.statusState()).toEqual({ phase: 'error', error: failure });
  });

  it('已读取的敏感 diff 在外部保留 resource 时不会因组件销毁自动清空', async () => {
    const { worktree, fixture, tree } = mount();
    const diff = diffWith(1);
    const secret = 'round2-secret-not-for-logs';
    const sensitive: WorktreeDiff = {
      ...diff,
      entries: diff.entries.map(entry => ({ ...entry, patch: { privateText: secret } }))
    };
    worktree.diff.mockResolvedValue(sensitive);
    await tree.diff();
    const before = tree.diffState();
    fixture.destroy();
    const next = TestBed.createComponent(WorktreePanel);

    expect(tree.diffState()).toBe(before);
    expect(next.componentInstance.tree.diffState().phase).toBe('idle');
  });
});
