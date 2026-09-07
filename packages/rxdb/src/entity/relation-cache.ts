import { RxDBError } from '../RxDBError.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { ENTITY_MANAGER } from '../rxdb.private.js';
import { EntityData, EntityType, RxDBEntityId } from './entity.interface.js';
import { EntityRelationMetadata, RelationKind } from './metadata-options.interface.js';

/**
 * 关系 Observable 的记忆化缓存条目
 *
 * - `observable`：relation-helper 为该关系构建的（已 freeze 的）Observable，getter 重复访问时直接复用
 * - `syncForeignKeyId`：仅 MANY_TO_ONE / ONE_TO_ONE 提供，用于 Proxy 外键直写（bypass `.set()`）时
 *   把新值回灌进 Observable 内部的 BehaviorSubject，避免持有旧引用的订阅者读到过期数据
 */
export interface RelationObservableEntry {
  readonly observable: object;
  readonly syncForeignKeyId?: (id: RxDBEntityId | null) => void;
}

/**
 * 在 Set 中查找第一个满足条件的元素，避免 `Array.from(set).find(...)` 产生的中间数组
 */
const findInSet = <V>(set: Set<V>, predicate: (value: V) => boolean): V | undefined => {
  for (const value of set) {
    if (predicate(value)) return value;
  }
  return undefined;
};

const getRelationValue = (entity: object, property: string): unknown => Reflect.get(entity, property) as unknown;

/**
 * 把一个实体类解析成**当前实例的 schema 里注册的那一个**。
 *
 * 多个 RxDB 实例可以各自注册同名实体（不同库、测试并行、HMR 重载），
 * 类对象因此不是全局唯一的身份。中间表读写必须落到本实例注册的那个类上。
 *
 * @param entity - 提供归属实例的实体
 * @param EntityType - 待解析的实体类，通常来自关系元数据
 * @returns 本实例 schema 中注册的同名实体类
 *
 * @throws RxDBError 实体没有归属的 EntityManager，或该类未在本实例注册时抛出。
 *
 * @remarks
 * 两处都不再回退到传入的 `EntityType`：回退看着无害，实际是拿另一个库的类去读写
 * 本库的中间表 —— 元数据（表名、列名、id 类型）可能完全不同，写坏了也不报错。
 * 未注册就是配置漏了实体，当场炸比事后查数据便宜得多。
 */
/**
 * 取出 `MANY_TO_MANY` 关系的中间表实体类。
 *
 * @param relation - 多对多关系元数据
 * @returns 中间表实体类
 *
 * @throws RxDBError `junctionEntityType` 未生成时抛出。
 *
 * @remarks
 * 此前两处写 `relation.junctionEntityType!`，元数据没生成中间表时会把 `undefined`
 * 一路带进 `getEntityMetadata`，抛一条读不出实体名的裸错。这里点名是哪个实体的哪条关系。
 *
 * 形参写成结构类型而不是 `EntityRelationManyToManyMetadata`（那里 `SetRequired` 把
 * `junctionEntityType` 标成必填）：必填只是元数据装配环节应当维持的**断言**，
 * 不是编译期证明，运行时仍要核一遍。
 */
const junctionTypeOf = (relation: { name: string; junctionEntityType?: EntityType }): EntityType => {
  const { junctionEntityType } = relation;
  if (!junctionEntityType) {
    throw new RxDBError(`多对多关系 '${relation.name}' 没有生成中间表实体（junctionEntityType 缺失）`);
  }
  return junctionEntityType;
};

const getScopedEntityType = (entity: InstanceType<EntityType>, EntityType: EntityType): EntityType => {
  const manager = (
    entity as unknown as {
      [ENTITY_MANAGER]?: {
        rxdb: { schemaManager: { getEntityType: (name: string, namespace?: string) => EntityType | undefined } };
      };
    }
  )[ENTITY_MANAGER];
  const metadata = getEntityMetadata(EntityType);
  if (!manager) {
    throw new RxDBError(`关系缓存无法解析 ${metadata.namespace}:${metadata.name}：实体未绑定 EntityManager`);
  }
  const scoped = manager.rxdb.schemaManager.getEntityType(metadata.name, metadata.namespace);
  if (!scoped) {
    throw new RxDBError(`关系缓存无法解析 ${metadata.namespace}:${metadata.name}：该实体未注册到本 RxDB 实例`);
  }
  return scoped;
};

/**
 * 实体关系缓存管理器
 *
 * 从 EntityStatus 抽离出的关系缓存子模块，专责：
 * - 按 EntityRelationMetadata 维护 entity → Set<related> 映射
 * - 多对多 Junction 实体的双向缓存与延迟删除
 *
 * 设计理由：
 * - EntityStatus 原本 600+ 行，关系缓存占 ~160 行且与状态/patch 责任正交
 * - 抽出后 EntityStatus 专注 status flags + patch tracking
 *
 * @internal 仅供 EntityStatus 使用，外部应通过 EntityStatus 公共 API 访问
 */
export class EntityRelationCache {
  /**
   * 关系缓存映射表
   * 按关系元数据存储关联实体，每个关系独立缓存
   */
  readonly #relation_map = new Map<EntityRelationMetadata, Set<InstanceType<EntityType>>>();

  /**
   * 待删除的 Junction 实体集合
   *
   * 多对多关系解绑时的处理逻辑：
   * - removeRelationEntity 时 Junction 加入此集合
   * - 保存时通过 getRemovableJunctions 统一删除
   * - 只删除 local=true 的 Junction（已存在于数据库的）
   */
  readonly #remove_junction_set = new Set<InstanceType<EntityType>>();

  /**
   * 关系 Observable 记忆化缓存
   * 按关系元数据存储 relation-helper 构建好的 {observable, syncForeignKeyId}，
   * 使同一关系的 getter 重复访问时返回同一个 Observable 引用，而非每次重建
   */
  readonly #observable_map = new Map<EntityRelationMetadata, RelationObservableEntry>();

  /**
   * @param getTarget 返回当前实体的原始 target（用于读取 id 等）
   * @param getProxyTarget 返回 Proxy 包装后的 target（用于回写双向关系）
   */
  constructor(
    private readonly getTarget: () => InstanceType<EntityType>,
    private readonly getProxyTarget: () => InstanceType<EntityType>
  ) {}

  /**
   * 获取指定关系的缓存
   *
   * 懒加载：首次访问某个关系时创建对应的 Set
   * 使用 Set 而非 Array：自动去重 + O(1) 查找/删除
   */
  get(relation: EntityRelationMetadata): Set<InstanceType<EntityType>> {
    let cache = this.#relation_map.get(relation);
    if (!cache) {
      cache = new Set();
      this.#relation_map.set(relation, cache);
    }
    return cache;
  }

  /**
   * 添加关系实体
   *
   * 多对多关系处理流程：
   * 1. 生成 Junction 查找条件（nameAId + nameBId）
   * 2. 检查当前实体的缓存，避免重复添加
   * 3. 在关联实体的缓存中查找已存在的 Junction
   * 4. 如果未找到或已标记删除，创建新的 Junction 实体
   * 5. 双向更新缓存：this.cache + entity.cache
   *
   * 其他关系类型：直接添加到对应类型的缓存
   */
  add(relation: EntityRelationMetadata, entity: InstanceType<EntityType>): void {
    const cache = this.get(relation);

    if (relation.kind === RelationKind.MANY_TO_MANY) {
      const JunctionEntityType = getScopedEntityType(this.getTarget(), junctionTypeOf(relation));
      const foreignKeyA = relation.name + 'Id';
      const foreignKeyB = relation.mappedProperty + 'Id';
      const target = this.getTarget();

      // Junction 查找条件：两个外键必须完全匹配
      const isTargetJunction = (d: InstanceType<EntityType>) =>
        d instanceof JunctionEntityType &&
        getRelationValue(d, foreignKeyA) === entity.id &&
        getRelationValue(d, foreignKeyB) === target.id;

      // 防止重复添加：检查自身缓存
      for (const v of cache) {
        if (isTargetJunction(v)) return;
      }

      // 尝试复用关联实体的 Junction（避免创建重复的连接记录）
      const mappedMetadata = getEntityMetadata(entity.constructor as EntityType);
      const mappedRelation = mappedMetadata.relations.find(r => r.name === relation.mappedProperty);

      let relationCache: Set<InstanceType<EntityType>> | undefined;
      let junctionEntity: InstanceType<EntityType> | undefined;

      if (mappedRelation) {
        relationCache = getEntityStatus(entity).getRelationCache(mappedRelation as EntityRelationMetadata);
        junctionEntity = findInSet(relationCache, isTargetJunction);
      }

      if (!junctionEntity) {
        junctionEntity = findInSet(this.#remove_junction_set, isTargetJunction);
      }

      if (junctionEntity && this.#remove_junction_set.has(junctionEntity)) {
        this.#remove_junction_set.delete(junctionEntity);
      }

      // 如果未找到或已标记删除，创建新的 Junction 实体
      if (!junctionEntity || getEntityStatus(junctionEntity).removed) {
        if (junctionEntity) {
          this.#remove_junction_set.delete(junctionEntity);
        }
        const createJunctionEntity = JunctionEntityType as unknown as new (
          data: EntityData
        ) => InstanceType<EntityType>;
        junctionEntity = new createJunctionEntity({
          [foreignKeyA]: entity.id,
          [foreignKeyB]: target.id
        });
      }

      // 双向更新缓存：this → entity 和 entity → this
      cache.add(entity);
      cache.add(junctionEntity);
      if (relationCache) {
        relationCache.add(this.getProxyTarget());
        relationCache.add(junctionEntity);
      }
    } else {
      // 其他关系类型：直接添加到缓存
      cache.add(entity);
    }
  }

  /**
   * 移除关系实体
   *
   * 多对多关系移除流程：
   * 1. 使用与 add 相同的查找条件定位 Junction
   * 2. 从两端的缓存中移除 Junction 实体
   * 3. 将 Junction 加入待删除集合（延迟删除）
   * 4. 从缓存中移除关联实体
   *
   * 其他关系类型：直接从缓存中移除
   * 注意：Junction 实体不会立即从数据库删除，而是在保存时统一处理
   */
  remove(relation: EntityRelationMetadata, entity: InstanceType<EntityType>): void {
    const cache = this.get(relation);

    if (relation.kind === RelationKind.MANY_TO_MANY) {
      const JunctionEntityType = getScopedEntityType(this.getTarget(), junctionTypeOf(relation));
      const foreignKeyA = relation.name + 'Id';
      const foreignKeyB = relation.mappedProperty + 'Id';
      const target = this.getTarget();

      const junctionEntity = findInSet(
        cache,
        (d: InstanceType<EntityType>) =>
          d instanceof JunctionEntityType &&
          getRelationValue(d, foreignKeyA) === entity.id &&
          getRelationValue(d, foreignKeyB) === target.id
      );

      if (junctionEntity) {
        // 从两端缓存中移除
        cache.delete(junctionEntity);
        const mappedMetadata = getEntityMetadata(entity.constructor as EntityType);
        const mappedRelation = mappedMetadata.relations.find(r => r.name === relation.mappedProperty);

        if (mappedRelation) {
          const relationCache = getEntityStatus(entity).getRelationCache(mappedRelation as EntityRelationMetadata);
          relationCache.delete(this.getProxyTarget());
          relationCache.delete(junctionEntity);
        }

        // 加入待删除集合（延迟删除保证事务一致性）
        this.#remove_junction_set.add(junctionEntity);
      }

      // 移除关联实体
      cache.delete(entity);
    } else {
      // 其他关系类型：直接移除
      cache.delete(entity);
    }
  }

  /**
   * 清理指定关系的缓存
   * 只清理该关系名称对应的缓存，不影响其他同类型关系
   */
  clean(relation: EntityRelationMetadata): void {
    const cache = this.#relation_map.get(relation);
    if (cache) {
      cache.clear();
    }
  }

  /**
   * 获取指定关系已记忆化的 Observable 条目
   * 供 relation-helper 的关系属性 getter 判断是否需要重建 Observable
   */
  getObservableEntry(relation: EntityRelationMetadata): RelationObservableEntry | undefined {
    return this.#observable_map.get(relation);
  }

  /**
   * 记忆化指定关系的 Observable 条目
   */
  setObservableEntry(relation: EntityRelationMetadata, entry: RelationObservableEntry): void {
    this.#observable_map.set(relation, entry);
  }

  /**
   * 清空所有关系缓存（用于 replace / reset 等场景）
   *
   * 同时清空 #observable_map：replace/mergeExternal 直接写 target（绕过 Proxy），
   * 已缓存的关系 Observable 无法感知外键变化，必须失效，下次访问 getter 时重建。
   * reset() 不调用本方法（走 proxyTarget，Proxy set 拦截会实时同步，见 proxy.ts）。
   */
  clear(): void {
    this.#relation_map.clear();
    this.#remove_junction_set.clear();
    this.#observable_map.clear();
  }

  /**
   * 遍历所有关系的实体集合（用于 getNeedSaveEntities）
   */
  forEachRelationSet(callback: (entities: Set<InstanceType<EntityType>>) => void): void {
    for (const entities of this.#relation_map.values()) {
      callback(entities);
    }
  }

  /**
   * 获取所有待删除的 Junction 实体（用于 getNeedRemoveEntities）
   * 调用方需要进一步过滤 `local=true` 的项
   */
  getRemovableJunctions(): ReadonlySet<InstanceType<EntityType>> {
    return this.#remove_junction_set;
  }
}
