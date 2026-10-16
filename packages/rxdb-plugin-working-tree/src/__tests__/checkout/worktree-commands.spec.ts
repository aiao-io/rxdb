/**
 * @fileoverview 三端共用的检出位命令（US-313 阶段 D）：相位、判空、改了登记表之后重读、后发请求胜出。
 */

import type { RxDB } from '@aiao/rxdb';
import { RxDBError } from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import {
  createWorktreeCommands,
  WORKTREE_INITIAL_ASYNC_STATES,
  type WorktreeAsyncStates
} from '../../checkout/worktree-commands.js';
import type { WorktreeManager, WorktreeView } from '../../checkout/worktree-manager.js';
import type { Worktree } from '../../checkout/worktree.entity.js';

const viewStub = (id: string): WorktreeView => ({
  id,
  target: { branchId: 'feature' },
  owner: 'session',
  rxdb: {} as RxDB,
  entityOf: EntityClass => EntityClass,
  refresh: vi.fn(async () => viewStub(`${id}-next`)),
  close: vi.fn(async () => undefined),
  release: vi.fn(async () => undefined)
});

const setup = (checkouts: Partial<WorktreeManager>) => {
  const states: { -readonly [K in keyof WorktreeAsyncStates]: WorktreeAsyncStates[K] } = {
    ...WORKTREE_INITIAL_ASYNC_STATES
  };
  const patch = vi.fn(<K extends keyof WorktreeAsyncStates>(key: K, state: WorktreeAsyncStates[K]) => {
    states[key] = state;
  });
  const database = { workingTree: { checkouts } } as unknown as RxDB;
  return { commands: createWorktreeCommands(database, patch), states, patch };
};

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

describe('createWorktreeCommands', () => {
  it('没装工作树插件：直接报错', () => {
    expect(() => createWorktreeCommands({} as RxDB, vi.fn())).toThrow(RxDBError);
  });

  it('list()：零行是 empty，有行是 success', async () => {
    const rows = [{ id: 'a' }] as Worktree[];
    const list = vi.fn<WorktreeManager['list']>().mockResolvedValueOnce([]).mockResolvedValueOnce(rows);
    const { commands, states } = setup({ list });

    await commands.list();
    expect(states.listState).toEqual({ phase: 'empty', value: [] });
    await commands.list();
    expect(states.listState).toEqual({ phase: 'success', value: rows });
  });

  it('open()：先 loading 再 success，之后重读登记表；视图的关闭、放开、刷新之后也重读', async () => {
    const list = vi.fn<WorktreeManager['list']>().mockResolvedValue([]);
    const opened = viewStub('v1');
    const { commands, states, patch } = setup({ list, open: vi.fn(async () => opened) });

    const view = await commands.open({ branchId: 'feature' }, { owner: 'persistent' });
    expect(patch.mock.calls.filter(([key]) => key === 'openState').map(([, state]) => state.phase)).toEqual([
      'loading',
      'success'
    ]);
    expect(states.openState).toEqual({ phase: 'success', value: opened });
    await flush();
    expect(list).toHaveBeenCalledTimes(1);

    await view.release();
    await view.close();
    const next = await view.refresh();
    await flush();
    expect(opened.release).toHaveBeenCalledTimes(1);
    expect(opened.close).toHaveBeenCalledTimes(1);
    expect(next.id).toBe('v1-next');
    expect(list).toHaveBeenCalledTimes(4);
  });

  it('attach() 与 prune() 落定之后重读登记表；失败落在自己那一格并原样抛出', async () => {
    const list = vi.fn<WorktreeManager['list']>().mockResolvedValue([]);
    const failure = new Error('in use');
    const { commands, states } = setup({
      list,
      attach: vi.fn(async () => {
        throw failure;
      }),
      prune: vi.fn(async () => ['gone'])
    });

    await expect(commands.attach('x')).rejects.toBe(failure);
    expect(states.attachState).toEqual({ phase: 'error', error: failure });
    await expect(commands.prune()).resolves.toEqual(['gone']);
    expect(states.pruneState).toEqual({ phase: 'success', value: ['gone'] });
    await flush();
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('同一格后发的请求胜出：先发后到的结果不覆盖', async () => {
    let resolveFirst: (rows: Worktree[]) => void = () => undefined;
    const second = [{ id: 'second' }] as Worktree[];
    const list = vi
      .fn<WorktreeManager['list']>()
      .mockImplementationOnce(() => new Promise(resolve => (resolveFirst = resolve)))
      .mockResolvedValueOnce(second);
    const { commands, states } = setup({ list });

    const first = commands.list();
    await commands.list();
    resolveFirst([{ id: 'first' }] as Worktree[]);
    await first;

    expect(states.listState).toEqual({ phase: 'success', value: second });
  });
});
