import { getEntityMetadata, type EntityType } from '@aiao/rxdb';
import type { WorktreeTarget, WorktreeUnavailableReason } from '@aiao/rxdb-plugin-working-tree';

/**
 * @fileoverview 只读检出位查看器的目录、标签与拒绝文案（US-313，纯函数，三端同名移植）。
 */

/** 查看器左栏的一个实体条目。 */
export interface ReadOnlyCatalogEntry {
  /** `${namespace}:${name}` */
  readonly key: string;
  readonly namespace: string;
  readonly name: string;
  readonly displayName: string;
  /** 主实例上这个实体不记变更日志：快照里是它此刻的内容，不随检出的分支或提交 */
  readonly unversioned: boolean;
}

const keyOf = (EntityClass: EntityType): string => {
  const { namespace, name } = getEntityMetadata(EntityClass);
  return `${namespace}:${name}`;
};

/**
 * 快照里能浏览的实体。
 *
 * @param snapshotEntities - 快照实例的 `config.entities`
 * @param mainEntities - 主实例的 `config.entities`
 * @returns 按快照实例的登记顺序
 *
 * @remarks
 * 复制进快照的实体是克隆出来的类，主实例上没有同一个对象；核心系统实体两个实例共用同一个类，不列。
 * 「不随版本」看主实例上同名实体的 `log`：快照里的克隆一律 `log: false`，拿它判会把所有实体都标上。
 */
export const readOnlyCatalog = (
  snapshotEntities: readonly EntityType[],
  mainEntities: readonly EntityType[]
): ReadOnlyCatalogEntry[] => {
  const mainByKey = new Map(mainEntities.map(EntityClass => [keyOf(EntityClass), EntityClass]));
  return snapshotEntities
    .filter(EntityClass => !mainEntities.includes(EntityClass))
    .map(EntityClass => {
      const metadata = getEntityMetadata(EntityClass);
      const key = keyOf(EntityClass);
      const original = mainByKey.get(key);
      return {
        key,
        namespace: metadata.namespace,
        name: metadata.name,
        displayName: metadata.displayName ?? metadata.name,
        unversioned: original !== undefined && getEntityMetadata(original).log === false
      };
    });
};

/**
 * 横幅里的检出目标。
 *
 * @param target - 打开时的目标
 * @returns `branch <分支名>` 或 `commit <提交号前 7 位>`
 */
export const readOnlyTargetLabel = (target: WorktreeTarget): string =>
  'branchId' in target ? `branch ${target.branchId}` : `commit ${target.commitId.slice(0, 7)}`;

/** 只读检出位打不开的成因（`WorktreeUnavailableError.reason`）→ 用户能看懂的提示。 */
export const READ_ONLY_REJECTION_TEXT: Record<WorktreeUnavailableReason, string> = {
  not_configured: 'Read-only checkouts are not configured for this database.',
  unsupported_adapter: 'This storage backend cannot hold a read-only checkout.',
  adapter_mismatch: 'The snapshot storage is misconfigured: it points at another database.',
  branch_not_found: 'This branch no longer exists.',
  branch_not_materialized: 'This branch has only metadata on this device; there is no data to open.',
  incomplete_entities: 'This snapshot is missing entities the page asked for.',
  unreachable_target: 'This commit is not reachable from the current branch.',
  incompatible_schema: 'This commit contains entities the current client cannot read.',
  restoring_working_tree: 'A restore is in progress. Finish or discard it before opening a commit.',
  locks_unavailable: 'This browser has no Web Locks, so a checkout cannot be held.',
  in_use: 'This checkout is open somewhere else.',
  not_found: 'This checkout no longer exists.',
  schema_mismatch: 'The app changed its entities since this checkout was made. Open a new one.'
};
