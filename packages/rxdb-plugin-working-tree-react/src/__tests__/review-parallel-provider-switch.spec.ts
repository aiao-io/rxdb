import type { RxDB } from '@aiao/rxdb';
import { createWorkingTreeHookStubs, deferred, statusWith } from '@aiao/rxdb-plugin-working-tree/testing';
import { RxDBProvider } from '@aiao/rxdb-react';
import { act, cleanup, renderHook } from '@testing-library/react';
import { createElement, type PropsWithChildren } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { useWorkingTree } from '../use-working-tree.js';

afterEach(cleanup);

const renderSwitchable = (initial: RxDB) => {
  let database = initial;
  const rendered = renderHook(() => useWorkingTree(), {
    wrapper: ({ children }: PropsWithChildren) => createElement(RxDBProvider, { db: database }, children)
  });
  const replace = (next: RxDB): void => {
    database = next;
    rendered.rerender();
  };
  return { ...rendered, replace };
};

describe('并行评审：工作树状态归属当前 provider', () => {
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
});
