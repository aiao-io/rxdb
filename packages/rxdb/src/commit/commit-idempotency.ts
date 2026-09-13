/**
 * @fileoverview 提交的幂等键（FR-036，契约见 contracts/core-api.md §4）
 *
 * @remarks
 * **键是 `immutable branch generation + 调用方 operationId`，不是裸 `operationId`。**
 * `operationId` 由调用方给，删掉分支再建同名分支之后，调用方很可能复用同一批 id；
 * 裸 `operationId` 会把新分支的第一次提交误判成旧分支那次提交的重放，直接返回旧节点——
 * 用户以为提交成功了，历史里却查不出任何差别。`generation` 全局单调、永不复用
 * （data-model.md §2.2），因此它一个字段就把 database 与 branch 两维一起盖住了。
 *
 * **为什么要哈希成 uuid 而不是拼成 `main:1:xxx`。** `rxdb_commit."operationId"` 是 uuid 列，
 * 六个后端里至少 PGlite 会在写入时校验字面量形状。拼接串在 SQLite 系后端上能存下去、
 * 在 PGlite 上直接报错，那是最难查的一类「只有某个后端红」。
 *
 * **唯一约束的捕获范围。** `isUniqueConstraintViolation()` 的 TSDoc 已写明它只回答
 * 「这是不是唯一约束冲突」，回答不了「冲突的是哪张表」。所以本模块只提供
 * {@link resolveUniqueViolationWinner}，由调用方**紧贴自己发出的那一条 INSERT** 使用；
 * 包住整段写入的 try/catch 会把用户实体里一条无关的唯一约束错误读成「这次是重放」，
 * 于是丢掉一次真实提交且无任何报错。
 */

import { RxDBError } from '../RxDBError.js';
import { isUniqueConstraintViolation } from '../system/migration.js';
import { sha256Hex } from '../system/sha256.js';
import type { TransactionExecutor } from '../transaction/transaction-executor.interface.js';
import { Commit } from './commit.entity.js';

/**
 * 幂等键的域分隔串。
 *
 * @remarks
 * 与 `change-unit.ts` 的两个域同一套路：域串进摘要，别的地方就算拿同一对
 * `(generation, operationId)` 去算别的东西也不会撞上同一个值。带版本号是为了
 * 将来换算法时能并存——但注意换算法等于全库已有 `operationId` 作废，所以它实际上
 * 和 `contentFingerprint` 一样是冻结的。
 */
const IDEMPOTENCY_DOMAIN = 'rxdb.commit.idempotency.v1';

/** 只此一份，避免每次调用都新建。 */
const textEncoder = new TextEncoder();

/** 幂等键的两个组成部分。 */
export interface CommitIdempotencyKey {
  /**
   * 分支的不可变代际
   *
   * @remarks
   * 取自 `CommitBranchRef.generation`，**不是** `RxDBBranch.id`：后者会被同名重建复用。
   */
  readonly branchGeneration: number;

  /**
   * 调用方给出的本次操作 id
   *
   * @remarks
   * 同一次逻辑提交的重试必须带同一个值——这正是「重放」得以被识别的全部依据。
   */
  readonly operationId: string;
}

/**
 * 把幂等键折成一个稳定的 uuid，作为 `rxdb_commit."operationId"` 的值。
 *
 * @param key - 见 {@link CommitIdempotencyKey}
 * @returns 36 字符小写 uuid 形状字符串；同一份入参恒得同一个值
 *
 * @remarks
 * 版本位固定写 `8`（RFC 9562 的 name-based/custom 位），变体位按 RFC 取 `10xx`——
 * 让它在任何一个校验 uuid 形状的后端上都合法。其余位直接取摘要，因此两个不同的键
 * 撞上同一个 uuid 的概率就是 SHA-256 截断到 122 位的碰撞概率。
 *
 * 同步而非异步：它被写路径在拼 CAS 之前调用，那里没有额外 await 的余地
 * （见 `sha256.ts` 的 fileoverview）。
 */
export const deriveCommitOperationId = (key: CommitIdempotencyKey): string => {
  const digest = sha256Hex(textEncoder.encode(`${IDEMPOTENCY_DOMAIN} ${key.branchGeneration} ${key.operationId}`));
  const variant = ((parseInt(digest[16], 16) & 0x3) | 0x8).toString(16);
  return [
    digest.slice(0, 8),
    digest.slice(8, 12),
    `8${digest.slice(13, 16)}`,
    `${variant}${digest.slice(17, 20)}`,
    digest.slice(20, 32)
  ].join('-');
};

/**
 * 按派生出的 `operationId` 读回已存在的 commit。
 *
 * @param executor - 当前事务执行器
 * @param operationId - {@link deriveCommitOperationId} 的结果，**不是**调用方的原始 id
 * @returns 命中的 commit；没有则 `undefined`
 *
 * @remarks
 * 走仓库而不是裸 SQL：事务体内经普通 `adapter.query()` 的读会排在自己这个事务后面，
 * 直接挂死（见 {@link TransactionExecutor} 的 TSDoc）。
 */
export const findCommitByOperationId = async (
  executor: TransactionExecutor,
  operationId: string
): Promise<Commit | undefined> => {
  const rows = await executor.getRepository(Commit).find({
    where: { combinator: 'and', rules: [{ field: 'operationId', operator: '=', value: operationId }] },
    limit: 1
  });
  return rows[0];
};

/**
 * 同一个 `operationId` 上出现了两份不同内容——稳定报错，不覆盖也不静默返回旧节点。
 *
 * @remarks
 * 这是调用方的 bug（同一个 id 复用到了两次不同的提交），不是并发。静默返回旧节点的代价是
 * 用户以为这次改动提交了、实际没有，而且历史里查不出差别；覆盖旧节点的代价更大——
 * commit 是只追加的。
 *
 * 错误里**只带 id 与两个指纹**，不带 message / author / patch：指纹是摘要，patch 是明文，
 * 后者进日志就等于把加密列的明文写进了日志（FR-038）。
 */
export class CommitOperationMismatchError extends RxDBError {
  constructor(
    /** 派生后的幂等键（uuid 形状） */
    readonly operationId: string,
    /** 库里那个 commit 的内容指纹 */
    readonly existingFingerprint: string,
    /** 本次入参算出的内容指纹 */
    readonly incomingFingerprint: string
  ) {
    super(
      `Commit operationId '${operationId}' was already used for different content ` +
        `(stored fingerprint ${existingFingerprint}, incoming ${incomingFingerprint}). ` +
        'Reuse an operationId only to retry the exact same commit.'
    );
    this.name = 'CommitOperationMismatchError';
    Object.setPrototypeOf(this, CommitOperationMismatchError.prototype);
  }
}

/**
 * INSERT 撞唯一约束时读回获胜的那个 commit。
 *
 * @param executor - 当前事务执行器
 * @param operationId - {@link deriveCommitOperationId} 的结果
 * @param cause - 那条 INSERT 抛出的原始错误
 * @returns 并发赢家写下的 commit
 * @throws 原始 `cause`——当它不是唯一约束冲突，或冲突了却读不回赢家时
 *
 * @remarks
 * **只能紧贴自己发出的那一条 INSERT 调用。** 包住整段写入等于把用户实体里任意一条
 * 唯一约束错误读成「这次提交是重放」，于是丢掉一次真实提交且无任何报错。
 *
 * 「冲突了却读不回赢家」不降级：那说明冲突来自**别的**唯一约束，把它当成重放会返回一个
 * 与本次内容无关的 commit。原样上抛是唯一诚实的处理。
 */
export const resolveUniqueViolationWinner = async (
  executor: TransactionExecutor,
  operationId: string,
  cause: unknown
): Promise<Commit> => {
  if (!isUniqueConstraintViolation(cause)) throw cause;
  const winner = await findCommitByOperationId(executor, operationId);
  if (!winner) throw cause;
  return winner;
};
