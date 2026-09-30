/**
 * @fileoverview 提交的写路径（FR-008/009/010/029，契约见 contracts/core-api.md §4）
 *
 * @remarks
 * **顺序是这条路径的全部内容**：校验 → 读 ref → 幂等查重 → CAS → 写 commit → 写 ChangeSet。
 * 每一步排在前面都有代价换来的理由：
 *
 * - **校验排在最前**。排到 CAS 之后，一次被拒的提交照样推进了一格 `headRevision`，
 *   别的 Tab 手里的 `workingTreeRevision` 全部失效，而实际上什么都没提交。
 * - **at-rest 断言紧随其后**（FR-038）。它必须早于**两处**指纹计算：幂等查重那次与
 *   `buildCommitRows` 那次。排在指纹之后，`contentFingerprint` 就成了明文的确认预言机——
 *   拿一份猜测的明文重算一次就能验证猜得对不对，而这个值是公开可读的。
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

import type { EntityManager, TransactionExecutor } from '@aiao/rxdb';
import { getEntityMetadata, RxDBError, sqlIntegerLiteral, sqlStringLiteral, uuid } from '@aiao/rxdb';
import { createColumnOf } from '../entity-column.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import { computeCommitContentFingerprint } from './change-unit.js';
import { CommitBranchRef } from './commit-branch-ref.entity.js';
import { CommitChangeSet } from './commit-change-set.entity.js';
import { assertCommitUnitsEncryptedAtRest } from './commit-codec.js';
import type { CommitWriteContext } from './commit-context.js';
import {
  CommitOperationMismatchError,
  deriveCommitOperationId,
  findCommitByOperationId
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
  /**
   * 只由本文件的 `assertValidCommitInput` 构造，且**早于**任何读写。
   *
   * @remarks
   * 收的是「哪条约束」与「哪类提交」两个枚举，而不是违规的那个入参——这就是类注释那条
   * 「不带任何入参值」在签名上的落点：两个参数的取值域都是有限字面量集合，
   * 于是把整个错误对象序列化也带不出用户内容。
   */
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

const columnOf = createColumnOf<CommitBranchRefColumn>('CommitBranchRef');

/**
 * 拼出推进 HEAD 的那一条 CAS。
 *
 * @param tableRef - 本后端的物理表引用，由 `executor.tableRef()` 解析
 * @param input - 本次提交的入参，提供 CAS 的四个条件
 * @param commitId - 新 commit 的 id，写进 `headCommitId`
 * @returns 单条 UPDATE 语句，全字面量、无占位符
 */
const buildAdvanceHeadCas = (tableRef: string, input: WriteCommitInput, commitId: string): string => {
  const metadata = getEntityMetadata(CommitBranchRef);
  return [
    `UPDATE ${tableRef}`,
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
 * 算出最终落库的作者。
 *
 * @remarks
 * 与 {@link resolveCommitMessage} 同口径 trim，理由却比「首尾空白不进历史」更硬：`author`
 * 参与 `contentFingerprint`。只要两次调用的作者差一个尾随空格，同一个 `operationId` 就会算出
 * 两个指纹，于是**一次货真价实的重放被判成内容不符**（{@link CommitOperationMismatchError}）——
 * 幂等恰好在它唯一要起作用的那条路径上失效：调用方不知道上一次成没成功，重放一次问问。
 *
 * 系统根节点没有作者（`assertValidCommitInput` 已经拒绝了带作者的系统提交），这里照 `message`
 * 的写法从 `kind` 上收敛出 `null`，而不是把 `input.author` 原样透传——透传的话类型上还是
 * `string | null`，读的人得回头去确认那条校验还在。
 */
const resolveCommitAuthor = (input: WriteCommitInput): string | null =>
  input.kind === 'normal' ? (input.author ?? '').trim() : null;

/**
 * 深拷贝一个 patch。
 *
 * @remarks
 * 必须是 `structuredClone` 而不是 JSON 往返：**拷贝这一步不该顺手改形状**。到这里 patch
 * 已经是落库形态（加密列是字符串信封，未加密的 binary / bigint 被 change-codec 包成
 * `{$rxdbChangeValue:{…}}`，见 T041 的 `commit-codec.ts`），JSON 往返对它是恒等的；但万一
 * 上游漏出一个裸 `Uint8Array`，JSON 往返会就地把它整形成 `{"0":222,…}`，指纹与落库值对上、
 * 内容却已损坏，谁都不报错。`structuredClone` 原样搬运，这种值会一路留到守卫那里被判损坏。
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
 * @param context - 见 {@link CommitWriteContext}：构造实体行的 `entityManager` 与 at-rest 判定上下文
 * @param input - 见 {@link WriteCommitInput}
 * @returns 见 {@link WriteCommitOutcome}
 * @throws {@link CommitValidationError} 入参没过校验（在任何读写之前）
 * @throws {@link CommitEncryptedAtRestError} 加密列里躺着明文，或该判而无判定器（在任何读写之前）
 * @throws {@link CommitOperationMismatchError} 同一个幂等键上出现了两份不同内容
 *
 * @remarks
 * **父链取自 ref 当前的 `headCommitId`，不让调用方自带。** 调用方自带就是第二份真相：
 * 它与 `expectedHeadRevision` 可以互相矛盾，而 CAS 只认后者，于是父链会指向一个与本次
 * 修订无关的节点。
 *
 * **CAS 命中之后的任何写失败都原样抛出，不降级成返回值。** CAS 成功意味着 `headRevision` 仍
 * 等于 `expectedHeadRevision`，且这一格修订已经归本次调用所有——`headCommitId` 此刻就指着
 * `rows.commit.id`。把随后的 INSERT 失败读成「这次是重放」并正常返回，事务会照常提交，
 * 于是 ref 指向一个从未落库的 commit；下一次 `assertCommitGraphIntact()` 报 `missing_commit`，
 * 分支被 latch 成 `corrupted_read_only`。并发重放由 CAS **之前**那次
 * {@link findCommitByOperationId} 探测承担：真正的并发赢家必然也已用自己的 CAS 把
 * `headRevision` 推到了 `expected + 1`，我们的 CAS 会先返回 0 行。
 *
 * 同理，这里也不做「读回赢家」的恢复查询：它跑在一条失败语句之后，Postgres/PGlite 上事务
 * 已进入 aborted 状态，后续语句一律报 `25P02`（见 `system/migration-runner.ts` 的 TSDoc），
 * 结果是把真正的失败原因换成一条无关的错误。
 *
 * **重放的比对指纹按已落库那个节点的父链重算，不能拿此刻的 `ref.headCommitId` 重建一份行去比。**
 * 上一次提交成功后 HEAD 已经前进到了那个 commit 自身，按此刻的 ref 重建拿到的父链是
 * `[它自己]`，而存着的是 `[它的父]`——于是一次货真价实的重放会被判成内容不符直接抛错，
 * 幂等恰好在唯一需要它的那条路径上失效。用 `existing.parentIds` 重算与 `commit-graph-guard.ts`
 * 的守卫同口径：指纹只是「这个节点自身记下的内容」的函数，不随调用时刻的 HEAD 漂移。
 *
 * **建行排在幂等查重之后。** 命中重放时本次的行一行都用不上：既不落库，又因上一条的理由
 * 算不出可用的比对指纹；提前建只是白白 `structuredClone` 一遍全部 patch。
 */
export const writeCommit = async (
  executor: TransactionExecutor,
  context: CommitWriteContext,
  input: WriteCommitInput
): Promise<WriteCommitOutcome> => {
  assertValidCommitInput(input);
  // 一次断言覆盖两条出口：幂等重放那支与正常落库那支都在它之后算指纹。放在读 ref 之前，
  // 于是「判失败」在外部是可观测的——一条读都没发出去，见本文件 TSDoc 的第二条。
  assertCommitUnitsEncryptedAtRest(context.codec, input.units);

  const ref = await readCommitBranchRef(executor, input.branchId);
  const operationId = deriveCommitOperationId({
    branchGeneration: input.branchGeneration,
    operationId: input.operationId
  });
  const message = resolveCommitMessage(input);
  // 归一化只做这一次：查重的指纹与落库行必须是同一个值，否则 `commit-graph-guard.ts` 按落库值
  // 重算会算出第三个指纹，一段健康的历史被判成损坏。
  const author = resolveCommitAuthor(input);

  const existing = await findCommitByOperationId(executor, operationId);
  if (existing) {
    const incoming = computeCommitContentFingerprint({
      kind: input.kind,
      parentIds: existing.parentIds,
      message,
      author,
      units: input.units
    });
    if (existing.contentFingerprint !== incoming) {
      throw new CommitOperationMismatchError(operationId, existing.contentFingerprint, incoming);
    }
    return { status: 'reused', commit: existing };
  }

  const rows = buildCommitRows(context.entityManager, {
    id: uuid(),
    kind: input.kind,
    parentIds: ref.headCommitId === null ? [] : [ref.headCommitId],
    message,
    author,
    operationId,
    units: input.units
  });

  const cas = await executor.query(buildAdvanceHeadCas(executor.tableRef(CommitBranchRef), input, rows.commit.id));
  if (cas.rowsAffected === 0) {
    return { status: 'head_revision_conflict', expectedHeadRevision: input.expectedHeadRevision };
  }

  // CAS 命中之后写失败一律抛出，交给调用方的事务整体回滚。降级成返回值会让事务照常提交，
  // 而 ref 已经指向本次那个从未落库的 commit id——幽灵 HEAD，见本文件 TSDoc。
  await executor.saveMany([rows.commit]);
  if (rows.changeSets.length > 0) await executor.saveMany([...rows.changeSets]);

  return { status: 'committed', commit: rows.commit, changeSets: rows.changeSets };
};
