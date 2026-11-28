import {
  type EntityRelationMetadata,
  type EntityType,
  getEntityMetadata,
  OnDeleteAction,
  RelationKind,
  type RepositoryIdentifier,
  type RuleGroup,
  type TransactionExecutor
} from '@aiao/rxdb';

/** 一次查询最多带多少个被引用的值：SQLite 的绑定参数有上限 */
const REFERENCE_QUERY_CHUNK = 500;

/**
 * 指向某个实体、删被引用行时会失败的一条外键
 *
 * @internal
 */
export interface BlockingForeignKey {
  /** 持有外键的实体 */
  readonly EntityType: EntityType;
  /** 持有外键的仓库 */
  readonly repository: RepositoryIdentifier;
  /** 本侧的外键属性 */
  readonly properties: readonly string[];
  /** 被引用实体上对应的属性 */
  readonly mappedProperties: readonly string[];
}

/** 一行要删的本地行：映射表里存的实体身份与本地实体 */
export interface CleanupCandidate {
  readonly entityId: string;
  readonly entity: object;
}

/**
 * 删父行时会被挡住的外键动作
 *
 * @remarks
 * `RESTRICT` 当场报错，`NO ACTION` 在提交时报错（本地外键延迟到提交检查），都会让清理的整个事务回滚。
 * 关系的动作由元数据补齐了默认值；实体级外键没写动作时建表不带 `ON DELETE`，就是 `NO ACTION`。
 */
const blocksDelete = (action: string | undefined): boolean =>
  action === undefined || action === OnDeleteAction.RESTRICT || action === OnDeleteAction.NO_ACTION;

/** 外键落在本侧的关系：多对一与一对一，与依赖图同一口径 */
const holdsForeignKey = (relation: EntityRelationMetadata): boolean =>
  relation.kind === RelationKind.MANY_TO_ONE || relation.kind === RelationKind.ONE_TO_ONE;

/**
 * 指向 `target`、删被引用行会失败的外键
 *
 * @param entities - 本实例的全部实体
 * @param target - 要删行的仓库
 * @returns 关系外键（`<关系名>Id` 指向 `id`）与实体级复合外键；`CASCADE` / `SET NULL` 由数据库处理，不在其中
 *
 * @internal
 */
export function blockingForeignKeysTo(
  entities: readonly EntityType[],
  target: RepositoryIdentifier
): BlockingForeignKey[] {
  return entities.flatMap(EntityType => {
    const metadata = getEntityMetadata(EntityType);
    const repository = { namespace: metadata.namespace, entity: metadata.name };
    const pointsAtTarget = (mapped: { mappedEntity: string; mappedNamespace?: string }): boolean =>
      mapped.mappedEntity === target.entity && (mapped.mappedNamespace || metadata.namespace) === target.namespace;
    const relations = [...metadata.relationMap]
      .filter(
        ([, relation]) => holdsForeignKey(relation) && pointsAtTarget(relation) && blocksDelete(relation.onDelete)
      )
      .map(([relationName]) => ({
        EntityType,
        repository,
        properties: [`${relationName}Id`],
        mappedProperties: ['id']
      }));
    const composites = metadata.foreignKeys
      .filter(foreignKey => pointsAtTarget(foreignKey) && blocksDelete(foreignKey.onDelete))
      .map(foreignKey => ({
        EntityType,
        repository,
        properties: foreignKey.properties,
        mappedProperties: foreignKey.mappedProperties
      }));
    return [...relations, ...composites];
  });
}

/**
 * 这些本地行还被谁引用着
 *
 * @param executor - 清理所在的事务
 * @param target - 要删行的仓库
 * @param foreignKeys - {@link blockingForeignKeysTo} 的结果
 * @param candidates - 要删的行
 * @returns 行身份 → 引用它的仓库；没被引用的行不在里面
 *
 * @remarks
 * 外键值有空的不检查（`MATCH SIMPLE`）。一行引用自己不算：删掉它，引用跟着没了。
 * 被同一批要删的别的行引用也算：`RESTRICT` 当场检查，同一批里谁先删由不得清理决定。
 *
 * @internal
 */
export async function findBlockingReferences(
  executor: TransactionExecutor,
  target: RepositoryIdentifier,
  foreignKeys: readonly BlockingForeignKey[],
  candidates: readonly CleanupCandidate[]
): Promise<Map<string, RepositoryIdentifier[]>> {
  const blocked = new Map<string, RepositoryIdentifier[]>();
  for (const foreignKey of foreignKeys) {
    for (let start = 0; start < candidates.length; start += REFERENCE_QUERY_CHUNK) {
      const chunk = candidates.slice(start, start + REFERENCE_QUERY_CHUNK);
      for (const entityId of await referencedCandidates(executor, target, foreignKey, chunk)) {
        blocked.set(entityId, [...(blocked.get(entityId) ?? []), foreignKey.repository]);
      }
    }
  }
  return blocked;
}

/** 一批候选里被这条外键引用着的那些行的身份 */
async function referencedCandidates(
  executor: TransactionExecutor,
  target: RepositoryIdentifier,
  foreignKey: BlockingForeignKey,
  candidates: readonly CleanupCandidate[]
): Promise<string[]> {
  const byValues = new Map<string, CleanupCandidate[]>();
  for (const candidate of candidates) {
    const values = foreignKey.mappedProperties.map(property => Reflect.get(candidate.entity, property));
    if (values.some(value => value === null || value === undefined)) continue;
    const key = valuesKey(values);
    byValues.set(key, [...(byValues.get(key) ?? []), candidate]);
  }
  if (byValues.size === 0) return [];

  const referencing = (await executor.getRepository(foreignKey.EntityType).find({
    where: referencingWhere(
      foreignKey,
      [...byValues.values()].map(group => group[0].entity)
    )
  })) as object[];
  const referenced = new Set<string>();
  for (const row of referencing) {
    const parents = byValues.get(valuesKey(foreignKey.properties.map(property => Reflect.get(row, property)))) ?? [];
    for (const parent of parents.filter(candidate => !isSameRow(foreignKey.repository, target, row, candidate))) {
      referenced.add(parent.entityId);
    }
  }
  return [...referenced];
}

/** 引用这些父行的行：单列外键用 `in`，复合外键逐行按列相等 */
function referencingWhere(foreignKey: BlockingForeignKey, parents: readonly object[]): RuleGroup<object> {
  const valuesOf = (parent: object) => foreignKey.mappedProperties.map(property => Reflect.get(parent, property));
  if (foreignKey.properties.length === 1) {
    return {
      combinator: 'and',
      rules: [{ field: foreignKey.properties[0], operator: 'in', value: parents.map(parent => valuesOf(parent)[0]) }]
    } as RuleGroup<object>;
  }
  return {
    combinator: 'or',
    rules: parents.map(parent => ({
      combinator: 'and',
      rules: foreignKey.properties.map((field, index) => ({ field, operator: '=', value: valuesOf(parent)[index] }))
    }))
  } as RuleGroup<object>;
}

/** 引用方就是被引用的那一行（引用自己） */
function isSameRow(
  repository: RepositoryIdentifier,
  target: RepositoryIdentifier,
  row: object,
  candidate: CleanupCandidate
): boolean {
  return (
    repository.namespace === target.namespace &&
    repository.entity === target.entity &&
    String(Reflect.get(row, 'id')) === String(Reflect.get(candidate.entity, 'id'))
  );
}

/** 一组外键值的比较键：库里同一列的值类型一致，按字符串比就够 */
function valuesKey(values: readonly unknown[]): string {
  return values.map(value => String(value)).join('\u0000');
}
