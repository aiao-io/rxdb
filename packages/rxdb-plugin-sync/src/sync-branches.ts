import {
  assertUsableBranchId,
  InvalidBranchIdError,
  RxDBBranch,
  RxDBChange,
  RxDBError,
  type IRepository
} from '@aiao/rxdb';
import { toLocalFromChangeId } from './branch-change-id.js';
import type { SyncManager } from './SyncManager.js';

/**
 * {@link SyncManager.syncBranches} 一轮的结果。
 *
 * @remarks
 * `created + updated + skipped.length` 不一定等于 `total`：本地已有、且早已标了 `remote` 的
 * 分支既不计 `updated`，也不进 `skipped`。
 */
export interface SyncBranchesResult {
  /** 本轮在本地新建的远端分支数。 */
  created: number;
  /** 本地已有、本轮补上 `remote: true` 标记的分支数。 */
  updated: number;
  /** 远端本轮交回的分支总数，含被跳过的。 */
  total: number;

  /**
   * 本轮**未创建**的远端分支 id —— 具体原因见同一个 id 在 {@link skipReasons} 里的条目。
   *
   * 一条分支被跳过，可能是它自己的问题（id 不可用、或分叉点变更还没拉到本地翻译不出本地
   * id），也可能单纯因为它的父本轮被跳过——后一种情形下这条分支自身完全合格，但父本轮
   * 不会落库，若仍然照常创建，它的 `parentId` 就是一条指向「本轮不存在的父」的悬空外键
   * （`rxdb_branch.parentId` 是 `PRAGMA defer_foreign_keys` 延迟到 COMMIT 才检查的外键，
   * 届时会回滚整个事务，连同本轮所有本该成功的分支）。三种成因统一走同一条 `skipped`
   * 通道，因为对调用方而言处理方式是一样的：这个 id 本轮没有对应的本地分支，仅此而已。
   *
   * **跳过不留持久标记**：每轮都全量重拉远端分支、从头再判一遍，`skipped` 与
   * {@link skipReasons} 只报这一轮。`unresolved-from-change-id` 在分叉点变更拉到本地后自愈，
   * 挂在它下面的 `ancestor-skipped` 随之自愈；`invalid-id` 则远端不改就每轮重拉、重跳，
   * 一直占位——调用方要区分这两类，看 {@link skipReasons}。要不要记一个持久的「已知坏行」
   * 标记，登记在 `requirements/roadmap.md`「epic-006 评审顺延的架构项」。
   */
  skipped: string[];

  /**
   * `skipped` 里每一个 id 对应的具体跳过原因；key 覆盖 `skipped` 的每一项，一一对应。
   *
   * 单开一个字段而不是把原因塞进 `skipped` 数组本身：`skipped: string[]` 这个形状已经被
   * 外部当「id 列表」消费，改成对象数组是破坏性变更；`Record<id, reason>` 是纯增量，
   * 只读 `skipped` 的既有调用方不受影响。
   */
  skipReasons: Record<string, SyncBranchSkipReason>;
}

/**
 * 一条远端分支本轮被跳过的具体原因。
 *
 * @remarks
 * 三种成因互斥——处理顺序保证每条被跳过的分支只会落进其中一种：
 * - `invalid-id`：分支自己的 id 落不进本地 `rxdb_branch.id`（见 {@link isUsableBranchId}）。
 * - `unresolved-from-change-id`：分叉点变更还没拉到本地，`fromChangeId` 翻译不出本地 id。
 * - `ancestor-skipped`：分支自身没有问题，但它的**直接父**本轮已经被跳过（不管父是因为
 *   哪一种成因被跳的）。`ancestorId` 记的是那个直接父的 id，不是链路最顶端的根因——
 *   要追根因，沿 `skipReasons[ancestorId]` 递归上溯，直到查到的原因不再是
 *   `ancestor-skipped` 为止。
 */
export type SyncBranchSkipReason =
  | { readonly cause: 'invalid-id' }
  | { readonly cause: 'unresolved-from-change-id' }
  | { readonly cause: 'ancestor-skipped'; readonly ancestorId: string };

/** `pullBranches()` 交回来的形状里，本函数只依赖这三个字段。 */
interface RemoteBranchRow {
  id: string;
  parentId?: string | null;
}

/**
 * 远端分支 id 能否落进本地 `rxdb_branch.id`。
 *
 * @remarks
 * 判定口径**只有**核心 {@link assertUsableBranchId} 一份——这里把它的抛错翻成布尔，
 * 不是第二份规则。各写一遍的话，核心哪天多禁一个字符，同步这条导入路径会静默放行。
 *
 * 只吞 {@link InvalidBranchIdError}：别的异常说明校验自身坏了，那不是「这条远端行不合格」，
 * 不该被记成一次 `skipped`。
 */
function isUsableBranchId(branchId: string): boolean {
  try {
    assertUsableBranchId(branchId);
    return true;
  } catch (error) {
    if (error instanceof InvalidBranchIdError) return false;
    throw error;
  }
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
export async function syncBranches(sm: SyncManager): Promise<SyncBranchesResult> {
  const { adapter: remoteAdapter } = await sm.getRemoteRepositories();

  if (!remoteAdapter.pullBranches) {
    return { created: 0, updated: 0, total: 0, skipped: [], skipReasons: {} };
  }

  const remoteBranches = await remoteAdapter.pullBranches();
  if (remoteBranches.length === 0) {
    return { created: 0, updated: 0, total: 0, skipped: [], skipReasons: {} };
  }

  const { adapter } = await sm.getLocalRepositories();

  return adapter.transaction(async executor => {
    const branchRepository = executor.getRepository(RxDBBranch) as unknown as IRepository<typeof RxDBBranch>;
    const changeRepository = executor.getRepository(RxDBChange) as unknown as IRepository<typeof RxDBChange>;

    const localBranches = await branchRepository.find({
      where: { combinator: 'and', rules: [] }
    });
    const localMap = new Map(localBranches.map(b => [b.id, b]));

    let created = 0;
    let updated = 0;
    const skipped: string[] = [];
    const skipReasons: Record<string, SyncBranchSkipReason> = {};
    // 本轮已跳过的分支 id。级联判断（下面对 `remoteParentId` 的检查）只能靠它，不能靠
    // `localMap`——`localMap` 是本轮开始前的快照，而分支已经按父优先的拓扑序处理
    // （`sortBranchesParentFirst`），父的跳过决定必然先于子被记录进这个集合。
    const skippedThisRound = new Set<string>();

    /**
     * 记一次跳过：本函数三处跳过点（id 不可用 / 分叉点翻译不出 / 祖先已跳过）共用同一套
     * 记账。不分渠道是有意为之——不管一条分支这一轮为什么建不出来，它的后代都同样不能
     * 创建，记账收敛成一个函数，下面对 `skippedThisRound` 的级联检查才能对三种成因
     * 一次性生效，不用每加一种跳过原因就多写一遍级联判断。
     */
    const recordSkip = (branchId: string, reason: SyncBranchSkipReason): void => {
      skipped.push(branchId);
      skipReasons[branchId] = reason;
      skippedThisRound.add(branchId);
    };

    for (const remote of sortBranchesParentFirst(remoteBranches, new Set(localMap.keys()))) {
      // 子分支连带跳过必须最先判断：父本轮不会落库，子无论自身是否「合格」都不能创建——
      // 创建了就是一条指向「本轮不存在的父」的悬空外键，真实落库会在 COMMIT 时被
      // `PRAGMA defer_foreign_keys` 卡住，回滚整个事务（连同本轮所有本该成功的分支）。
      // 父是因为 id 不可用被跳的、还是分叉点翻译不出被跳的、还是它自己的父被跳的，
      // 这里都不关心——`skippedThisRound` 不区分渠道，只认「本轮是否已经决定跳过」。
      const remoteParentId = remote.parentId ?? null;
      if (remoteParentId !== null && skippedThisRound.has(remoteParentId)) {
        recordSkip(remote.id, { cause: 'ancestor-skipped', ancestorId: remoteParentId });
        continue;
      }

      // 远端分支行是外来数据，它的 id 没走过本地那条创建路径。不校验就直接落库，
      // 一条叫 `*active*` 的远端分支会与 active 哨兵同形（`system/active-branch-guard.ts`）。
      //
      // 跳过而不是整批放弃：`skipped` 这条通道本来就是为「这一行本轮落不了库，别的行照常」
      // 准备的。整批抛错会让一条坏的远端行把整个同步卡死，而本地这边一点办法都没有。
      if (!isUsableBranchId(remote.id)) {
        recordSkip(remote.id, { cause: 'invalid-id' });
        continue;
      }

      const local = localMap.get(remote.id);
      if (local) {
        if (!local.remote) {
          await branchRepository.update(local, { remote: true, updatedAt: new Date() });
          updated++;
        }
        continue;
      }

      // 远端 change id 必须翻译成本地 id 才能写进本地分支行
      const remoteFromChangeId = remote.fromChangeId ?? null;
      const fromChangeId =
        remoteFromChangeId === null ? null : await toLocalFromChangeId(changeRepository, remoteFromChangeId);
      if (remoteFromChangeId !== null && fromChangeId === null) {
        recordSkip(remote.id, { cause: 'unresolved-from-change-id' });
        continue;
      }

      await branchRepository.create({
        id: remote.id,
        activated: false,
        // 显式写 NULL 而不是留空：两列必须同进同出（`system/branch.ts`）。
        // 留空在两个后端上**眼下**也落成 NULL，但那是默认值的巧合，不是这一行的意图。
        activeKey: null,
        local: false,
        remote: true,
        fromChangeId,
        parentId: remote.parentId ?? null
      } as InstanceType<typeof RxDBBranch>);
      created++;
    }

    return { created, updated, total: remoteBranches.length, skipped, skipReasons };
  });
}
