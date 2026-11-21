import { computeCommitExchangeRecordFingerprint } from '@aiao/rxdb-plugin-working-tree/exchange';
import type { ChangeSet, ChangeUnit, Commit } from './model.js';

/** 测试提交统一用的创建时间（交换记录的 `createdAt` 不进指纹，取固定值让用例可复现）。 */
export const testCreatedAt = '2026-11-18T00:00:00.000Z';

/** 给字段级变更补上单元的三列：与客户端整单提交一样，全部单元共用 `unitId`，`transactionId` 为 null，来源 `local`。 */
export const unitsOf = (changes: readonly ChangeSet[], unitId: string): ChangeUnit[] =>
  changes.map(change => ({ ...change, unitId, transactionId: null, origin: 'local' }));

/**
 * 测试用的任务提交：普通提交，唯一的父是 `parent`，单元来自 `changes`，内容指纹由平台的
 * `computeCommitExchangeRecordFingerprint()` 计算（与客户端形成提交的做法相同）。
 */
export function taskCommit(input: {
  id: string;
  parent: string;
  authorId: string;
  message: string;
  changes: readonly ChangeSet[];
  createdAt?: string;
}): Commit {
  const draft = {
    commitId: input.id,
    parentIds: [input.parent],
    kind: 'normal' as const,
    message: input.message,
    authorId: input.authorId,
    createdAt: input.createdAt ?? testCreatedAt,
    units: unitsOf(input.changes, input.id)
  };
  return { ...draft, contentFingerprint: computeCommitExchangeRecordFingerprint(draft) };
}
