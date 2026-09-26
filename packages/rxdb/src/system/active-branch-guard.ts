/**
 * @fileoverview active 分支的基数不变量：恰好一个（FR-048，契约见 contracts/core-api.md §7）
 *
 * @remarks
 * 「恰好一个」被拆成两半分别落地，是因为**没有任何一半能单独成立**：
 *
 * - **至多一个**只有 schema 拦得住。运行期守卫再严，也只能在两行都写进去**之后**发现，
 *   而那时数据库已经处在它本该阻止的状态里——两个 Tab 各自 `switchBranch` 的竞态就是
 *   这么产生的。这一半由 `RxDBBranch.activeKey` 的可空唯一列承担（`system/branch.ts`）：
 *   `NULL` 不参与唯一比较，于是「至多一行非 NULL」在 PostgreSQL 与全部 SQLite 绑定上
 *   语义一致，不需要各后端写方言化的部分索引。
 * - **至少一个**只有运行期拦得住。「没有 active 分支」是一张**空表**也满足的条件，
 *   任何列约束都表达不了。这一半由本模块的两个入口承担。
 *
 * **两个入口不是严格程度之分，是时点之分。** {@link resolveSingleActiveBranch} 只给
 * 首次启用迁移用：那是唯一一个「库里还没有 active 分支」属于正常状态的时刻，所以它
 * 沿用既有 `resolve_current_branch` 的恢复语义。{@link assertSingleActiveBranch} 给运行期
 * 用，零 active 一律拒绝——把修复搬到连接路径上，意味着某个 Tab 的 `activated` 行因故
 * 消失时用户被静默挪到 `main`：他的未提交条目还挂在 `feature-x` 上，界面却显示一个
 * 干净的空工作树。
 *
 * **不复用 `version/resolve-current-branch.ts`。** 它的两条查询都带 `limit: 1`，两行
 * active 会被安静地读成一行——「按查询顺序猜一个」正是 FR-048 点名禁止的行为。本模块
 * 的查询**一律不带 `limit`**：基数本身就是要判定的东西，用 `limit` 去读它等于先把答案
 * 截断再问答案是多少。
 *
 * 既然 schema 兜住了至多一个，为什么还留多 active 的拒绝路径？因为约束是在**既有库**上
 * 补的：迁移跑之前那张表可能已经有两行 active。约束加不上去，得先让迁移认出来并整体
 * 回滚，而不是让建索引语句抛一个没有上下文的原生错误。
 */

import type { EntityManager } from '../entity/entity-manager.js';
import { RxDBError } from '../RxDBError.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { RxDBBranch } from './branch.js';

/**
 * 写进 active 分支 `activeKey` 列的哨兵值。
 *
 * @remarks
 * 它是**常量**，不是分支 id。存 id 会让「谁是 active」有两份写法（data-model.md §2.2
 * 明确禁止复制第二份 active branch ID），而且唯一约束会当场退化成「每个分支至多激活
 * 一次」——两个分支同时 active 照样写得进去，约束等于没加。
 *
 * 值取一个不可能与分支 id 撞上的形状：分支 id 由用户命名，而 `*` 不是合法的命名字符。
 */
export const ACTIVE_BRANCH_KEY = '*active*';

/**
 * 分支 id 里被保留、因而一律不许出现的字符。
 *
 * @remarks
 * {@link ACTIVE_BRANCH_KEY} 的安全性建立在「分支 id 里不会出现 `*`」之上。这句话在
 * 加校验之前**只是注释**：创建与导入路径没有任何一处兑现它，一条名叫 `*active*`
 * 的用户分支能直接写进 `id` 列，再由 `activeKey` 的唯一约束把两件毫不相干的事
 * 撞在一起——错误信息会指向唯一约束，而真正的原因在几百行外的哨兵形状上。
 *
 * 禁的是**字符**不是那一个值：只拒 `'*active*'` 的话，`'*active'` / `'active*'`
 * 照样进得来，它们撞不上唯一约束，但会让任何按「带不带 `*`」区分哨兵与用户数据的
 * 读者（含两个后端 `switch_branch` 里对 `activeKey` 的裸 SQL 比较）读出两种答案。
 *
 * 它防的是**碰撞**（用户无意间起了个撞车的名字），不是**攻击**（存心去撞哨兵的调用方）：
 * 后者的前提是已经能直写系统表，到那一步唯一约束是谁都无所谓了
 * （`docs/working-tree/threat-model.md` §5）。
 */
const RESERVED_BRANCH_ID_CHAR = '*';

/**
 * 分支 id 不可用时抛出。
 *
 * @remarks
 * 独立错误类型而不是裸 {@link RxDBError}：调用方要能把「这个名字不能用」与
 * 「这个名字已经被占了」分开处理——前者改名就行，后者得先问清楚占用它的是谁。
 */
export class InvalidBranchIdError extends RxDBError {
  constructor(
    /** 被拒的分支 id，原样带上 */
    readonly branchId: string,
    reason: string
  ) {
    super(`Branch id (${branchId}) is not usable: ${reason}`);
    this.name = 'InvalidBranchIdError';
    // `RxDBError` 的构造器把原型钉回 `RxDBError.prototype`，子类必须在自己这边钉回来，
    // 否则 `instanceof InvalidBranchIdError` 恒为 false。同文件另两个错误类同此手法。
    Object.setPrototypeOf(this, InvalidBranchIdError.prototype);
  }
}

/**
 * 校验分支 id 可用，不可用即抛。
 *
 * @param branchId - 待校验的分支 id
 *
 * @throws {@link InvalidBranchIdError} id 为空 / 纯空白 / 含保留字符 `*` 时
 *
 * @remarks
 * 放在哨兵常量**同一个文件**里，是因为它兑现的正是 {@link ACTIVE_BRANCH_KEY} 那段
 * TSDoc 立下的承诺。拆到 `version/create-branch.ts` 之类的调用点旁边，改哨兵形状的人
 * 就看不到这条规则了，而那恰恰是唯一需要同步改的时刻。
 *
 * 校验点是**创建与导入边界**，不是每次读写：id 一旦落库就不再变，在读路径上重复校验
 * 只会把「历史遗留的坏数据」变成「整个库打不开」。已经躺在库里的坏 id 由
 * {@link assertSingleActiveBranch} 那条基数不变量兜底。
 */
export const assertUsableBranchId = (branchId: string): void => {
  if (branchId.trim().length === 0) throw new InvalidBranchIdError(branchId, 'id 不能为空或纯空白');
  if (branchId.includes(RESERVED_BRANCH_ID_CHAR)) {
    throw new InvalidBranchIdError(branchId, `'${RESERVED_BRANCH_ID_CHAR}' 是 active 哨兵保留字符`);
  }
};

/**
 * 根分支（也是零 active 时的恢复目标）的分支 id。
 *
 * @remarks
 * 恢复目标必须是**确定**的：库里通常有 `feature-x`，挑它比建 `main` 更「聪明」，
 * 但那是在替用户做一次分支切换。
 *
 * 与 {@link ACTIVE_BRANCH_KEY} 一样**必须**出现在公开面上，理由也一样：认这个 id 的地方
 * 有一半是裸 SQL——两个后端的 `read_current_branch_id` 把它当零 active 时的兜底谓词
 * （`WHERE id = 'main'`）、`create_tables_sql` 把它拼进新表的变更触发器、`migrate_system_schema`
 * 用它收敛 activeKey 基数。各自抄一份字面量的话，某一端拼错了不会有编译错误，只会让那一端
 * 认另一条分支当根：变更记到不存在的分支名下、零 active 的库恢复出第二个 main。
 *
 * 值本身不参与任何格式约定（不像哨兵键那样架在「分支 id 里没有 `*`」之上）：
 * 它就是一个普通的合法分支 id，只是被默认占用了。
 */
export const MAIN_BRANCH_ID = 'main';

/**
 * {@link resolveSingleActiveBranch} 建 `main` 时需要的最小能力。
 *
 * @remarks
 * 收窄成结构类型而不是直接收 `RxDB`，是为了让首次启用迁移能调它——迁移手里只有
 * `EntityManager`（见 `commit/enable-migration.ts` 的入参），没有 `RxDB` 实例。
 * `RxDB` 结构上满足本接口，两处调用方共用同一份实现。
 */
export interface ActiveBranchEntityHost {
  /** 用来 `instantiate(RxDBBranch)` */
  readonly entityManager: EntityManager;
}

/**
 * `RxDBBranch.activated` 有多行为真。
 *
 * @remarks
 * 首次启用迁移命中即**整条迁移回滚**（FR-048）。守卫自己**不**「挑一个留下」：
 * 两行 active 时「当前分支是谁」没有答案，猜错的那一半会被当成另一条分支的历史写进
 * 提交图，而用户看不到任何异常。
 *
 * 携带的只有分支 id——诊断要回答的是「哪两条打架」，不是它们里面有什么。
 */
export class AmbiguousActiveBranchError extends RxDBError {
  /**
   * 稳定错误码，恒为 `'ambiguous_active_branch'`
   *
   * @remarks
   * 字面量而非 `CommitErrorCode.ambiguous_active_branch`：那张码表随提交能力走进
   * `@aiao/rxdb-plugin-working-tree`，而本守卫是分支拓扑不变量、留在核心。核心为了
   * 一个字符串反向依赖插件，等于把「不装插件」这件事又变成不可能。
   *
   * 两边不会漂：码表是 const 对象不是 `enum`（见插件侧 `commit-error-codes.ts` 自陈的
   * 理由），成员的静态类型就是普通字符串字面量，因此本字面量与 `CommitErrorCode` 逐值兼容；
   * 且码表那侧有一条钉死键值逐字相同的测试。
   */
  readonly code = 'ambiguous_active_branch';

  constructor(
    /** 全部 active 分支的 id，已按字典序排好 */
    readonly branchIds: readonly string[]
  ) {
    super(`Exactly one branch must be active, found ${branchIds.length}: ${branchIds.join(', ')}.`);
    this.name = 'AmbiguousActiveBranchError';
    Object.setPrototypeOf(this, AmbiguousActiveBranchError.prototype);
  }
}

/**
 * 运行期一行 active 分支都没有。
 *
 * @remarks
 * **不**顺手激活 `main`。见本模块 fileoverview：静默挪分支比失败难排查得多，
 * 因为它不产生任何错误，只产生一个看起来正常、内容却对不上的界面。
 */
export class NoActiveBranchError extends RxDBError {
  /** 稳定错误码，恒为 `'no_active_branch'`；字面量的理由见 {@link AmbiguousActiveBranchError.code} */
  readonly code = 'no_active_branch';

  constructor() {
    super('Exactly one branch must be active, found none.');
    this.name = 'NoActiveBranchError';
    Object.setPrototypeOf(this, NoActiveBranchError.prototype);
  }
}

/**
 * 读出全部 active 分支。
 *
 * @param executor - 调用方那个事务的执行器
 * @returns 全部 `activated === true` 的分支，顺序由后端决定
 *
 * @remarks
 * **刻意不带 `limit`**，理由见本模块 fileoverview。也不带 `orderBy`：调用方要的是基数，
 * 而需要顺序的地方（错误里的 id 列表）自己排，不依赖后端的默认顺序。
 */
const readActiveBranches = async (executor: TransactionExecutor): Promise<RxDBBranch[]> =>
  executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'activated', operator: '=', value: true }] }
  });

/**
 * 把「有几行 active」折成「那一行 / 一行都没有」，多行直接拒。
 *
 * @param branches - {@link readActiveBranches} 的结果
 * @returns 唯一那行；一行都没有时为 `null`
 * @throws {@link AmbiguousActiveBranchError} 多于一行时
 *
 * @remarks
 * 两个入口对「多行」的处理完全一致，对「零行」才分道扬镳，所以分歧点留给调用方，
 * 共识部分收在这里——否则「多行怎么办」会有两份答案，而它们必须永远相同。
 */
const singleActiveOf = (branches: readonly RxDBBranch[]): RxDBBranch | null => {
  if (branches.length === 1) return branches[0];
  if (branches.length === 0) return null;
  throw new AmbiguousActiveBranchError(branches.map(branch => branch.id).sort());
};

/**
 * 把 `main` 置为 active：有就激活它，没有就建一个。
 *
 * @param executor - 迁移那个事务的执行器
 * @param host - 建分支时用来 `instantiate`
 * @returns 已激活的 `main`
 *
 * @remarks
 * 两条路径都**同时**写 `activated` 与 `activeKey`。冗余列是第二份真相的温床
 * （`Commit.firstParentId` 的 TSDoc 原话）：漏写一处，那一行就绕过了唯一约束，
 * 而 schema 那一半的保护正好是在这种漏写上失效的。
 */
const activateMainBranch = async (executor: TransactionExecutor, host: ActiveBranchEntityHost): Promise<RxDBBranch> => {
  const repository = executor.getRepository(RxDBBranch);
  const existing = await repository.find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: MAIN_BRANCH_ID }] }
  });
  if (existing.length > 0) {
    return repository.update(existing[0], { activated: true, activeKey: ACTIVE_BRANCH_KEY });
  }
  const branch = host.entityManager.instantiate(RxDBBranch);
  branch.id = MAIN_BRANCH_ID;
  branch.activated = true;
  branch.activeKey = ACTIVE_BRANCH_KEY;
  branch.local = true;
  branch.remote = false;
  return repository.create(branch);
};

/**
 * **只给首次启用迁移用**：读出唯一的 active 分支，零 active 时恢复到 `main`。
 *
 * @param executor - 迁移那个事务的执行器
 * @param host - 需要新建 `main` 时用来 `instantiate`
 * @returns 唯一的 active 分支
 * @throws {@link AmbiguousActiveBranchError} 有多行 active 时；**一行都不改**，
 *   由调用方回滚整条迁移
 *
 * @remarks
 * 它比 {@link assertSingleActiveBranch} 多收一个参数，而那个参数正是「能不能修」的全部
 * 区别：拿不到 `instantiate` 就建不出分支。这不是风格问题——多一个参数，就多一条
 * 「顺手修一下」的路，而 FR-048 把恢复语义**限定在首次迁移**。
 */
export const resolveSingleActiveBranch = async (
  executor: TransactionExecutor,
  host: ActiveBranchEntityHost
): Promise<RxDBBranch> => {
  const active = singleActiveOf(await readActiveBranches(executor));
  if (active) return active;
  return activateMainBranch(executor, host);
};

/**
 * 运行期校验：必须**恰好**一行 active；不修复任何东西。
 *
 * @param executor - 调用方那个事务的执行器
 * @returns 唯一的 active 分支
 * @throws {@link NoActiveBranchError} 一行 active 都没有时——即使 `main` 就在库里
 * @throws {@link AmbiguousActiveBranchError} 有多行 active 时
 *
 * @remarks
 * 签名里没有建分支的手段，是有意为之：它**拿不到** `instantiate`，于是「顺手激活 `main`」
 * 这条捷径在类型层面就走不通。
 */
export const assertSingleActiveBranch = async (executor: TransactionExecutor): Promise<RxDBBranch> => {
  const active = singleActiveOf(await readActiveBranches(executor));
  if (!active) throw new NoActiveBranchError();
  return active;
};
