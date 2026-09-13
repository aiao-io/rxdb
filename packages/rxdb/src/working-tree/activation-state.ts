/**
 * @fileoverview 激活态单行的建行、初始化与读取（FR-052，data-model.md §2.2）。
 *
 * @remarks
 * 本模块只做三件事：造出那一行、把 `activationRevision` 初始化为 0、把它读回来。
 * **递增语义不在这里**——switch branch 成功后的 `+1` 归 US-308（`activation-cas.ts`），
 * 写路径的 token 校验归 US-306 阶段 A。把递增顺手写在这里的话，两个故事会各自
 * 持有一份「怎么算下一个 revision」，而 CAS 的全部意义就是只有一份。
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

import type { EntityManager } from '../entity/entity-manager.js';
import { RxDBError } from '../RxDBError.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import {
  WORKING_TREE_ACTIVATION_STATE_ID,
  WorkingTreeActivationState
} from './working-tree-activation-state.entity.js';

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
