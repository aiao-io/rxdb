/**
 * @fileoverview 激活态单行的建行、初始化与读取（FR-052，data-model.md §2.2）。
 *
 * @remarks
 * 本模块管这一行的建行、读取，以及 `branchGenerationSeq` 的发放。
 * **`activationRevision` 的递增不在这里**——switch branch 成功后的 `+1` 归 US-308
 * （`activation-cas.ts`），写路径的 token 校验归 US-306 阶段 A。把递增顺手写在这里的话，
 * 两个故事会各自持有一份「怎么算下一个 revision」，而 CAS 的全部意义就是只有一份。
 *
 * `branchGenerationSeq` 则相反：§2.2 的口径就是「create branch 时 +1 并取用」，
 * 发放点只有一个（{@link allocateBranchGeneration}），所以它留在这一行的属主模块里。
 * 让 `create_branch` 自己读出来加一再写回，等于把单调性的保证摊给每一个调用方。
 *
 * **没有第二份 active branch ID。** 当前分支的唯一真相仍是 `rxdb_branch.activated`
 * （`system/branch.ts`）。往这张表上再挂一个 `activeBranchId` 看起来非常合理——
 * 切分支时反正要写这一行——代价是两份真相从此各自漂移，而漂移之后没有任何一方
 * 能证明自己是对的。
 *
 * **也没有「连接时自动读一遍」。** FR-052 要的是「连接时**可**读」，不是「连接时**必**读」：
 * 未启用提交能力的数据库必须与 v3 行为完全一致（FR-046），而在它的连接路径上插一次
 * 工作树表的读取，本身就是一处行为差异。需要这一行的命令各自在自己的写事务里读。
 */

import type { EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { getEntityMetadata, RxDBError, sqlStringLiteral } from '@aiao/rxdb';
import { createColumnOf } from '../entity-column.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from './working-tree-activation-state.entity.js';

/** `WorkingTreeActivationState` 里参与代际发放的那两列。 */
type WorkingTreeActivationStateColumn = 'id' | 'branchGenerationSeq';

const columnOf = createColumnOf<WorkingTreeActivationStateColumn>('WorkingTreeActivationState');

/**
 * 激活态单行的只读视图。
 *
 * @remarks
 * 刻意不复用实体类：实体实例带着 `save()` 之类的可写形态，而这一行的每一次改动
 * 都必须走 CAS（US-308），没有任何一条路径应该「读出来改一下再存回去」。
 *
 * 字段就这两个。**不得**增加 `activeBranchId`——理由见本文件 `@fileoverview`。
 */
export interface WorkingTreeActivationInfo {
  /** 激活态 revision；switch branch CAS 成功后 +1（递增归 US-308） */
  readonly activationRevision: number;
  /** 分支代际单调源；create branch 时 +1 并取用，因此首个签发的代际是 1 */
  readonly branchGenerationSeq: number;
}

/**
 * 行不在时的错误文案。
 *
 * @remarks
 * 与能力行缺失同理（`commit/commit-capability.ts`）：这是「`0004` 迁移没跑完」的现场。
 * 带上迁移名，是为了让人不必读代码就知道该去查哪一条迁移。
 */
const MISSING_ACTIVATION_ROW =
  `工作树激活态行缺失（id='${WORKING_TREE_ACTIVATION_STATE_ID}'）：` +
  '迁移 0004-working-tree-commits 建了表但没写入这一行，或它被外部删除了。' +
  '这不是「revision 为 0」，不能按 0 继续。';

/**
 * 造出激活态初始行（未落库）。
 *
 * @param entityManager - 用于 `instantiate()` 的实体管理器
 * @param branchGenerationSeq - 已发放到的分支代际号；新库为 0，既有库为迁移里补发的分支数
 * @returns 未落库的实例，调用方负责在**一个**事务里写下去
 *
 * @remarks
 * 新库（`createTables()`）与既有库（`0004` 迁移）都经 `createWorkingTreeCommitsInitialRows()`
 * 调到这里，因此两条路径的初始值逐字段相同。各写一份 `activationRevision = 0` 的话，
 * 改动其一就会产生「新建的库」与「升上来的库」两种库。
 *
 * `branchGenerationSeq` 必须**续上**已发放到的号而不是重新从 0 起：写 0 会让下一次
 * create branch 发出代际 1，与迁移里第一个既有分支撞号，持旧 `(branchId, headRevision)`
 * 的调用方会误中新分支（ABA）。
 */
export function createWorkingTreeActivationRow(
  entityManager: EntityManager,
  branchGenerationSeq: number
): WorkingTreeActivationState {
  const row = entityManager.instantiate(WorkingTreeActivationState);
  row.id = WORKING_TREE_ACTIVATION_STATE_ID;
  // 0 是唯一合法初值：revision 的意义完全来自「与上一次读到的值相等」，起点是几不重要，
  // 但两条建库路径必须是同一个几。
  row.activationRevision = 0;
  row.branchGenerationSeq = branchGenerationSeq;
  return row;
}

/**
 * 读激活态单行。
 *
 * @param executor - 当前事务执行器
 * @returns 激活态视图
 * @throws {@link RxDBError} 激活态行缺失时
 *
 * @remarks
 * 按**常量主键**过滤，不取 `find()` 的第一条：单行表上「第一行」永远正确，要到某次
 * 误写入第二行才炸，而那时 revision 已经开始漂移了。
 *
 * 缺行**抛错**，不返回 0，也**不自愈补行**。返回 0 会把「这一行不见了」和「这个库刚建好」
 * 混成同一个答案，代价在 US-308 才显形——CAS 拿一个编造出来的 0 去比对，命中与否都不再
 * 有意义。自愈则更糟：它把 `0004` 没跑完这件事永久掩埋，且补出来的
 * `branchGenerationSeq = 0` 会让下一个新分支与既有分支撞号。
 */
export const readWorkingTreeActivationState = async (
  executor: TransactionExecutor
): Promise<WorkingTreeActivationInfo> => {
  const [row] = await executor.getRepository(WorkingTreeActivationState).find({
    where: {
      combinator: 'and',
      rules: [{ field: 'id', operator: '=', value: WORKING_TREE_ACTIVATION_STATE_ID }]
    },
    limit: 1
  });
  if (!row) throw new RxDBError(MISSING_ACTIVATION_ROW);
  return { activationRevision: row.activationRevision, branchGenerationSeq: row.branchGenerationSeq };
};

/**
 * 拼那条发放语句：把代际就地 +1。
 *
 * @param tableRef - 由 executor 解析出来的物理表引用
 * @returns 单条 UPDATE
 *
 * @remarks
 * `SET seq = seq + 1` 而不是 `SET seq = <算好的数>`：后者那个数只能来自一次自读，
 * 于是两条并发的 create branch 会读到同一个当前值、写下同一个新号，而代际的全部意义
 * 就是**永不复用**。让库自己做那一步加法，新号是什么由行锁决定。
 *
 * WHERE 里只有主键那一条。多钉一条 `seq = ?` 就退回成 CAS，而这里没有调用方给的期望值
 * 可用——唯一能填的仍是自读来的数，于是 CAS 永远命中，多出来的只有「看起来比过了」。
 */
const buildBranchGenerationAdvance = (tableRef: string): string => {
  const metadata = getEntityMetadata(WorkingTreeActivationState);
  const seq = columnOf(metadata, 'branchGenerationSeq');
  return [
    `UPDATE ${tableRef}`,
    `SET ${seq} = ${seq} + 1`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(WORKING_TREE_ACTIVATION_STATE_ID)}`
  ].join(' ');
};

/**
 * 拼那条读回语句：把刚发放到的号从库里取出来。
 *
 * @param tableRef - 由 executor 解析出来的物理表引用
 * @returns 单条 SELECT，只取一列
 *
 * @remarks
 * **不走 {@link readWorkingTreeActivationState}。** 那一条读的是仓库，而仓库交出来的是
 * 身份映射里那个实体实例——上一条 UPDATE 是原始语句，ORM 看不见它，于是回填走的是
 * 「逐字段避让本地未保存编辑」那条路（`entity-status.ts` › `applyExternal`）：这一行只要还
 * 带着一处未清的本地编辑，`branchGenerationSeq` 就会被**当成用户的编辑保护起来**，读回来的
 * 是本会话上次以为的那个数，而不是库刚发放的那个。两条新分支因此拿到同一个代际，
 * 幂等键跟着撞号——正是 `buildBranchGenerationAdvance` 把加法交给库要躲开的那个结局。
 *
 * 所以写在哪条通道上，就从哪条通道读回来：加法在库里做，号也从库里取。
 *
 * 也不用 `UPDATE ... RETURNING` 合成一条：那条语法在本仓支持的六个后端上并不齐平
 * （`rxdb-adapter-electron/src/sqlite-script.ts` 记着多语句脚本会把 `RETURNING` 的结果集整个吞掉），
 * 而这两条语句本来就同属调用方那个写事务，中间插不进别人的发放。
 */
const buildBranchGenerationRead = (tableRef: string): string => {
  const metadata = getEntityMetadata(WorkingTreeActivationState);
  return [
    `SELECT ${columnOf(metadata, 'branchGenerationSeq')}`,
    `FROM ${tableRef}`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(WORKING_TREE_ACTIVATION_STATE_ID)}`
  ].join(' ');
};

/**
 * 从读回语句的结果里取出那一个数。
 *
 * @param rows - {@link buildBranchGenerationRead} 的返回行
 * @returns 本次发放到的代际号
 * @throws {@link RxDBError} 行数不是 1、或那一格不是整数时
 *
 * @remarks
 * 形状不对就抛，不挑一个能用的出来：这一格要么是库刚发放的号，要么什么都不是。
 * 放过一个非整数（某个后端把整型读成字符串、或读回 `null`）会让它一路走到
 * `CommitBranchRef.generation` 落库，而代际是**不可变**列，落错之后没有第二次机会。
 */
const readSingleGeneration = (rows: readonly unknown[][]): number => {
  if (rows.length !== 1) throw new RxDBError(generationReadbackMessage(`读回 ${rows.length} 行`));
  const [[value]] = rows;
  if (!Number.isInteger(value)) throw new RxDBError(generationReadbackMessage(`读回的值是 ${String(value)}`));
  return value as number;
};

/**
 * 读不回号时的错误文案。
 *
 * @param detail - 这一次具体错在哪
 * @returns 文案
 */
const generationReadbackMessage = (detail: string): string =>
  `读回分支代际失败（${detail}），期望恰好 1 行 1 个整数：` +
  '上一条 UPDATE 已经报了命中 1 行，读不回来意味着这两条语句看见的不是同一行。' +
  '这不能按成功继续——继续就等于让调用方自己编一个代际出来，而代际的全部意义是永不复用。';

/**
 * 发放不出号时的错误文案。
 *
 * @param rowsAffected - 那条 UPDATE 实际命中的行数
 * @returns 文案
 */
const allocationMissMessage = (rowsAffected: number): string =>
  `发放分支代际时命中 ${rowsAffected} 行，期望恰好 1 行：` +
  '激活态是单例行——命中 0 行意味着迁移 0004-working-tree-commits 建了表却没写入这一行（或它被外部删除了），' +
  '命中多行意味着有人往这张表里写了第二行。' +
  '这不是「暂时没号可发」，不能按成功继续：那会让这条新分支带着一个不可信的代际落库。';

/**
 * 发放下一个分支代际：让库把 `branchGenerationSeq` 就地 +1，再把新值读回来。
 *
 * @param executor - **调用方那个写事务**的执行器；发放与新分支落库必须同属一个事务
 * @returns 本次发放的代际号，首次发放为 1
 * @throws {@link RxDBError} 单例行不存在、或不止一行（`rowsAffected !== 1`）时
 *
 * @remarks
 * **加法在库里做，不在 JS 里做**（见 {@link buildBranchGenerationAdvance}）。这里曾经是一次
 * 同事务内的读—改—写，靠一句「本地写队列并发度为 1，同事务内的读—改—写因此是原子的」自辩；
 * 那句话把「一个库只有一个连接在写」当成前提，而
 * `git show f9528e8f:specs/001-working-tree-commits/threat-model.md` §6
 * 已经把跨连接明确划进模型内——同一个库可以有第二个标签页、第二个 worker 在写，写队列只排得住自己进程里的那些。
 *
 * **返回值现读库，不是 `读到的 + 1`。** 读回来那一次落在同一个事务里，它看得见自己刚写下的
 * 那一步加法；并发的第二条发放此刻正卡在这一行的行锁上（SQLite 家族则整条写事务串行），
 * 所以读回来的就是本次发放到的号。省掉这次读、在 JS 里算一个数出来的话，前面那条 UPDATE
 * 就白发了——号仍然是调用方算的。
 *
 * **读回来那一次也走原始语句**（{@link buildBranchGenerationRead}），不走仓库：仓库交出的是
 * 身份映射里的实体实例，它看不见上一条原始 UPDATE，回填时反而会把 `branchGenerationSeq`
 * 当成「本地未保存的编辑」保护下来。两条语句因此都落在同一条通道上——加法在库里做，
 * 号也从库里取，中间没有一层会替它记答案的缓存。
 *
 * `rowsAffected !== 1` 当场抛，不静默走过去，理由与 {@link readWorkingTreeActivationState}
 * 的缺行抛错同源，代价更重：带着一个不可信代际落库的新分支，会让持旧 `(branchId, headRevision)`
 * 的调用方误中同名重建的那一条（ABA），提交幂等键跟着一起失效（`commit-idempotency.ts`），
 * 而这一次撞号在建分支的那一刻是完全静默的。
 */
export const allocateBranchGeneration = async (executor: TransactionExecutor): Promise<number> => {
  const tableRef = executor.tableRef(WorkingTreeActivationState);
  const { rowsAffected } = await executor.query(buildBranchGenerationAdvance(tableRef));
  if (rowsAffected !== 1) throw new RxDBError(allocationMissMessage(rowsAffected));
  const { rows } = await executor.query(buildBranchGenerationRead(tableRef));
  return readSingleGeneration(rows);
};
