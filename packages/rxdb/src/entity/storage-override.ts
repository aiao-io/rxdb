import { getEntityMetadata } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';
import { RxDBError } from '../RxDBError.js';
import { compileAdvancedIndex, isAdvancedIndex } from './advanced-index.js';
import type { EntityType } from './entity.interface.js';
import { compileGeneratedColumn, type EntityGeneratedColumnMetadataOptions } from './generated-column.js';
import type { EntityMetadata } from './metadata.interface.js';
import type { EntityIndexMetadataOptions } from './property-types.interface.js';

/** 单个数据库独占的只读派生列与加速索引声明，不改变类的全局元数据。 */
export interface EntityStorageOverride {
  readonly entity: EntityType;
  readonly generatedColumns?: readonly EntityGeneratedColumnMetadataOptions[];
  readonly indexes?: readonly EntityIndexMetadataOptions[];
}

const snapshotData = (value: unknown): unknown => {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'function' || typeof value === 'symbol') throw new RxDBError('存储声明只接受纯数据');
    return value;
  }
  if (Array.isArray(value)) return Object.freeze(value.map(snapshotData));
  if (Object.getPrototypeOf(value) !== Object.prototype) throw new RxDBError('存储声明只接受普通对象');
  return Object.freeze(Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, snapshotData(entry)])));
};

const effectiveMetadata = (base: EntityMetadata, declaration: EntityStorageOverride): EntityMetadata => {
  const generatedColumnMap = new Map(base.generatedColumnMap);
  for (const column of declaration.generatedColumns ?? []) {
    const hasUniqueDependency = [...base.indexMap.values()].some(
      index => index.unique === true && (index.properties ?? [index.name]).includes(column.name)
    );
    if (base.generatedColumnMap.has(column.name) && hasUniqueDependency) {
      throw new RxDBError(`实例级存储声明不能替换已有唯一约束引用的生成列 ${column.name}`);
    }
    generatedColumnMap.set(column.name, column);
  }
  const indexMap = new Map(base.indexMap);
  const metadata: EntityMetadata = Object.create(Object.getPrototypeOf(base), {
    ...Object.getOwnPropertyDescriptors(base),
    generatedColumnMap: { value: generatedColumnMap, enumerable: false },
    indexMap: { value: indexMap, enumerable: false }
  });
  for (const index of declaration.indexes ?? []) {
    const existing = base.indexMap.get(index.name);
    if (index.unique === true) throw new RxDBError('实例级存储声明仅允许加速索引，不能新增唯一约束');
    if (existing !== undefined && (!isAdvancedIndex(base, existing) || existing.unique === true)) {
      throw new RxDBError(`实例级存储声明不能覆盖已有约束索引 ${index.name}`);
    }
    indexMap.set(index.name, index.method === undefined ? { ...index, method: 'btree' } : index);
  }
  for (const column of declaration.generatedColumns ?? []) compileGeneratedColumn(metadata, column, 'postgres');
  for (const index of declaration.indexes ?? []) {
    const current = indexMap.get(index.name)!;
    compileAdvancedIndex(
      metadata,
      current,
      current.dialects?.length === 1 && current.dialects[0] === 'sqlite' ? 'sqlite' : 'postgres'
    );
  }
  return metadata;
};

const snapshotDeclaration = (declaration: EntityStorageOverride): EntityStorageOverride => {
  for (const key of ['generatedColumns', 'indexes'] as const) {
    if (declaration[key] !== undefined && !Array.isArray(declaration[key]))
      throw new RxDBError(`存储声明 ${key} 必须是数组`);
    const names = declaration[key]?.map(value => value?.name);
    if (names?.some(name => typeof name !== 'string') || (names && new Set(names).size !== names.length)) {
      throw new RxDBError(`存储声明 ${key} 的名称无效或重复`);
    }
  }
  const result = Object.freeze({
    entity: declaration.entity,
    ...(declaration.generatedColumns === undefined ?
      {}
    : {
        generatedColumns: snapshotData(declaration.generatedColumns) as EntityGeneratedColumnMetadataOptions[]
      }),
    ...(declaration.indexes === undefined ?
      {}
    : { indexes: snapshotData(declaration.indexes) as EntityIndexMetadataOptions[] })
  });
  effectiveMetadata(getEntityMetadata(result.entity), result);
  return result;
};

/** 校验并冻结实例级存储声明，拒绝系统表、未注册目标与逻辑约束覆盖。 */
export const snapshotEntityStorage = (
  declarations: readonly EntityStorageOverride[],
  entities: readonly EntityType[],
  isSystemEntity: (entity: EntityType) => boolean
): readonly EntityStorageOverride[] => {
  if (!Array.isArray(declarations)) throw new RxDBError('实例级存储声明必须是数组');
  const registered = new Set(entities);
  const seen = new Set<EntityType>();
  return Object.freeze(
    declarations.map(declaration => {
      if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration))
        throw new RxDBError('存储声明必须是对象');
      if (isSystemEntity(declaration.entity)) throw new RxDBError('实例级存储声明不能覆盖系统实体');
      if (!registered.has(declaration.entity)) throw new RxDBError('实例级存储声明的目标实体尚未注册');
      if (seen.has(declaration.entity)) throw new RxDBError('实例级存储声明的目标实体重复');
      seen.add(declaration.entity);
      return snapshotDeclaration(declaration);
    })
  );
};

const metadataCache = new WeakMap<object, Map<EntityType, EntityMetadata>>();

/** 读取当前数据库生效的存储元数据；未配置目标保持原元数据身份。 */
export const getEntityStorageMetadata = (
  db: { readonly config: Pick<RxDB['config'], 'entityStorage'> },
  entity: EntityType
): EntityMetadata => {
  const declaration = db.config.entityStorage?.find(entry => entry.entity === entity);
  const original = getEntityMetadata(entity);
  if (declaration === undefined) return original;
  let cache = metadataCache.get(db.config);
  if (cache === undefined) {
    cache = new Map();
    metadataCache.set(db.config, cache);
  }
  const existing = cache.get(entity);
  if (existing !== undefined) return existing;
  const metadata = effectiveMetadata(original, declaration);
  cache.set(entity, metadata);
  return metadata;
};
