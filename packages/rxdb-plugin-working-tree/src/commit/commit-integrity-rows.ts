import type { TransactionExecutor } from '@aiao/rxdb';
import { getEntityMetadata, sqlStringLiteral } from '@aiao/rxdb';
import { createColumnOf } from '../entity-column.js';
import type { CommitChangeUnitContent } from './change-unit.js';
import { CommitChangeSet } from './commit-change-set.entity.js';

/** 完整性校验使用的持久化内容，不创建或回填实体引用。 */
export interface CommitIntegrityRow extends CommitChangeUnitContent {
  readonly commitId: string;
  readonly sequence: number;
  /**
   * `patch` 或 `inversePatch` 落库的 JSON 文本解析不了：内容已被改写。
   * 为 `true` 时两列都记为 `null`，这一行不能参与指纹重算，守卫直接判损坏。
   */
  readonly unreadable: boolean;
}

const fields = [
  'commitId',
  'sequence',
  'unitId',
  'transactionId',
  'namespace',
  'entity',
  'entityId',
  'operation',
  'patch',
  'inversePatch',
  'origin'
] as const;

const columnOf = createColumnOf<(typeof fields)[number]>('CommitChangeSet');

type StoredRow = [
  string,
  number,
  string,
  string | null,
  string,
  string,
  string,
  CommitChangeUnitContent['operation'],
  unknown,
  unknown,
  CommitChangeUnitContent['origin']
];

type StoredPatch = Record<string, unknown> | null;

/** PostgreSQL JSONB 读回来已是对象，SQLite 是 JSON 文本；文本解析不了返回 `undefined`，交给守卫判损坏。 */
const readPatch = (value: unknown): StoredPatch | undefined => {
  if (typeof value !== 'string') return value as StoredPatch;
  try {
    return JSON.parse(value) as StoredPatch;
  } catch {
    return undefined;
  }
};

/**
 * 在当前事务中读取一层提交的原始内容，保留编码态指纹口径。
 *
 * @param executor - 当前事务的执行器
 * @param commitIds - 当前非空遍历层的提交 ID
 * @returns 不进入实体缓存的持久化内容；兼容 PostgreSQL JSONB 与 SQLite JSON 文本。
 *   JSON 文本解析不了的行不抛错，以 {@link CommitIntegrityRow.unreadable} 交回，由守卫报成提交图损坏。
 */
export const readCommitIntegrityRows = async (
  executor: TransactionExecutor,
  commitIds: readonly string[]
): Promise<CommitIntegrityRow[]> => {
  const metadata = getEntityMetadata(CommitChangeSet);
  const columns = fields.map(field => columnOf(metadata, field)).join(', ');
  const ids = commitIds.map(sqlStringLiteral).join(', ');
  const result = await executor.query(
    `SELECT ${columns} FROM ${executor.tableRef(CommitChangeSet)} WHERE ${columnOf(metadata, 'commitId')} IN (${ids})`
  );
  return result.rows.map(row => {
    const [
      commitId,
      sequence,
      unitId,
      transactionId,
      namespace,
      entity,
      entityId,
      operation,
      patch,
      inversePatch,
      origin
    ] = row as StoredRow;
    const forward = readPatch(patch);
    const inverse = readPatch(inversePatch);
    return {
      commitId,
      sequence,
      unitId,
      transactionId,
      namespace,
      entity,
      entityId,
      operation,
      patch: forward ?? null,
      inversePatch: inverse ?? null,
      origin,
      unreadable: forward === undefined || inverse === undefined
    };
  });
};
