import type { RxDB } from '@aiao/rxdb';
import {
  CREDENTIALS,
  createWorkingTreeHookStubs,
  deferred,
  diffWith,
  statusWith
} from '@aiao/rxdb-plugin-working-tree/testing';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, renderHook, type RenderHookOptions } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useWorkingTree } from '../use-working-tree.js';

afterEach(cleanup);

const renderSwitchable = (initial: RxDB, options?: Pick<RenderHookOptions<unknown>, 'reactStrictMode'>) => {
  let database = initial;
  const rendered = renderHook(() => useWorkingTree(), {
    ...options,
    wrapper: ({ children }: PropsWithChildren) => createElement(RxDBProvider, { db: database }, children)
  });
  const replace = (next: RxDB): void => {
    database = next;
    rendered.rerender();
  };
  return { ...rendered, replace };
};

describe('切换 provider 后工作树状态归属当前库（RV-069 回归）', () => {
  it('换库后不向新库展示旧库的查询状态', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    first.workingTree.status.mockResolvedValue(statusWith(7));
    const rendered = renderSwitchable(first.rxdb);
    await act(async () => void (await rendered.result.current.status()));
    expect(rendered.result.current.statusState).toEqual({ phase: 'success', value: statusWith(7) });

    rendered.replace(second.rxdb);

    expect(rendered.result.current.statusState).toEqual({ phase: 'idle' });
    expect(second.workingTree.status).not.toHaveBeenCalled();
  });

  it('旧库晚到响应不能覆盖新库已完成的状态', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    const pending = deferred<boolean>();
    first.workingTree.isEnabled.mockReturnValue(pending.promise);
    second.workingTree.isEnabled.mockResolvedValue(false);
    const rendered = renderSwitchable(first.rxdb);
    let running!: Promise<boolean>;
    act(() => void (running = rendered.result.current.isEnabled()));

    rendered.replace(second.rxdb);
    await act(async () => void (await rendered.result.current.isEnabled()));
    expect(rendered.result.current.isEnabledState).toEqual({ phase: 'success', value: false });
    await act(async () => {
      pending.resolve(true);
      await running;
    });

    expect(rendered.result.current.isEnabledState).toEqual({ phase: 'success', value: false });
  });

  // 回归：评审要求的「旧 diff」边界——换库必须连同查询类状态一起收回，不止 status 那一格。
  it('换库后旧库的 diff 查询状态同样被收回，不残留在新库上', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    first.workingTree.diff.mockResolvedValue(diffWith(5));
    const rendered = renderSwitchable(first.rxdb);
    await act(async () => void (await rendered.result.current.diff()));
    expect(rendered.result.current.diffState).toEqual({ phase: 'success', value: diffWith(5) });

    rendered.replace(second.rxdb);

    expect(rendered.result.current.diffState).toEqual({ phase: 'idle' });
    expect(second.workingTree.diff).not.toHaveBeenCalled();
  });

  // 回归：评审要求的「CAS/dirty 中换库」边界——旧库未落地的 commit（哪怕最终以冲突收场）
  // 不能在它迟到时盖掉新库已经确认成功的 commitState。
  it('旧库未落地的 commit 冲突迟到，不能覆盖新库已提交成功的状态', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    const pendingCommit = deferred<Awaited<ReturnType<typeof first.workingTree.commit>>>();
    first.workingTree.commit.mockReturnValue(pendingCommit.promise);
    second.workingTree.commit.mockResolvedValue({ ok: true, commitId: 'commit-2', changeSetCount: 1, headRevision: 5 });
    const rendered = renderSwitchable(first.rxdb);

    let running!: ReturnType<typeof rendered.result.current.commit>;
    act(() => {
      running = rendered.result.current.commit('旧库提交', { ...CREDENTIALS, authorId: 'alice', operationId: 'op-1' });
    });

    rendered.replace(second.rxdb);
    expect(rendered.result.current.commitState).toEqual({ phase: 'idle' });

    await act(async () => {
      await rendered.result.current.commit('新库提交', { ...CREDENTIALS, authorId: 'bob', operationId: 'op-2' });
    });
    expect(rendered.result.current.commitState).toEqual({
      phase: 'success',
      value: { ok: true, commitId: 'commit-2', changeSetCount: 1, headRevision: 5 }
    });

    await act(async () => {
      pendingCommit.resolve({
        ok: false,
        conflict: { kind: 'head_revision', expected: 2, actual: 3, branchId: 'main' }
      });
      await running.catch(() => undefined);
    });

    expect(rendered.result.current.commitState).toEqual({
      phase: 'success',
      value: { ok: true, commitId: 'commit-2', changeSetCount: 1, headRevision: 5 }
    });
  });

  // 回归：评审要求的 StrictMode 边界——双调用不应让「换库即时回到初态」失效或触发额外查询。
  it('StrictMode 下换库同样立即回到初态，不向旧库或新库发出多余查询', async () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    first.workingTree.status.mockResolvedValue(statusWith(4));
    const rendered = renderSwitchable(first.rxdb, { reactStrictMode: true });
    await act(async () => void (await rendered.result.current.status()));
    expect(rendered.result.current.statusState).toEqual({ phase: 'success', value: statusWith(4) });

    rendered.replace(second.rxdb);

    expect(rendered.result.current.statusState).toEqual({ phase: 'idle' });
    expect(second.workingTree.status).not.toHaveBeenCalled();
  });

  // 分支覆盖：一次命令都没发起过就换库，十二格仍是同一个冻结单例，`patch` 里的身份判断
  // 必须跳过多余的 `setStates` 调用——而不是盲目再触发一次与现状完全相同的重渲染。
  it('一次命令都没发起过就换库，不触发多余的状态写入', () => {
    const first = createWorkingTreeHookStubs();
    const second = createWorkingTreeHookStubs();
    const rendered = renderSwitchable(first.rxdb);

    rendered.replace(second.rxdb);

    expect(rendered.result.current.statusState).toEqual({ phase: 'idle' });
    expect(second.workingTree.status).not.toHaveBeenCalled();
  });
});
