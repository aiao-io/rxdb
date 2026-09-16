/**
 * @packageDocumentation
 * 系统表仓库解析。
 *
 * 三张系统表（{@link RxDBBranch} / {@link RxDBChange} / {@link RxDBSync}）的仓库解析与
 * 「当前分支」解析都在这里。它们是**核心原语**而不是历史子系统的行为：
 * 变更日志触发器直接写 `branchId`（`rxdb-adapter-sqlite-core` 的 `table/trigger_sql.ts`），
 * 而 `RxDBChange.branch` 这条 `MANY_TO_ONE` 关系会生成真实的
 * `REFERENCES rxdb$rxdb_branch(id)` 外键（`table/create_table_sql.ts`）——
 * 没有分支表就建不出变更表，没有变更表整条响应式增量链路（触发器 →
 * `handle_rxdb_change` → `QueryManager`）就断。
 *
 * 因此 US-025 阶段 C 把**消费者**（历史 / 撤销重做 / 分支操作）搬进
 * `@aiao/rxdb-plugin-history`，把这三张表与本文件的解析函数留在核心。
 */
import { firstValueFrom } from 'rxjs';
import type { RxDB } from '../RxDB.js';
import { ACTIVE_BRANCH_KEY } from './active-branch-guard.js';
import { RxDBBranch } from './branch.js';
import { RxDBChange } from './change.js';
import type { LocalRxDBBranchRepository, LocalRxDBChangeRepository } from './types.local.js';
import type { RemoteRxDBBranchRepository, RemoteRxDBChangeRepository } from './types.remote.js';

/**
 * 解析「当前分支」：取激活分支，没有则激活 `main`，`main` 也不存在则建一个。
 *
 * @param branchRepository - 分支仓库
 * @param rxdb - RxDB 实例，只用于 `entityManager.instantiate`
 *
 * @remarks
 * 只接收仓库、不接收管理器：谁传进来的仓库属于哪个事务，这段逻辑就跑在哪个事务里，
 * 函数本身不做任何入队决策。{@link getCurrentBranch} 的冷路径与插件侧的 `create_branch`
 * （它自己已经开着事务，再走一次 `getCurrentBranch` 会经绑在适配器上的仓库重新入队，
 * 排在自己这个事务后面，队列并发度 1，永久挂起）共用它。
 */
export const resolve_current_branch = async (
  branchRepository: LocalRxDBBranchRepository,
  rxdb: RxDB
): Promise<InstanceType<typeof RxDBBranch>> => {
  const activeBranch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      },
      limit: 1
    })
  )[0];

  if (activeBranch) {
    return activeBranch;
  }

  const mainBranch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'id', operator: '=', value: 'main' }]
      },
      limit: 1
    })
  )[0];

  if (mainBranch) {
    // 冗余列与 `activated` 必须同写（`system/branch.ts` 的可空唯一列就架在它上面）。
    // 漏写一处，那一行就绕过唯一约束，而 schema 那一半的保护正好在这种漏写上失效。
    mainBranch.activated = true;
    mainBranch.activeKey = ACTIVE_BRANCH_KEY;
    await branchRepository.update(mainBranch, { activated: true, activeKey: ACTIVE_BRANCH_KEY });
    return mainBranch;
  }

  const branch = rxdb.entityManager.instantiate(RxDBBranch);
  branch.id = 'main';
  branch.activated = true;
  branch.activeKey = ACTIVE_BRANCH_KEY;
  branch.local = true;
  branch.remote = false;
  await branchRepository.create(branch);
  return branch;
};

/**
 * 取本地适配器上的系统表仓库。
 *
 * @param rxdb - RxDB 实例
 */
export const getLocalSystemRepositories = async (rxdb: RxDB) => {
  const adapter = await firstValueFrom(rxdb.localAdapter$);
  const branchRepository = adapter.getRepository<typeof RxDBBranch, LocalRxDBBranchRepository>(RxDBBranch);
  const changeRepository = adapter.getRepository<typeof RxDBChange, LocalRxDBChangeRepository>(RxDBChange);
  return { branchRepository, changeRepository, adapter };
};

/**
 * 取远端适配器上的系统表仓库。
 *
 * @param rxdb - RxDB 实例
 */
export const getRemoteSystemRepositories = async (rxdb: RxDB) => {
  const adapter = await firstValueFrom(rxdb.remoteAdapter$);
  const branchRepository = adapter.getRepository<typeof RxDBBranch, RemoteRxDBBranchRepository>(RxDBBranch);
  const changeRepository = adapter.getRepository<typeof RxDBChange, RemoteRxDBChangeRepository>(RxDBChange);
  return { branchRepository, changeRepository, adapter };
};

/**
 * 取当前分支；没有激活分支时激活（或新建）`main`。
 *
 * @param rxdb - RxDB 实例
 *
 * @remarks
 * 分两段是有意的：
 *
 * - **热路径**（已有激活分支）不开事务。同步链路里每条远端事件都要调它，把整段包进事务
 *   能修好并发，但会让每次读都去抢并发度 1 的写队列槽位。
 * - **冷路径**（查不到激活分支）才开事务，并在事务内**重做一遍检查**（双重检查）。
 *   否则两个并发调用会双双走到 `create`，第二个撞主键报错。
 */
export const getCurrentBranch = async (rxdb: RxDB): Promise<InstanceType<typeof RxDBBranch>> => {
  const { branchRepository, adapter } = await getLocalSystemRepositories(rxdb);
  const activeBranch = (
    await branchRepository.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'activated', operator: '=', value: true }]
      },
      limit: 1
    })
  )[0];

  if (activeBranch) {
    return activeBranch;
  }

  return adapter.transaction(async executor =>
    resolve_current_branch(executor.getRepository(RxDBBranch) as unknown as LocalRxDBBranchRepository, rxdb)
  );
};
