/**
 * @fileoverview 提交的写路径（FR-008/009/010/029，契约见 contracts/core-api.md §4）
 *
 * @remarks
 * **顺序是这条路径的全部内容**：校验 → 读 ref → 幂等查重 → CAS → 写 commit → 写 ChangeSet。
 * 每一步排在前面都有代价换来的理由：
 *
 * - **校验排在最前**。排到 CAS 之后，一次被拒的提交照样推进了一格 `headRevision`，
 *   别的 Tab 手里的 `workingTreeRevision` 全部失效，而实际上什么都没提交。
 * - **幂等查重排在 CAS 之前**。重放若推进 HEAD，同一次提交就被算了两次修订。
 * - **CAS 排在所有写入之前**。CAS 未命中返回的是**值**不是异常（见 {@link WriteCommitOutcome}），
 *   返回的那一刻事务不会回滚；写在前面就等于在两张表里留下永远没人指向的孤儿行。
 *
 * **CAS 的四个条件一个都不能少。** `id` 定位分支；`generation` 挡住 ABA——同名重建的分支
 * 会被当成同一个分支写进去；`headRevision` 是乐观锁本身；`status` 关掉「守卫检查过了、
 * 但在我写之前这个分支被判成损坏」的那个窗口。
 *
 * **语句里不许出现占位符方言。** 六个后端共用这一份 SQL，`$1` 与 `?` 一旦进来就必须在
 * 这里分叉成两份实现。字面量由 `sql-literal.ts` 负责转义。
 */

import { RxDBError } from '../RxDBError.js';
import { getEntityColumnName } from '../entity/entity-field.utils.js';
import type { EntityManager } from '../entity/entity-manager.js';
import type { EntityMetadata } from '../entity/metadata.interface.js';
import { getEntityMetadata, uuid } from '../rxdb-utils.js';
import { quoteSqlIdentifier, sqlIntegerLiteral, sqlStringLiteral } from '../system/sql-literal.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import { computeCommitContentFingerprint } from './change-unit.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import {
  CommitOperationMismatchError,
  deriveCommitOperationId,
  findCommitByOperationId,
  resolveUniqueViolationWinner
} from './commit-idempotency.js';
import type { CommitKind } from './commit.entity.js';
import { Commit } from './commit.entity.js';
import { readCommitBranchRef } from './list-commits.js';

/**
 * 两种系统根节点的固定消息文案。
 *
 * @remarks
 * 系统根节点没有用户消息，但**不能存空串**：那样历史里会出现一个既没作者也没消息的节点，
 * 与「作者恰好没记上的普通 commit」在 UI 上不可区分。
 *
 * 两条文案必须互不相同——同一条文案会让 FR-044 的物化屏障认不出 `branch_baseline`。
 */
export const SYSTEM_COMMIT_MESSAGES: Readonly<Record<Exclude<CommitKind, 'normal'>, string>> = {
  baseline: '启用提交能力时写下的基线节点',
  branch_baseline: '创建分支时写下的分支基线节点'
};

/** 提交被拒的原因；每一个都对应 FR-008 / FR-009 的一条硬约束。 */
export type CommitValidationReason =
  /** 普通 commit 的消息为空、为 `null` 或只有空白 */
  | 'empty_message'
  /** 普通 commit 缺作者，或作者只有空白 */
  | 'missing_author'
  /** 缺幂等键——这次提交无法被安全重放 */
  | 'missing_operation_id'
  /** 普通 commit 没有任何变更单元 */
  | 'empty_commit'
  /** 系统根节点带上了用户作者或用户消息 */
  | 'user_authored_system_commit';

/**
 * 入参没过校验；**在任何读写之前**抛出。
 *
 * @remarks
 * 错误里只带 {@link CommitValidationError.reason} 与 {@link CommitValidationError.kind}，
 * **不带任何入参值**。调用方常见的日志写法会把错误对象整个序列化
 * （`JSON.stringify(error, Object.getOwnPropertyNames(error))`），带上 message / patch
 * 就等于把加密列的明文抄进日志（FR-038）。
 */
export class CommitValidationError extends RxDBError {
  constructor(
    /** 可判别的拒绝原因 */
    readonly reason: CommitValidationReason,
    /** 出问题的提交类型；不含任何用户内容 */
    readonly kind: CommitKind
  ) {
    super(`Commit rejected: ${reason} (kind=${kind}).`);
    this.name = 'CommitValidationError';
    Object.setPrototypeOf(this, CommitValidationError.prototype);
  }
}

/** {@link buildCommitRows} 的入参：构造 commit 行所需的全部内容。 */
export interface BuildCommitRowsInput {
  /** commit id；由调用方决定，**必须**在 CAS 之前就确定（CAS 的 SET 要写它） */
  readonly id: string;
  /** 提交类型 */
  readonly kind: CommitKind;
  /** 父 commit id，有序；第 0 个就是 `firstParentId` */
  readonly parentIds: readonly string[];
  /** **最终落库**的消息；`null` 与 `''` 同义（`Commit.message` 是非空列） */
  readonly message: string | null;
  /** **最终落库**的作者；系统根节点为 `null` */
  readonly author: string | null;
  /** 派生后的幂等键，见 `commit-idempotency.ts` */
  readonly operationId: string;
  /** 变更单元，有序；`sequence` 按此顺序发放 */
  readonly units: readonly CommitChangeUnitContent[];
}

/** {@link buildCommitRows} 的产物：一次提交要落库的全部行。 */
export interface CommitRows {
  /** commit 行；`createdAt` 未赋值，留给数据库时钟 */
  readonly commit: Commit;
  /** 变更集行，`sequence` 从 0 起密集发放 */
  readonly changeSets: readonly CommitChangeSet[];
}

/** {@link writeCommit} 的入参。 */
export interface WriteCommitInput {
  /** 目标分支 id；等于 `CommitBranchRef.id` */
  readonly branchId: string;
  /** 该分支的不可变代际，参与 CAS 与幂等键 */
  readonly branchGeneration: number;
  /** 调用方捕获到的 `headRevision`；CAS 就卡在它上面 */
  readonly expectedHeadRevision: number;
  /** 提交类型 */
  readonly kind: CommitKind;
  /** 用户消息；落库前 trim。系统根节点必须传 `null` */
  readonly message: string | null;
  /** 作者；系统根节点必须传 `null` */
  readonly author: string | null;
  /** 调用方给的操作 id；同一次逻辑提交的重试必须带同一个值 */
  readonly operationId: string;
  /** 本次要提交的全部变更单元 */
  readonly units: readonly CommitChangeUnitContent[];
}

/**
 * 一次 {@link writeCommit} 的结果。
 *
 * @remarks
 * `head_revision_conflict` 是**返回值不是异常**：并发落败是这条路径的正常出口
 * （FR-010），异常会让调用方的事务回滚，而此时本就没有任何写入需要回滚。
 *
 * `reused` 与 `committed` 都表示「这次提交在历史里存在」，区别只在于是不是本次写的。
 */
export type WriteCommitOutcome =
  | {
      /** 本次写成功 */
      readonly status: 'committed';
      /** 新写入的 commit */
      readonly commit: Commit;
      /** 新写入的变更集行 */
      readonly changeSets: readonly CommitChangeSet[];
    }
  | {
      /** 同一个幂等键此前已经提交过，本次复用 */
      readonly status: 'reused';
      /** 此前那次提交的 commit */
      readonly commit: Commit;
    }
  | {
      /** CAS 未命中：HEAD 在捕获之后被别人推进了 */
      readonly status: 'head_revision_conflict';
      /** 调用方捕获到的那个值，原样回传供诊断 */
      readonly expectedHeadRevision: number;
    };

/** `CommitBranchRef` 里参与 CAS 的那几列；`branchId` 不在其中（它由关系合成，没有独立列）。 */
type CommitBranchRefColumn = 'id' | 'generation' | 'headCommitId' | 'headRevision' | 'status';

/** 空白判定；`if (!value)` 放不住只有空格的串。 */
const isBlank = (value: string | null): boolean => value === null || value.trim() === '';

/**
 * 取一列的真实列名并加引号。
 *
 * @throws {@link RxDBError} 元数据里没有这一列时
 *
 * @remarks
 * 不接受「取不到就用字段名兜底」：列名一旦被改，兜底会拼出一条语法正确、
 * 却永远匹配不到任何行的 UPDATE——`rowsAffected` 恒为 0，症状是「提交总是冲突」。
 */
const columnOf = (metadata: EntityMetadata, field: CommitBranchRefColumn): string => {
  const columnName = getEntityColumnName(metadata, field);
  if (!columnName) throw new RxDBError(`CommitBranchRef 元数据里没有 '${field}' 对应的列`);
  return quoteSqlIdentifier(columnName);
};

/**
 * 拼出推进 HEAD 的那一条 CAS。
 *
 * @param input - 本次提交的入参，提供 CAS 的四个条件
 * @param commitId - 新 commit 的 id，写进 `headCommitId`
 * @returns 单条 UPDATE 语句，全字面量、无占位符
 */
const buildAdvanceHeadCas = (input: WriteCommitInput, commitId: string): string => {
  const metadata = getEntityMetadata(CommitBranchRef);
  return [
    `UPDATE ${quoteSqlIdentifier(metadata.tableName)}`,
    `SET ${columnOf(metadata, 'headCommitId')} = ${sqlStringLiteral(commitId)},`,
    `${columnOf(metadata, 'headRevision')} = ${sqlIntegerLiteral(input.expectedHeadRevision + 1)}`,
    `WHERE ${columnOf(metadata, 'id')} = ${sqlStringLiteral(input.branchId)}`,
    `AND ${columnOf(metadata, 'generation')} = ${sqlIntegerLiteral(input.branchGeneration)}`,
    `AND ${columnOf(metadata, 'headRevision')} = ${sqlIntegerLiteral(input.expectedHeadRevision)}`,
    `AND ${columnOf(metadata, 'status')} = ${sqlStringLiteral('ok')}`
  ].join(' ');
};

/**
 * 校验一次提交的入参。
 *
 * @throws {@link CommitValidationError} 任一条硬约束不满足时
 *
 * @remarks
 * 两种系统根节点是 FR-008 / FR-009 的**唯一**例外，而例外只放宽「允许为空」：
 * 带上用户作者或用户消息就是在走私一个普通 commit，必须拒。
 */
const assertValidCommitInput = (input: WriteCommitInput): void => {
  const { kind } = input;
  if (isBlank(input.operationId)) throw new CommitValidationError('missing_operation_id', kind);
  if (kind === 'normal') {
    if (isBlank(input.message)) throw new CommitValidationError('empty_message', kind);
    if (isBlank(input.author)) throw new CommitValidationError('missing_author', kind);
    if (input.units.length === 0) throw new CommitValidationError('empty_commit', kind);
    return;
  }
  if (input.message !== null || input.author !== null) {
    throw new CommitValidationError('user_authored_system_commit', kind);
  }
};

/**
 * 算出最终落库的消息。
 *
 * @remarks
 * 普通 commit trim（首尾空白不进历史）；系统根节点换成
 * {@link SYSTEM_COMMIT_MESSAGES} 里的固定文案。这一步必须在算内容指纹**之前**完成——
 * 落库的是一个值、摘要算的是另一个值时，`assertCommitGraphIntact()` 会把每一个
 * 系统根节点判成损坏。
 */
const resolveCommitMessage = (input: WriteCommitInput): string =>
  input.kind === 'normal' ? (input.message ?? '').trim() : SYSTEM_COMMIT_MESSAGES[input.kind];

/**
 * 深拷贝一个 patch。
 *
 * @remarks
 * 必须是 `structuredClone` 而不是 JSON 往返：加密列在捕获阶段留下的是裸
 * `Uint8Array`，JSON 往返会把它变成 `{"0":222,…}`——密文就此损坏且无人报错。
 *
 * 必须拷贝而不是共享引用：提交后清理工作树条目会顺手改掉**已经不可变的历史**
 * （data-model.md §2.4）。
 */
const clonePatch = (patch: Record<string, unknown> | null): Record<string, unknown> | null =>
  patch === null ? null : structuredClone(patch);

/**
 * 把一次提交的内容摊成待落库的行。
 *
 * @param entityManager - 用它 `instantiate()`，而不是 `new Commit()`——多个数据库共用同一个
 *   实体类时后者判断不出目标数据库
 * @param input - 见 {@link BuildCommitRowsInput}；`message` / `author` 必须已经是**最终落库值**
 * @returns 见 {@link CommitRows}
 *
 * @remarks
 * **不在这里 trim、也不在这里套系统文案。** 归一化是 {@link writeCommit} 的事；本函数
 * 原样采用入参，才能让 `commit-graph-guard.ts` 用同一份入参重算出同一个指纹。
 *
 * **`createdAt` 不赋值。** 它由数据库时钟给（FR-010）；构造期写一个本机时间进去，
 * 等于把客户端时钟漂移写进不可变历史。
 *
 * **`contentFingerprint` 由 `computeCommitContentFingerprint()` 合成，不在这里另算一遍**——
 * 两份口径迟早分叉，而分叉的表现是守卫把健康的历史判成损坏。
 */
export const buildCommitRows = (entityManager: EntityManager, input: BuildCommitRowsInput): CommitRows => {
  const message = input.message ?? '';
  const parentIds = [...input.parentIds];

  const commit = entityManager.instantiate(Commit);
  commit.id = input.id;
  commit.parentIds = parentIds;
  commit.firstParentId = parentIds.length > 0 ? parentIds[0] : null;
  commit.kind = input.kind;
  commit.message = message;
  commit.author = input.author;
  commit.operationId = input.operationId;
  commit.changeSetCount = input.units.length;
  commit.contentFingerprint = computeCommitContentFingerprint({
    kind: input.kind,
    parentIds,
    message,
    author: input.author,
    units: input.units
  });

  const changeSets = input.units.map((unit, sequence) => {
    const row = entityManager.instantiate(CommitChangeSet);
    row.id = uuid();
    row.commitId = input.id;
    row.sequence = sequence;
    row.unitId = unit.unitId;
    row.transactionId = unit.transactionId;
    row.namespace = unit.namespace;
    row.entity = unit.entity;
    row.entityId = unit.entityId;
    row.operation = unit.operation;
    row.patch = clonePatch(unit.patch);
    row.inversePatch = clonePatch(unit.inversePatch);
    row.origin = unit.origin;
    return row;
  });

  return { commit, changeSets };
};

/**
 * 写一次提交：单原子操作内写 ChangeSet、父 commit、数据库时间、摘要与新 HEAD（FR-008/010/029）。
 *
 * @param executor - 当前事务执行器；本函数不自己开事务，回滚由调用方的事务边界负责
 * @param entityManager - 构造实体行用
 * @param input - 见 {@link WriteCommitInput}
 * @returns 见 {@link WriteCommitOutcome}
 * @throws {@link CommitValidationError} 入参没过校验（在任何读写之前）
 * @throws {@link CommitOperationMismatchError} 同一个幂等键上出现了两份不同内容
 *
 * @remarks
 * **父链取自 ref 当前的 `headCommitId`，不让调用方自带。** 调用方自带就是第二份真相：
 * 它与 `expectedHeadRevision` 可以互相矛盾，而 CAS 只认后者，于是父链会指向一个与本次
 * 修订无关的节点。
 *
 * **唯一约束的捕获只夹在 commit 那一条 INSERT 上。** 包住整段写入会把用户实体里一条无关的
 * 唯一约束错误读成「这次是重放」，于是丢掉一次真实提交且无任何报错。
 */
export const writeCommit = async (
  executor: TransactionExecutor,
  entityManager: EntityManager,
  input: WriteCommitInput
): Promise<WriteCommitOutcome> => {
  assertValidCommitInput(input);

  const ref = await readCommitBranchRef(executor, input.branchId);
  const operationId = deriveCommitOperationId({
    branchGeneration: input.branchGeneration,
    operationId: input.operationId
  });
  const rows = buildCommitRows(entityManager, {
    id: uuid(),
    kind: input.kind,
    parentIds: ref.headCommitId === null ? [] : [ref.headCommitId],
    message: resolveCommitMessage(input),
    author: input.author,
    operationId,
    units: input.units
  });

  const existing = await findCommitByOperationId(executor, operationId);
  if (existing) {
    if (existing.contentFingerprint !== rows.commit.contentFingerprint) {
      throw new CommitOperationMismatchError(operationId, existing.contentFingerprint, rows.commit.contentFingerprint);
    }
    return { status: 'reused', commit: existing };
  }

  const cas = await executor.query(buildAdvanceHeadCas(input, rows.commit.id));
  if (cas.rowsAffected === 0) {
    return { status: 'head_revision_conflict', expectedHeadRevision: input.expectedHeadRevision };
  }

  try {
    await executor.saveMany([rows.commit]);
  } catch (cause) {
    return { status: 'reused', commit: await resolveUniqueViolationWinner(executor, operationId, cause) };
  }
  if (rows.changeSets.length > 0) await executor.saveMany([...rows.changeSets]);

  return { status: 'committed', commit: rows.commit, changeSets: rows.changeSets };
};
