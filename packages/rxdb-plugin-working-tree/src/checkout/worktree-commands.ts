/**
 * @fileoverview 三端 `useWorktrees()` 共用的检出位命令实现（只读检出位 US-313 阶段 D、可写检出位 US-314 C1）。
 *
 * @remarks
 * 与 `working-tree-commands.ts` 同形：本文件不持有状态，每一次相位变化交给调用方给的
 * {@link WorktreeStatePatch}，由框架决定写进 signal、`useState` 还是 `shallowRef`；同一格上后发的请求胜出。
 * 「打开、再打开、回收之后要不要重读登记表」这类语义三端共用这一份：只要一端忘了在 `open()` 之后重读，
 * 那一端的列表就少一行，而另外两端是对的。
 *
 * 视图的 `close()` / `release()` / `refresh()` 也经这里包一层：它们同样改登记表，之后要重读。
 * 可写检出位的 `add()` / `mount()`（写访问时间，重建时还写指纹）/ `remove()` / `rename()` 落定之后重读；
 * `mountMain()` / `release()` 不写登记表，不重读。
 */

import { RxDBError, type RxDB, type WorktreeTableSet } from '@aiao/rxdb';
import {
  trackWorkingTreeCommand,
  trackWorkingTreeQuery,
  type WorkingTreeCommandState,
  type WorkingTreeQueryState,
  type WorkingTreeStateSink
} from '../working-tree/async-state.js';
import type { WorktreeAddOptions, WorktreeManager, WorktreeOpenOptions, WorktreeView } from './worktree-manager.js';
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
  /** `add()` 的状态：建好的可写检出位的登记行 */
  readonly addState: WorkingTreeCommandState<Worktree>;
  /** `mount()` 的状态 */
  readonly mountState: WorkingTreeCommandState<void>;
  /** `mountMain()` 的状态 */
  readonly mountMainState: WorkingTreeCommandState<void>;
  /** `release()` 的状态 */
  readonly releaseState: WorkingTreeCommandState<void>;
  /** `remove()` 的状态 */
  readonly removeState: WorkingTreeCommandState<void>;
  /** `rename()` 的状态：改名之后的登记行 */
  readonly renameState: WorkingTreeCommandState<Worktree>;
}

/** 各格的初始相位：全是 `idle`。 */
export const WORKTREE_INITIAL_ASYNC_STATES: WorktreeAsyncStates = Object.freeze({
  listState: { phase: 'idle' },
  openState: { phase: 'idle' },
  attachState: { phase: 'idle' },
  pruneState: { phase: 'idle' },
  addState: { phase: 'idle' },
  mountState: { phase: 'idle' },
  mountMainState: { phase: 'idle' },
  releaseState: { phase: 'idle' },
  removeState: { phase: 'idle' },
  renameState: { phase: 'idle' }
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
  /** 回收没人在用的检出位（含没有登记行的孤儿表集） */
  readonly prune: () => Promise<readonly string[]>;
  /** 开一个可写检出位：登记、持有分支、建表、播种；建好不挂，本上下文认领它 */
  readonly add: (branchId: string, options?: WorktreeAddOptions) => Promise<Worktree>;
  /** 让主实例挂上一个可写检出位；指纹不符时在挂载的那笔事务里重建 */
  readonly mount: (id: string) => Promise<void>;
  /** 让主实例挂回主检出位 */
  readonly mountMain: () => Promise<void>;
  /** 交出对一个可写检出位的认领 */
  readonly release: (id: string) => Promise<void>;
  /** 删掉一个可写检出位；未提交的改动留在它持有的分支上 */
  readonly remove: (id: string) => Promise<void>;
  /** 给一个可写检出位改名 */
  readonly rename: (id: string, name: string) => Promise<Worktree>;
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

/**
 * 本实例此刻挂的那套表：`worktreeTableSet$` 在订阅当下交出的那一套（US-314 C1）。
 *
 * @param database - 主实例
 * @returns 挂着的表集
 * @throws {@link RxDBError} 流没在订阅当下交出当前那一套
 *
 * @remarks
 * 三端 `useWorktrees()` 的 `mounted` 都从流取初值、不读 `rxdb.worktreeTableSet`：换挂事务里那个字段先变，
 * 流要等实体缓存清空之后才发，读字段的一端会比另外两端早一步看到新的一套。只读内存里的流，不发 IO。
 */
export const readMountedWorktreeTableSet = (database: RxDB): WorktreeTableSet => {
  const seen: { current?: WorktreeTableSet } = {};
  database.worktreeTableSet$.subscribe(tableSet => (seen.current = tableSet)).unsubscribe();
  if (seen.current === undefined) {
    throw new RxDBError('worktreeTableSet$ 没有在订阅当下交出本实例挂着的那套表，读不出 mounted。');
  }
  return seen.current;
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
    },
    add: async (branchId, options) => {
      const record = await trackWorkingTreeCommand(sinkFor('addState'), () => checkouts.add(branchId, options));
      relist();
      return record;
    },
    mount: async id => {
      await trackWorkingTreeCommand(sinkFor('mountState'), () => checkouts.mount(id));
      relist();
    },
    mountMain: () => trackWorkingTreeCommand(sinkFor('mountMainState'), () => checkouts.mountMain()),
    release: id => trackWorkingTreeCommand(sinkFor('releaseState'), () => checkouts.release(id)),
    remove: async id => {
      await trackWorkingTreeCommand(sinkFor('removeState'), () => checkouts.remove(id));
      relist();
    },
    rename: async (id, name) => {
      const record = await trackWorkingTreeCommand(sinkFor('renameState'), () => checkouts.rename(id, name));
      relist();
      return record;
    }
  };
};
