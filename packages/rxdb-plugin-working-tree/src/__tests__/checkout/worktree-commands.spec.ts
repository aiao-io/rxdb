/**
 * @fileoverview 三端共用的检出位命令（US-313 阶段 D）：相位、判空、改了登记表之后重读、后发请求胜出。
 */

import type { RxDB } from '@aiao/rxdb';
import { RxDBError, WorktreeTableSet } from '@aiao/rxdb';
import { BehaviorSubject, Subject } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import {
  createWorktreeCommands,
  readMountedWorktreeTableSet,
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

  // 可写检出位的六个命令（US-314 C1）：一格一个命令，改了登记表的落定之后重读
  it('十格状态：只读检出位的四格之外，可写检出位六个命令各一格，初始都是 idle', () => {
    expect(Object.keys(WORKTREE_INITIAL_ASYNC_STATES).sort()).toEqual([
      'addState',
      'attachState',
      'listState',
      'mountMainState',
      'mountState',
      'openState',
      'pruneState',
      'releaseState',
      'removeState',
      'renameState'
    ]);
    for (const state of Object.values(WORKTREE_INITIAL_ASYNC_STATES)) expect(state).toEqual({ phase: 'idle' });
  });

  it('add() / rename()：先 loading 再 success 带登记行，参数原样转交，之后重读登记表', async () => {
    const row = { id: 'w1', name: 'wt-a' } as Worktree;
    const renamed = { id: 'w1', name: 'wt-b' } as Worktree;
    const list = vi.fn<WorktreeManager['list']>().mockResolvedValue([row]);
    const add = vi.fn<WorktreeManager['add']>(async () => row);
    const rename = vi.fn<WorktreeManager['rename']>(async () => renamed);
    const { commands, states, patch } = setup({ list, add, rename });

    await expect(commands.add('feature', { name: 'wt-a', owner: 'session' })).resolves.toBe(row);
    expect(add).toHaveBeenCalledWith('feature', { name: 'wt-a', owner: 'session' });
    expect(patch.mock.calls.filter(([key]) => key === 'addState').map(([, state]) => state.phase)).toEqual([
      'loading',
      'success'
    ]);
    expect(states.addState).toEqual({ phase: 'success', value: row });
    await expect(commands.rename('w1', 'wt-b')).resolves.toBe(renamed);
    expect(rename).toHaveBeenCalledWith('w1', 'wt-b');
    expect(states.renameState).toEqual({ phase: 'success', value: renamed });
    await flush();
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('mount() / remove() 落定之后重读登记表；mountMain() / release() 不写登记表，不重读', async () => {
    const list = vi.fn<WorktreeManager['list']>().mockResolvedValue([]);
    const mount = vi.fn<WorktreeManager['mount']>(async () => undefined);
    const remove = vi.fn<WorktreeManager['remove']>(async () => undefined);
    const release = vi.fn<WorktreeManager['release']>(async () => undefined);
    const { commands, states } = setup({ list, mount, remove, release, mountMain: vi.fn(async () => undefined) });

    await commands.mountMain();
    await commands.release('w1');
    await flush();
    expect(list).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledWith('w1');
    expect(states.mountMainState).toEqual({ phase: 'success', value: undefined });
    expect(states.releaseState).toEqual({ phase: 'success', value: undefined });

    await commands.mount('w1');
    await commands.remove('w2');
    await flush();
    expect(mount).toHaveBeenCalledWith('w1');
    expect(remove).toHaveBeenCalledWith('w2');
    expect(states.mountState).toEqual({ phase: 'success', value: undefined });
    expect(states.removeState).toEqual({ phase: 'success', value: undefined });
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('mount() 失败：错误落在 mountState 并原样抛出，不重读', async () => {
    const failure = new Error('in_use');
    const list = vi.fn<WorktreeManager['list']>().mockResolvedValue([]);
    const { commands, states } = setup({
      list,
      mount: vi.fn(async () => {
        throw failure;
      })
    });

    await expect(commands.mount('w1')).rejects.toBe(failure);
    expect(states.mountState).toEqual({ phase: 'error', error: failure });
    await flush();
    expect(list).not.toHaveBeenCalled();
  });

  it('readMountedWorktreeTableSet()：取挂载流在订阅当下交出的那一套，不留订阅；流没交出就抛', () => {
    const shadow = WorktreeTableSet.of('wt_mounted', []);
    const tableSet$ = new BehaviorSubject(shadow);
    expect(readMountedWorktreeTableSet({ worktreeTableSet$: tableSet$ } as unknown as RxDB)).toBe(shadow);
    expect(tableSet$.observed).toBe(false);

    expect(() => readMountedWorktreeTableSet({ worktreeTableSet$: new Subject() } as unknown as RxDB)).toThrow(
      /worktreeTableSet\$/
    );
  });

  it('mount() 同一格后发的请求胜出：先发后到的失败不覆盖后发的成功', async () => {
    let rejectFirst: (error: Error) => void = () => undefined;
    const mount = vi
      .fn<WorktreeManager['mount']>()
      .mockImplementationOnce(() => new Promise((_, reject) => (rejectFirst = reject)))
      .mockResolvedValueOnce(undefined);
    const { commands, states } = setup({ list: vi.fn(async () => []), mount });

    const first = commands.mount('w1');
    await commands.mount('w2');
    rejectFirst(new Error('late'));
    await expect(first).rejects.toThrow('late');

    expect(states.mountState).toEqual({ phase: 'success', value: undefined });
  });
});
