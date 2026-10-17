/**
 * @fileoverview 三端 `useWorktrees()` 共用的检出位命令实现（US-313 阶段 D）。
 *
 * @remarks
 * 与 `working-tree-commands.ts` 同形：本文件不持有状态，每一次相位变化交给调用方给的
 * {@link WorktreeStatePatch}，由框架决定写进 signal、`useState` 还是 `shallowRef`；同一格上后发的请求胜出。
 * 「打开、再打开、回收之后要不要重读登记表」这类语义三端共用这一份：只要一端忘了在 `open()` 之后重读，
 * 那一端的列表就少一行，而另外两端是对的。
 *
 * 视图的 `close()` / `release()` / `refresh()` 也经这里包一层：它们同样改登记表，之后要重读。
 */

import { RxDBError, type RxDB } from '@aiao/rxdb';
import {
  trackWorkingTreeCommand,
  trackWorkingTreeQuery,
  type WorkingTreeCommandState,
  type WorkingTreeQueryState,
  type WorkingTreeStateSink
} from '../working-tree/async-state.js';
import type { WorktreeManager, WorktreeOpenOptions, WorktreeView } from './worktree-manager.js';
import type { WorktreeTarget } from './worktree-target.js';
import type { Worktree } from './worktree.entity.js';

/** 检出位入口的各格异步状态。 */
export interface WorktreeAsyncStates {
  /** `list()` 的状态；空即「没有登记着的检出位」 */
  readonly listState: WorkingTreeQueryState<readonly Worktree[]>;
  /** `open()` 的状态；**没有 empty** */
  readonly openState: WorkingTreeCommandState<WorktreeView>;
  /** `attach()` 的状态；**没有 empty** */
  readonly attachState: WorkingTreeCommandState<WorktreeView>;
  /** `prune()` 的状态；回收零个也是结果，不是 empty */
  readonly pruneState: WorkingTreeCommandState<readonly string[]>;
}

/** 各格的初始相位：全是 `idle`。 */
export const WORKTREE_INITIAL_ASYNC_STATES: WorktreeAsyncStates = Object.freeze({
  listState: { phase: 'idle' },
  openState: { phase: 'idle' },
  attachState: { phase: 'idle' },
  pruneState: { phase: 'idle' }
} satisfies WorktreeAsyncStates);

/**
 * 往某一格状态里写一个新相位。
 *
 * @param key - 哪一格
 * @param state - 新相位
 */
export type WorktreeStatePatch = <K extends keyof WorktreeAsyncStates>(key: K, state: WorktreeAsyncStates[K]) => void;

/** 三端入口对外暴露的检出位命令；签名与 {@link WorktreeManager} 上的同名方法一致。 */
export interface WorktreeCommands {
  /** 登记着的检出位；成功打开、再打开、关闭、放开、回收之后都会顺带重读 */
  readonly list: () => Promise<readonly Worktree[]>;
  /** 打开一个只读检出位；交回的视图的 `close()` / `release()` / `refresh()` 之后同样重读登记表 */
  readonly open: (target: WorktreeTarget, options?: WorktreeOpenOptions) => Promise<WorktreeView>;
  /** 再打开一个持久归属的检出位 */
  readonly attach: (id: string) => Promise<WorktreeView>;
  /** 回收没人在用的检出位 */
  readonly prune: () => Promise<readonly string[]>;
}

/** 一格一个的请求代次；只有最新那一次请求能往自己那一格写终态。 */
const createLatestOnlyPatch = (
  patch: WorktreeStatePatch
): (<K extends keyof WorktreeAsyncStates>(key: K) => WorkingTreeStateSink<WorktreeAsyncStates[K]>) => {
  const generations = new Map<keyof WorktreeAsyncStates, number>();
  return <K extends keyof WorktreeAsyncStates>(key: K) => {
    const generation = (generations.get(key) ?? 0) + 1;
    generations.set(key, generation);
    return (state: WorktreeAsyncStates[K]) => {
      if (generations.get(key) !== generation) return;
      patch(key, state);
    };
  };
};

const assertWorktreeEntry = (database: RxDB): WorktreeManager => {
  // 显式写出 `| undefined`：`declare module` 给的静态类型是非可选的，不放宽的话这句守卫会被判成恒真
  const checkouts: WorktreeManager | undefined = database.workingTree?.checkouts;
  if (!checkouts) {
    throw new RxDBError(
      '这个数据库上没有 workingTree.checkouts 入口：先 use(rxDBPluginWorkingTree)，再建检出位命令入口。'
    );
  }
  return checkouts;
};

/**
 * 造一份检出位命令。
 *
 * @param database - 主实例
 * @param patch - 状态落点
 * @returns 命令
 * @throws {@link RxDBError} 没装工作树插件
 */
export const createWorktreeCommands = (database: RxDB, patch: WorktreeStatePatch): WorktreeCommands => {
  const checkouts = assertWorktreeEntry(database);
  const sinkFor = createLatestOnlyPatch(patch);
  const list = (): Promise<readonly Worktree[]> =>
    trackWorkingTreeQuery(
      sinkFor('listState'),
      records => records.length === 0,
      () => checkouts.list()
    );
  // 改了登记表的命令落定之后重读一次；重读失败落在 listState 上，不改命令本身的结果
  const relist = (): void => void list().catch(() => undefined);
  const tracked = (view: WorktreeView): WorktreeView => ({
    ...view,
    refresh: async () => {
      const next = await view.refresh();
      relist();
      return tracked(next);
    },
    close: async () => {
      await view.close();
      relist();
    },
    release: async () => {
      await view.release();
      relist();
    }
  });
  return {
    list,
    open: async (target, options) => {
      const view = await trackWorkingTreeCommand(sinkFor('openState'), () => checkouts.open(target, options));
      relist();
      return tracked(view);
    },
    attach: async id => {
      const view = await trackWorkingTreeCommand(sinkFor('attachState'), () => checkouts.attach(id));
      relist();
      return tracked(view);
    },
    prune: async () => {
      const pruned = await trackWorkingTreeCommand(sinkFor('pruneState'), () => checkouts.prune());
      relist();
      return pruned;
    }
  };
};
