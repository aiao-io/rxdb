import type { IRepository } from '../repository/repository.interface.js';
import { RxDBError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';
import type { VersionManager } from './VersionManager.js';

export interface SyncBranchesResult {
  created: number;
  updated: number;
  total: number;
}

/** `pullBranches()` 交回来的形状里，本函数只依赖这三个字段。 */
interface RemoteBranchRow {
  id: string;
  parentId?: string | null;
}

/**
 * 把远端分支按「父在前」重排。
 *
 * `rxdb_branch.parentId` 是指向自己的外键，逐条落库时父必须先在库里。而 `pullBranches()`
 * 返回的数组**没有顺序保证** —— 远端按 `updatedAt`、按主键、按它高兴的任何顺序返回都合法，
 * 分页更是会把父子切到不同批次。所以顺序必须由本地重建，不能指望远端。
 *
 * 判定一个分支「可落库」的依据是它的父是否已经就绪：要么父本来就在本地，要么父在本批里
 * 且已排到它前面。反复扫描直到某一轮一条都排不出去 —— 剩下的就是父确实找不到
 * （远端删了父 / 父被分页切走）或互相成环，两者都无法安全落库。
 *
 * @param remoteBranches - 远端原样交回的分支数组，顺序不可信
 * @param localIds - 已在本地的分支 id，它们可以充当父
 * @returns 父一定排在子前面的新数组
 * @throws RxDBError 存在父分支缺失或互相成环的记录时。整批放弃优于留下孤儿：
 * 孤儿会被切分支时的「父节点缺失即当作到根」静默吞掉，损坏无声。
 */
function sortBranchesParentFirst<T extends RemoteBranchRow>(remoteBranches: T[], localIds: Set<string>): T[] {
  const resolved = new Set(localIds);
  // 本批自己带来的 id：用来把「父确实缺失」和「父只是还排在后面」区分开，好让报错说人话。
  const incoming = new Set(remoteBranches.map(branch => branch.id));
  const sorted: T[] = [];
  let pending = remoteBranches;

  while (pending.length > 0) {
    const ready = pending.filter(branch => {
      const parentId = branch.parentId ?? null;
      return parentId === null || resolved.has(parentId);
    });
    if (ready.length === 0) break;
    for (const branch of ready) {
      sorted.push(branch);
      resolved.add(branch.id);
    }
    pending = pending.filter(branch => !resolved.has(branch.id));
  }

  if (pending.length > 0) {
    const detail = pending
      .map(branch => {
        const parentId = branch.parentId ?? null;
        // 父在本批里却始终排不出去 = 成环；否则就是父压根不存在。
        const reason = parentId !== null && incoming.has(parentId) ? 'cycle' : 'missing parent';
        return `'${branch.id}' -> '${String(parentId)}' (${reason})`;
      })
      .join(', ');
    throw new RxDBError(`syncBranches: 远端分支拓扑无法解析，整批放弃：${detail}`);
  }

  return sorted;
}

/**
 * 从远程拉取所有分支信息并同步到本地
 *
 * 规则：
 * 1. 远程新分支 → 在本地创建（local: false, remote: true）
 * 2. 本地已有的远程分支 → 更新 remote 标记为 true
 * 3. 纯本地分支（remote=false）→ 不受影响
 *
 * @remarks
 * 读本地、排序、落库全部在**同一个事务窗口**内完成：
 *
 * - 无事务时中途失败会留下半批已提交的分支，下次重试撞主键，同步就此永久卡死；
 * - 读若在事务外做，快照与写之间存在窗口，并发建分支会让「本地已有」的判断过时，
 *   重复 create 同样撞主键。
 *
 * 事务体内只能用 `executor` 作用域的仓库。绑在适配器上的那一份走并发度 1 的写队列，
 * 在事务体内调用会排到自己这个事务后面 —— 直接死锁。
 */
export async function syncBranches(vm: VersionManager): Promise<SyncBranchesResult> {
  const { adapter: remoteAdapter } = await vm.getRemoteRepositories();

  if (!remoteAdapter.pullBranches) {
    return { created: 0, updated: 0, total: 0 };
  }

  const remoteBranches = await remoteAdapter.pullBranches();
  if (remoteBranches.length === 0) {
    return { created: 0, updated: 0, total: 0 };
  }

  const { adapter } = await vm.getLocalRepositories();

  return adapter.transaction(async executor => {
    const branchRepository = executor.getRepository(RxDBBranch) as unknown as IRepository<typeof RxDBBranch>;

    const localBranches = await branchRepository.find({
      where: { combinator: 'and', rules: [] }
    });
    const localMap = new Map(localBranches.map(b => [b.id, b]));

    let created = 0;
    let updated = 0;

    for (const remote of sortBranchesParentFirst(remoteBranches, new Set(localMap.keys()))) {
      const local = localMap.get(remote.id);
      if (!local) {
        await branchRepository.create({
          id: remote.id,
          activated: false,
          local: false,
          remote: true,
          fromChangeId: remote.fromChangeId ?? null,
          parentId: remote.parentId ?? null
        } as InstanceType<typeof RxDBBranch>);
        created++;
      } else if (!local.remote) {
        await branchRepository.update(local, { remote: true, updatedAt: new Date() });
        updated++;
      }
    }

    return { created, updated, total: remoteBranches.length };
  });
}
