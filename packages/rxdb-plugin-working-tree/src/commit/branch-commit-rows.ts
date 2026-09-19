/**
 * @fileoverview 一条分支在提交侧的两行伴生记录（data-model.md §2.2/§2.5）
 *
 * @remarks
 * 一条 `rxdb_branch` 永远配一行 `CommitBranchRef` 与一行 `WorkingTreeState`。这个「永远」有
 * **三条**入口要满足，缺一处就会出现一条读得到、却在 `readCommitBranchRef()` 上抛错的分支：
 *
 * 1. 新库建表时随初始行一起写（`RxDB.ts` 的 `createTables`）；
 * 2. 既有库升级时由 `0004-working-tree-commits` 补写；
 * 3. **运行期 `createBranch()` 新建分支时**（`version/create-branch.ts`）。
 *
 * 前两条同源，第三条曾经漏掉——结果是 `createBranch()` 之后 `enable()` 永久失败，而
 * `working-tree-facade.ts` 承诺的「再调一次 `enable()` 就能补根」对这类分支从不成立。
 *
 * 所以这两行只此一处生成。`0004` 的初始行工厂另有两件事要做（发放整批代际、写两行单例），
 * 不能反过来给建分支复用；能共用的只有「一条分支长什么样」这一段，也正是这里。
 */

import type { EntityManager, EntityType, TransactionExecutor } from '@aiao/rxdb';
import { RxDBBranch, RxDBChange, RxDBError, uuid } from '@aiao/rxdb';
// 「这条源分支停在哪一笔变更上」全局只能有一个答案，与 `switchBranch` 同口径——
// `enable-migration.ts` 判可物化性时用的也是它。
import { get_branch_max_change } from '@aiao/rxdb-plugin-history';
import { allocateBranchGeneration } from '../working-tree/activation-state.js';
import { readWorkingTreeStateRow } from '../working-tree/capture-runtime.js';
import { WorkingTreeEntry } from '../working-tree/working-tree-entry.entity.js';
import { WorkingTreeMaterializationPage } from '../working-tree/working-tree-materialization-page.entity.js';
import { WorkingTreeMaterializationStage } from '../working-tree/working-tree-materialization-stage.entity.js';
import { WorkingTreeRestoreSession } from '../working-tree/working-tree-restore-session.entity.js';
import { WorkingTreeState } from '../working-tree/working-tree-state.entity.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import type { CommitPatchCodecContext } from './commit-codec.js';
import type { CommitWriteContext } from './commit-context.js';
import { readCommitBranchRef } from './list-commits.js';
import { writeCommit } from './write-commit.js';

/**
 * 造出一条分支的 ref 与工作树状态行（均未落库）。
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 分支 id；两行的主键都与它逐字相同
 * @param generation - 本条分支的不可变代际，由 `WorkingTreeActivationState.branchGenerationSeq` 发放
 * @returns 未落库的两行，调用方负责在**一个**事务里写下去
 *
 * @remarks
 * `headCommitId = null` 是「还没有根」，**不是**「空历史」：`enable()` 会据此给它补 baseline。
 * 提前伪造一个根等于宣称这条分支已经初始化过，`enable()` 就会跳过它。
 *
 * 代际由调用方发放而不是在这里自增：发放要改 `WorkingTreeActivationState` 那一行，
 * 而建行函数一旦开始写库，「造行」与「落库」的边界就没了，全有或全无也就无从谈起。
 */
export function createBranchCommitRows(
  entityManager: EntityManager,
  branchId: string,
  generation: number
): [CommitBranchRef, WorkingTreeState] {
  const ref = entityManager.instantiate(CommitBranchRef);
  ref.id = branchId;
  ref.branchId = branchId;
  ref.generation = generation;
  ref.headCommitId = null;
  ref.headRevision = 0;
  ref.status = 'ok';
  ref.corruptedAt = null;

  const state = entityManager.instantiate(WorkingTreeState);
  state.id = branchId;
  state.branchId = branchId;
  state.baseHeadCommitId = null;
  state.workingTreeRevision = 0;
  state.entryCount = 0;

  return [ref, state];
}

/**
 * 读一条分支的 ref；不在就连同工作树状态行一起补出来。
 *
 * @param executor - 调用方那个写事务的执行器
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 分支 id
 * @returns 已存在的那一行，或刚补出来的新行
 * @throws {@link RxDBError} 激活态行缺失时（由 `allocateBranchGeneration` 抛）
 *
 * @remarks
 * 这是**恢复路径**，不是常规路径：三条入口都写全之后，缺行只会出现在被旧版本
 * `createBranch()` 建过分支的那些库上。补行让 `working-tree-facade.ts` 承诺的
 * 「再调一次 `enable()` 就能补根」对它们重新成立——否则那些库只能靠手工改表脱困。
 *
 * 补出来的代际同样走 {@link allocateBranchGeneration} 发放，不是随手填一个：
 * 复用既有代际会让持旧 `(branchId, headRevision)` 的调用方误中这条分支（ABA）。
 *
 * **只给本地分支用。** 远端分支的 ref 属于远端那份提交图，本地补一行出来等于凭空
 * 宣称「这条远端分支在本地有一个空 HEAD」，下一次同步就会拿它去比对。
 */
export const ensureBranchCommitRows = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  branchId: string
): Promise<CommitBranchRef> => {
  const [existing] = await executor.getRepository(CommitBranchRef).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (existing) return existing;

  const rows = createBranchCommitRows(entityManager, branchId, await allocateBranchGeneration(executor));
  await executor.saveMany(rows);
  return rows[0];
};

/**
 * 新建分支写 `branch_baseline` 时的固定幂等键。
 *
 * @remarks
 * 常数而不是每次现造一个 uuid：幂等的全部依据就是「重试带同一个 id」，现造等于每次重试
 * 都是一次新提交。跨分支复用同一个值是安全的——真正的键由 `deriveCommitOperationId` 把它
 * 与本条分支**刚发放**的 `generation` 合成，而代际全局单调不复用
 * （与 `ENABLE_MIGRATION_OPERATION_ID` 同一条理由）。
 */
export const BRANCH_BASELINE_OPERATION_ID = 'rxdb.commit.branch-baseline.v1';

/**
 * `branch_baseline` 那一条写入用的 codec 上下文：两个解析器都直接抛。
 *
 * @remarks
 * {@link writeCommit} 要一份 {@link CommitWriteContext}，而贡献方手上只有 `EntityManager`：
 * 事务由核心的 `create_branch` 开，适配器不在这条路上，而 `createCommitWriteContext` 要的
 * `RxDB.localAdapterSync` 在**未连接**的库上还会抛。
 *
 * 能这么给的**唯一**依据是分支基线一个变更单元都没有（`units: []`），而
 * `assertCommitUnitsEncryptedAtRest` 是逐单元遍历的——零单元时一次都不会触到解析器。
 *
 * 所以这里放的是会抛的桩，不是把可选字段留空：留空的后果是「有值该判却静默放行」
 * （FR-038 要排除的正是这种 fail-open 形态），而抛错的后果是「这条路上冒出单元了」当场显形。
 */
const BRANCH_BASELINE_CODEC: CommitPatchCodecContext = {
  resolveTargetMetadata: (entity, namespace) => {
    throw new RxDBError(
      `分支基线不该携带任何变更单元，却要解析 ${namespace}.${entity} 的元数据：` +
        '这条路径的 units 恒为空，走到这里说明入参被改过，而 at-rest 判定也就随之失效了。'
    );
  }
};

/** 把本模块那份 fail-closed codec 与调用方的实体管理器拼成一次提交要的上下文。 */
const branchBaselineContext = (entityManager: EntityManager): CommitWriteContext => ({
  entityManager,
  codec: BRANCH_BASELINE_CODEC
});

/**
 * 读一条分支行；缺行抛错，不当成「没有父分支」。
 *
 * @remarks
 * `create_branch` 在调贡献方**之前**就把这一行 `create()` 进了同一个事务，所以读不到只有
 * 一种解释：调用方没走那条编排。把它读成「没有父分支」会让这条分支静默退化成一条孤立的
 * 新分支——而它本该继承源分支的 HEAD 与工作树，退化之后 `listCommits()` 一条都读不到。
 */
const readBranchRow = async (executor: TransactionExecutor, branchId: string): Promise<RxDBBranch> => {
  const [row] = await executor.getRepository(RxDBBranch).find({
    where: { combinator: 'and', rules: [{ field: 'id', operator: '=', value: branchId }] },
    limit: 1
  });
  if (!row) {
    throw new RxDBError(
      `分支 ${branchId} 的 rxdb_branch 行不在本事务里：writeBranchRows 只能由 create_branch 在写下分支行之后调用。`
    );
  }
  return row;
};

/**
 * 读一条分支当前全部未提交条目，按 `id` 升序。
 *
 * @remarks
 * 与 `commit-command.ts` 的 `readBranchEntries` 同一个排序理由：顺序交给后端自由决定的话，
 * 同一批条目在两个后端上复制出两种排列，而条目顺序是要进内容指纹的。
 */
const readBranchEntries = (executor: TransactionExecutor, branchId: string): Promise<WorkingTreeEntry[]> =>
  executor.getRepository(WorkingTreeEntry).find({
    where: { combinator: 'and', rules: [{ field: 'branchId', operator: '=', value: branchId }] },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });

/** 深拷一份 patch；`null` 原样穿过。 */
const clonePatch = (patch: Record<string, unknown> | null): Record<string, unknown> | null =>
  patch === null ? null : structuredClone(patch);

/**
 * 把源分支的一条未提交条目复制给新分支。
 *
 * @remarks
 * **id 重新签发**：沿用源 id 会让两条分支的条目撞主键，而
 * `['branchId','namespace','entity','entityId']` 那条唯一索引管不到这件事——它按分支分区。
 *
 * **`unitId` 逐字保留**：它上面没有唯一约束，而重新发号会把源分支上同属一次事务的几个单元
 * 拆成互不相干的几组，提交时它们不再进同一个序列。
 *
 * **`patch` / `inversePatch` 走 `structuredClone`**：抄引用的话，新分支上的一次折叠会就地改掉
 * 源分支那一行的补丁，两条分支的「未提交变更」从此是同一份数据，而没有任何一方会报错。
 * 不用 JSON 往返——那会把 `Date` / `Uint8Array` 一类值悄悄换成字符串。
 *
 * `createdAt` / `updatedAt` 一个都不赋：两列的默认值是 `CURRENT_TIMESTAMP`，抄源分支的时间戳
 * 等于宣称这条记录是那时写下的。
 */
const copyWorkingTreeEntry = (
  entityManager: EntityManager,
  source: WorkingTreeEntry,
  branchId: string
): WorkingTreeEntry => {
  const copy = entityManager.instantiate(WorkingTreeEntry);
  copy.id = uuid();
  copy.branchId = branchId;
  copy.unitId = source.unitId;
  copy.transactionId = source.transactionId;
  copy.namespace = source.namespace;
  copy.entity = source.entity;
  copy.entityId = source.entityId;
  copy.operation = source.operation;
  copy.patch = clonePatch(source.patch);
  copy.inversePatch = clonePatch(source.inversePatch);
  copy.fingerprint = source.fingerprint;
  copy.origin = source.origin;
  copy.sourceChangeId = source.sourceChangeId;
  return copy;
};

/**
 * 「从当前物化状态创建」那一支：共享源分支 HEAD，复制一份独立的工作树。
 *
 * @remarks
 * **不写任何 commit**。commit 是不可变的，两条分支指着同一个节点本来就不会互相影响；
 * 给新分支现造一个根节点则让同一段历史在库里有两条互不相交的链。
 *
 * **`headRevision` / `workingTreeRevision` 不继承，从 0 起**：两者都是 CAS 轴，继承之后
 * 「这个值是从哪条分支上捕获的」在数值上分辨不出来，而 CAS 的全部意义就是分辨它。
 *
 * **`entryCount` 取真正复制下来的条数**，不照抄源分支那一列：这一行的自洽只能由本次写入
 * 保证，照抄会把源分支上任何已有的漂移原样带进一条崭新的分支。
 */
const copyCurrentMaterialization = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  sourceBranchId: string,
  rows: readonly [CommitBranchRef, WorkingTreeState]
): Promise<void> => {
  const [ref, state] = rows;
  const sourceRef = await readCommitBranchRef(executor, sourceBranchId);
  const sourceState = await readWorkingTreeStateRow(executor, sourceBranchId);
  const entries = await readBranchEntries(executor, sourceBranchId);
  const copies = entries.map(entry => copyWorkingTreeEntry(entityManager, entry, ref.branchId));

  ref.headCommitId = sourceRef.headCommitId;
  // 抄的是源分支工作树**捕获时**的那个 HEAD，不是此刻的 `sourceRef.headCommitId`：
  // 复制过来的条目正是相对前者算出来的，换成后者等于给同一批 patch 换了个基准。
  state.baseHeadCommitId = sourceState.baseHeadCommitId;
  state.entryCount = copies.length;

  await executor.saveMany([ref, state, ...copies]);
};

/**
 * 「从历史分叉点创建」那一支：写一个 `kind=branch_baseline` 的无父根节点锚住它。
 *
 * @remarks
 * **不复制工作树**：历史点的物化状态与当下那些未提交改动无关——用户从一个旧 change 上开分支，
 * 本意正是把当前这些改动留在原地。
 *
 * **HEAD 走 {@link writeCommit} 那条 CAS，不另写第二条 UPDATE**：另写一条「建分支专用」的
 * 推进语句意味着 CAS 的 `generation` / `status` 两个条件会在这条路上被悄悄放宽，
 * 而放宽之后没有任何测试会红（见 `write-commit.ts` 的同一条注记）。
 *
 * 落 CAS 就**抛**而不是返回：两行刚写下、`headRevision` 还是 0，没有第二个调用方能合法地
 * 把它推走；真发生了就是编排出了错，整条 `create_branch` 必须回滚。
 */
const anchorBranchBaseline = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  rows: readonly [CommitBranchRef, WorkingTreeState]
): Promise<void> => {
  const [ref] = rows;
  await executor.saveMany([...rows]);
  const outcome = await writeCommit(executor, branchBaselineContext(entityManager), {
    branchId: ref.id,
    branchGeneration: ref.generation,
    expectedHeadRevision: ref.headRevision,
    kind: 'branch_baseline',
    message: null,
    author: null,
    operationId: BRANCH_BASELINE_OPERATION_ID,
    units: []
  });
  if (outcome.status === 'head_revision_conflict') {
    throw new RxDBError(
      `新分支 ${ref.id} 的分支基线丢了 HEAD CAS（期望修订 ${outcome.expectedHeadRevision}）：` +
        '这两行刚刚才写下，没有第二个调用方能合法地推走它，整条 create_branch 必须回滚重试。'
    );
  }
};

/**
 * 新建一条分支时，把它在提交侧的两行连同该继承的东西一并写下（FR-017）。
 *
 * @param executor - `create_branch` 那个写事务的执行器
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchId - 本次新建的分支 id
 * @throws {@link RxDBError} 分支行、激活态行、源分支的 ref 或状态行缺失时
 *
 * @remarks
 * 两条支线由**库里那两个值**判定，不看调用方用了哪个重载：分叉点
 * （`rxdb_branch.fromChangeId`）等于源分支 tip（两边都没有变更时同样算相等）就是
 * 「当前物化状态」，否则就是历史点。`create_branch` 在调本函数之前就把 `parentId` /
 * `fromChangeId` 写进了同一个事务，再顺着入参把同样两个值传一遍等于让同一件事有两份
 * 可以互相漂移的真相；而按「传没传第二个实参」判的话，`createBranch(b, 源分支tip的id)`
 * 与 `createBranch(b)` 会对同一个状态给出两种答案。
 *
 * 没有父分支的那条（`parentId` 为空）既没有可共享的 HEAD 也没有可复制的工作树，
 * 落下的就是 {@link createBranchCommitRows} 那两行原样——这不是兜底，是「无源可继承」。
 *
 * 代际在分流**之前**发放：两条支线都要用它，而 `branch_baseline` 那一支还要拿它做 CAS 条件
 * 与幂等键的一半。
 */
export const writeNewBranchCommitRows = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  branchId: string
): Promise<void> => {
  const branch = await readBranchRow(executor, branchId);
  // 代际从单调源发放，不是「当前分支数 + 1」：删过分支之后后者会复用旧号，
  // 持旧 `(branchId, headRevision)` 的调用方就会误中同名重建的新分支（ABA）。
  const rows = createBranchCommitRows(entityManager, branchId, await allocateBranchGeneration(executor));

  const parentId = branch.parentId ?? null;
  if (parentId === null) {
    await executor.saveMany([...rows]);
    return;
  }

  const sourceTip = await get_branch_max_change(executor.getRepository(RxDBChange), parentId);
  const forkPoint = branch.fromChangeId ?? null;
  if (forkPoint === (sourceTip ? sourceTip.id : null)) {
    await copyCurrentMaterialization(executor, entityManager, parentId, rows);
    return;
  }
  await anchorBranchBaseline(executor, entityManager, rows);
};

/**
 * 读一条分支在某张表上的全部行。
 *
 * @param executor - 调用方那个写事务的执行器
 * @param EntityClass - 要读的那张表
 * @param field - 这张表上挂靠分支的那一列
 * @param branchId - 分支 id
 * @returns 命中的行；一条没有时是空数组
 *
 * @remarks
 * 列名由调用方逐张指定，不在这里推断：六张表里 `WorkingTreeMaterializationStage` 挂的是
 * `targetBranchId`，按 `branchId` 一把梭会**静默读回空集**，而空集在删除路径上与
 * 「本来就没有」分辨不出来——漏删的那条 staging 要到同名重建之后才显形。
 */
const readBranchOwnedRows = <T extends EntityType>(
  executor: TransactionExecutor,
  EntityClass: T,
  field: string,
  branchId: string
): Promise<InstanceType<T>[]> =>
  executor.getRepository(EntityClass).find({
    where: { combinator: 'and', rules: [{ field, operator: '=', value: branchId }] }
  });

/**
 * 读出这批 staging 各自的全部分页。
 *
 * @param executor - 调用方那个写事务的执行器
 * @param stages - 已经读出来的 staging 行
 * @returns 命中的分页；`stages` 为空时直接是空数组，一条语句都不发
 *
 * @remarks
 * 一条 `in` 查完，不是逐条 staging 各查一次：一条分支正常只会有一条 staging，但
 * 「正常只有一条」不是约束，而按 id 一条条查会让删除成本随崩溃残留的条数线性增长。
 *
 * `stages` 为空时**不发那条 `in`**：空集合的 `IN ()` 在六个后端上语法各不相同，
 * 而这一步的答案已经确定了——没有 staging 就没有分页。
 */
const readStagePages = async (
  executor: TransactionExecutor,
  stages: readonly WorkingTreeMaterializationStage[]
): Promise<WorkingTreeMaterializationPage[]> => {
  if (stages.length === 0) return [];
  return executor.getRepository(WorkingTreeMaterializationPage).find({
    where: {
      combinator: 'and',
      rules: [{ field: 'stageId', operator: 'in', value: stages.map(stage => stage.id) }]
    }
  });
};

/**
 * 移除一条分支时，清掉本能力挂在它名下的全部可变状态（FR-044、data-model.md §2.5）。
 *
 * @param executor - 调用方那个写事务的执行器；与 `remove_branch` 删分支行用的是同一个
 * @param branchId - 即将被删、此刻仍在库里的分支 id
 * @returns 清理完成
 *
 * @remarks
 * 与 {@link writeNewBranchCommitRows} 严格对称：一条分支在本能力里占了哪几张表，只有这一个
 * 模块知道。加第十一张表时要改的也只有这里与建行那一半——分散到 `remove-branch.ts` 去写的话，
 * `rxdb-plugin-history` 就得认识 `WorkingTreeEntry`，而那个方向的 import 是条依赖环
 * （nx 的图插件把静态 import 直接映射成依赖边）。
 *
 * **十张表里删六张，另外四张逐张都有不删的理由：**
 *
 * - `Commit` / `CommitChangeSet`：FR-044 明文要求保留。两张表上都**没有** `branchId` 列
 *   （可达性走 ref），所以「删干净这条分支」一旦被理解成「删掉它能看见的一切」，
 *   删掉的就是别的分支也指着的节点，以及一个仍然可达的 commit 的内容——而 `changeSetCount`
 *   还写着原来的数，图校验从此永久报损坏。
 * - `WorkingTreeActivationState` / `CommitCapabilityState`：全库单例，不属于任何分支。
 *   跟着分支一起删掉之后，此后每一次 CAS 都取不到期望值，整个库再也提交不了。
 *
 * **代际单调源一个数都不动。** 删一条分支就把 `branchGenerationSeq` 减回去看起来非常合理
 * ——号又空出来了。代价正是 §2.5 要治的 ABA：同名重建拿回同一个代际，持旧
 * `(branchId, headRevision)` 的调用方会误中新分支，而 `deriveCommitOperationId` 派生出的
 * 提交幂等键也在同一刻与旧分支的那批重合。
 *
 * **不碰 `rxdb_branch` 那一行**：`remove_branch` 的「查子分支 → 查 change → 删」是一段有顺序的
 * 校验，分支行由它最后删。贡献方抢在前面删掉，那段校验读到的就是一条已经不存在的分支。
 *
 * 分页先于 staging 删，两次 `removeMany` 而不是一次：`getEntityMutations` 按实体分组，
 * 一次调用里的跨表顺序不由调用方决定，而分页对 staging 挂着一条真正的外键。
 * 剩下五张表之间没有互指的关系（它们都只指向 `rxdb_branch`，而那一行本次不删），合在一次里。
 */
export const removeBranchCommitRows = async (executor: TransactionExecutor, branchId: string): Promise<void> => {
  // 串行而非 `Promise.all`：`executor` 是一条并发度为 1 的队列，并行发起一点都不会更快，
  // 只是让读的次序取决于各 await 的排布，出问题时复现不出来。
  const ref = await readBranchOwnedRows(executor, CommitBranchRef, 'branchId', branchId);
  const state = await readBranchOwnedRows(executor, WorkingTreeState, 'branchId', branchId);
  const entries = await readBranchOwnedRows(executor, WorkingTreeEntry, 'branchId', branchId);
  const sessions = await readBranchOwnedRows(executor, WorkingTreeRestoreSession, 'branchId', branchId);
  // 这张表上**没有**指向 `rxdb_branch` 的关系，只有一个普通的 `targetBranchId` 列加一条索引：
  // 级联对它天然无效，于是「删分支行让数据库自己收尾」这种写法恰好只漏它。漏下来的是一条
  // `status='staged'`、指着一个已不存在的目标的 staging——同名重建之后它的目标 id 与新分支
  // 逐字相同，物化屏障会把它当成「上一次分页崩溃留下的现场」接着往下走。
  const stages = await readBranchOwnedRows(executor, WorkingTreeMaterializationStage, 'targetBranchId', branchId);

  const pages = await readStagePages(executor, stages);
  if (pages.length > 0) await executor.removeMany(pages);
  await executor.removeMany<EntityType>([...stages, ...sessions, ...entries, ...state, ...ref]);
};
