/**
 * @fileoverview system/system-repositories.ts —— 系统表仓库解析与「当前分支」解析
 *
 * @remarks
 * US-025 阶段 C 把历史 / 撤销重做 / 分支的**消费者**搬进 `@aiao/rxdb-plugin-history`，
 * 把这三张表与本模块的解析函数留在核心。留下来的理由是它们不属于历史子系统：
 * 变更日志触发器直接写 `branchId`，核心自己的 QueryCache 出站路径也要问「当前分支是谁」。
 *
 * 搬迁之后本模块在核心侧一度只被插件的套件覆盖，核心自己的套件够不着它——
 * 于是这里按**核心原语**的身份给它补上直接的判据，盯三件搬迁最容易碰坏的事：
 *
 * 1. **热路径不开事务**。同步链路每条远端事件都要调 `getCurrentBranch`，
 *    把整段包进事务能修好并发，但会让每次读都去抢并发度 1 的写队列槽位。
 * 2. **冷路径在事务内重做检查**（双重检查）。否则两个并发调用双双走到 `create`，
 *    第二个撞主键报错。
 * 3. **冷路径用 executor 的仓库**，不是适配器上那个。用错了就会经绑在适配器上的仓库
 *    重新入队，排在自己这个事务后面，队列并发度 1，永久挂起。
 */

import { of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { RxDB } from '../../RxDB.js';
import { RxDBBranch } from '../../system/branch.js';
import { RxDBChange } from '../../system/change.js';
import {
  getCurrentBranch,
  getLocalSystemRepositories,
  getRemoteSystemRepositories,
  resolve_current_branch
} from '../../system/system-repositories.js';
import type { LocalRxDBBranchRepository } from '../../system/types.local.js';

type BranchRow = { id: string; activated: boolean; local?: boolean; remote?: boolean };

/**
 * 分支仓库替身：`find()` 按调用次数依次答 `rows` 的每一项。
 *
 * 双重检查这件事只能靠「两次 find 答不同的东西」来验：第一次（事务外）答空、
 * 第二次（事务内）答一条已激活的分支，就是「并发调用抢先激活了」这个局面。
 */
const branchRepositoryStub = (rows: BranchRow[][]) => {
  let call = 0;
  return {
    find: vi.fn(async () => rows[Math.min(call++, rows.length - 1)] ?? []),
    update: vi.fn(async () => undefined),
    create: vi.fn(async () => undefined)
  };
};

const rxdbStub = (options: {
  branchRepository: unknown;
  changeRepository?: unknown;
  /**
   * 事务内 `executor.getRepository()` 交出的分支仓库。
   *
   * 与适配器上那个**必须是两个不同的对象**：冷路径要验的正是「写落在哪一个上」，
   * 两边共用一个替身的话，无论源码取的是谁，断言都一样成立 —— 那就什么都没验。
   */
  txBranchRepository?: unknown;
  remote?: boolean;
}) => {
  const getRepository = vi.fn((EntityType: unknown) =>
    EntityType === RxDBBranch ? options.branchRepository : (options.changeRepository ?? {})
  );
  const txGetRepository = vi.fn((EntityType: unknown) =>
    EntityType === RxDBBranch ?
      (options.txBranchRepository ?? options.branchRepository)
    : (options.changeRepository ?? {})
  );
  const adapter = {
    getRepository,
    transaction: vi.fn(async (fun: (executor: unknown) => Promise<unknown>) => fun({ getRepository: txGetRepository }))
  };
  const adapter$ = of(adapter);
  const rxdb = {
    localAdapter$: options.remote ? of(undefined) : adapter$,
    remoteAdapter$: options.remote ? adapter$ : of(undefined),
    entityManager: {
      instantiate: vi.fn(() => ({ id: '', activated: false, local: false, remote: true }) as BranchRow)
    }
  } as unknown as RxDB;
  return { rxdb, adapter, getRepository, txGetRepository };
};

describe('getLocalSystemRepositories / getRemoteSystemRepositories', () => {
  it('从 localAdapter$ 上按实体类取分支与变更两张系统表的仓库', async () => {
    const branchRepository = branchRepositoryStub([[]]);
    const changeRepository = { find: vi.fn() };
    const { rxdb, adapter, getRepository } = rxdbStub({ branchRepository, changeRepository });

    const repositories = await getLocalSystemRepositories(rxdb);

    expect(repositories.branchRepository).toBe(branchRepository);
    expect(repositories.changeRepository).toBe(changeRepository);
    // 适配器本身也一并交出去：调用方（出站重放、getCurrentBranch 冷路径）要在同一个
    // 适配器上开事务，重新去 `localAdapter$` 取一次就可能取到另一个纪元的实例。
    expect(repositories.adapter).toBe(adapter);
    expect(getRepository).toHaveBeenCalledWith(RxDBBranch);
    expect(getRepository).toHaveBeenCalledWith(RxDBChange);
  });

  it('远端版本走 remoteAdapter$', async () => {
    const branchRepository = branchRepositoryStub([[]]);
    const { rxdb, adapter } = rxdbStub({ branchRepository, remote: true });

    const repositories = await getRemoteSystemRepositories(rxdb);

    expect(repositories.adapter).toBe(adapter);
    expect(repositories.branchRepository).toBe(branchRepository);
  });
});

describe('resolve_current_branch', () => {
  it('有激活分支时直接返回，不写任何东西', async () => {
    const branchRepository = branchRepositoryStub([[{ id: 'feature', activated: true }]]);
    const { rxdb } = rxdbStub({ branchRepository });

    const branch = await resolve_current_branch(branchRepository as unknown as LocalRxDBBranchRepository, rxdb);

    expect(branch.id).toBe('feature');
    expect(branchRepository.update).not.toHaveBeenCalled();
    expect(branchRepository.create).not.toHaveBeenCalled();
  });

  it('没有激活分支但 main 存在时激活 main，不新建', async () => {
    const main: BranchRow = { id: 'main', activated: false };
    const branchRepository = branchRepositoryStub([[], [main]]);
    const { rxdb } = rxdbStub({ branchRepository });

    const branch = await resolve_current_branch(branchRepository as unknown as LocalRxDBBranchRepository, rxdb);

    expect(branch).toBe(main);
    // 实例上与库里都要置位：调用方拿到的就是这个对象，只写库会让它带着 false 回去。
    expect(main.activated).toBe(true);
    expect(branchRepository.update).toHaveBeenCalledWith(main, { activated: true });
    expect(branchRepository.create).not.toHaveBeenCalled();
  });

  it('两张都查不到时新建一条本地 main', async () => {
    const branchRepository = branchRepositoryStub([[], []]);
    const { rxdb } = rxdbStub({ branchRepository });

    const branch = await resolve_current_branch(branchRepository as unknown as LocalRxDBBranchRepository, rxdb);

    expect(branch.id).toBe('main');
    expect(branch.activated).toBe(true);
    // `local: true` / `remote: false`：新建出来的 main 是本地起点，不该被当成远端已有分支
    // 推上去——推上去之后远端多一条谁都没建过的分支。
    expect(branch.local).toBe(true);
    expect(branch.remote).toBe(false);
    expect(branchRepository.create).toHaveBeenCalledWith(branch);
  });
});

describe('getCurrentBranch', () => {
  it('热路径（已有激活分支）不开事务', async () => {
    const branchRepository = branchRepositoryStub([[{ id: 'main', activated: true }]]);
    const { rxdb, adapter } = rxdbStub({ branchRepository });

    const branch = await getCurrentBranch(rxdb);

    expect(branch.id).toBe('main');
    // 同步链路每条远端事件都调它。开一次事务就是去抢并发度 1 的写队列槽位，
    // 读路径被写队列堵住这件事不会报错，只会整体变慢——所以只能在这里钉住。
    expect(adapter.transaction).not.toHaveBeenCalled();
    expect(branchRepository.find).toHaveBeenCalledTimes(1);
  });

  it('冷路径开事务，并在事务内用 executor 的仓库（而不是适配器上那个）重做检查', async () => {
    // 适配器上那个只答第一次（事务外）的空；事务内的两次 find 走 executor 的那份。
    const branchRepository = branchRepositoryStub([[]]);
    const txBranchRepository = branchRepositoryStub([[], []]);
    const { rxdb, adapter } = rxdbStub({ branchRepository, txBranchRepository });

    const branch = await getCurrentBranch(rxdb);

    expect(adapter.transaction).toHaveBeenCalledTimes(1);
    expect(branch.id).toBe('main');
    // 事务内那次必须经 executor 拿仓库。拿成适配器上那个，写就会重新入队，
    // 排在当前这个事务后面，而队列并发度是 1 —— 于是永久挂起，不是报错。
    expect(txBranchRepository.create).toHaveBeenCalledTimes(1);
    expect(branchRepository.create).not.toHaveBeenCalled();
    // 事务外只查了一次（那次答空才掉进冷路径），重做检查全在 executor 那边。
    expect(branchRepository.find).toHaveBeenCalledTimes(1);
    expect(txBranchRepository.find).toHaveBeenCalledTimes(2);
  });

  it('双重检查：并发调用在事务外查空之后抢先激活了分支，事务内不再新建', async () => {
    // 事务外答空（冷路径），事务内答一条已激活 —— 正是「另一个调用抢先建好了」的局面。
    const branchRepository = branchRepositoryStub([[]]);
    const txBranchRepository = branchRepositoryStub([[{ id: 'main', activated: true }]]);
    const { rxdb } = rxdbStub({ branchRepository, txBranchRepository });

    const branch = await getCurrentBranch(rxdb);

    expect(branch.id).toBe('main');
    // 少了这次重查，两个并发调用会双双走到 create，第二个撞主键报错。
    expect(txBranchRepository.create).not.toHaveBeenCalled();
    expect(txBranchRepository.update).not.toHaveBeenCalled();
  });
});
