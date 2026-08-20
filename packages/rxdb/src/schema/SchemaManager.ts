import { needArray } from '@aiao/utils';
import { EntityBase } from '../entity/entity-base.js';
import { Entity } from '../entity/entity.decorator.js';
import { EntityType } from '../entity/entity.interface.js';
import { setSafeObjectKey } from '../entity/entity.utils.js';
import generate_many_to_many_entity, { ManyToManyRelation } from '../entity/many-to-many-entity.js';
import {
  EntityPropertyMetadata,
  EntityRelationManyToManyMetadata,
  EntityRelationMetadata,
  RelationKind
} from '../entity/metadata-options.interface.js';
import { EntityMetadata } from '../entity/metadata.interface.js';
import { getEntityMetadata } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { RxDBError } from '../RxDBError.js';
import { RxDBBranch } from '../system/branch.js';
import { RxDBChange } from '../system/change.js';
import { RxDBMigration } from '../system/migration.js';
import { RxDBSync } from '../system/sync.js';

/**
 * 获取实体缓存 key
 * @param name - 实体名称
 * @param namespace - 命名空间
 * @returns 缓存键
 */
const get_entity_cache_key = (name: string, namespace?: string) => namespace + ':' + name;

/** 反向关系的互补 kind：一对多的反面是多对一，一对一 / 多对多的反面是自身 */
const REVERSE_RELATION_KIND: Partial<Record<RelationKind, RelationKind>> = {
  [RelationKind.ONE_TO_MANY]: RelationKind.MANY_TO_ONE,
  [RelationKind.MANY_TO_ONE]: RelationKind.ONE_TO_MANY,
  [RelationKind.ONE_TO_ONE]: RelationKind.ONE_TO_ONE,
  [RelationKind.MANY_TO_MANY]: RelationKind.MANY_TO_MANY
};

/**
 * 查找当前关系属性的映射关系
 */
type FindMappedRelationResult<T> =
  | {
      metadata: EntityMetadata;
      relation: T;
    }
  | undefined;

/**
 * SchemaManager 实现。
 */
export class SchemaManager {
  #metadata_map = new Map<string, EntityMetadata>();
  #entity_map = new Map<string, EntityType>();
  #tableName_entity_map = new Map<string, EntityType>();
  #tableName_metadata_map = new Map<string, EntityMetadata>();
  #junction_relation_map = new Map<string, Set<EntityRelationMetadata>>();

  constructor(protected readonly rxdb: RxDB) {}

  init() {
    const { entities } = this.rxdb.config;
    if (!entities.includes(RxDBBranch)) {
      entities.push(RxDBBranch, RxDBChange, RxDBMigration, RxDBSync);
    }
    // 计算缓存所有实体定义
    new Set(entities).forEach(entity => {
      const metadata = getEntityMetadata(entity);
      const { name, namespace } = metadata;
      const key = get_entity_cache_key(name, namespace);
      // 同一个实体（同一个 class）在 reinit（如 disconnect→reconnect）时会被再次注册，
      // 只有当同一个 key 被两个不同的 class 争抢时才是真正的命名冲突，需要 fail-fast，
      // 否则 Map.set 会静默覆盖，调用方后续通过 name 查到的会是「碰巧后注册」的那一个实体
      const existingEntity = this.#entity_map.get(key);
      if (existingEntity && existingEntity !== entity) {
        throw new RxDBError(`实体命名冲突：namespace '${namespace}' 下已存在名为 '${name}' 的实体，不能重复注册`);
      }
      this.#metadata_map.set(key, metadata);
      this.#entity_map.set(key, entity);

      const config = this.rxdb.getRepositoryConfig(metadata.repository);
      if (config?.entityGenerator) {
        const RepositoryClass = config.entityGenerator(metadata);
        const cls = needArray(RepositoryClass);
        cls.forEach(RepositoryClass => {
          const repo_metadata = getEntityMetadata(RepositoryClass);
          const repo_key = get_entity_cache_key(repo_metadata.name, repo_metadata.namespace);
          if (!this.#metadata_map.has(repo_key)) {
            this.#metadata_map.set(repo_key, repo_metadata);
            this.#entity_map.set(repo_key, RepositoryClass);
            entities.push(RepositoryClass);
          }
        });
      }
    });

    // 生成多对多关系
    this.#metadata_map.forEach(metadata =>
      metadata.relations.forEach(relation => {
        // 生成多对多关系中间表
        if (relation.kind === RelationKind.MANY_TO_MANY) {
          const relationManyToMany = relation as EntityRelationManyToManyMetadata;

          const mapped = this.findMappedRelation(metadata, relationManyToMany);
          if (!mapped) {
            throw new RxDBError('mapped relation not found');
          }

          // 生成中间表
          const metadataOptions = generate_many_to_many_entity([
            { metadata, relation: relationManyToMany },
            mapped as ManyToManyRelation
          ]);

          const key = get_entity_cache_key(metadataOptions.name, metadataOptions.namespace);
          // 中间表命名只按参与的两个实体名排序拼接（见 generate_many_to_many_entity），不含关系属性名，
          // 所以同一对实体之间的多条并行多对多关系（如 User.ownedTeams/Team.owners 与
          // User.managedTeams/Team.managers）、或同一实体上的多条自关联，天然会算出同一个 key。
          // 用参与生成这个 key 的两个关系对象身份做校验：
          // 同一条关系在双向遍历（A→B 一次，B→A 一次）或 schemaManager.init() 重入时
          // 会带着完全相同的一对 relation 引用重新走到这里，属于合法重放；
          // 只有两个不同的关系对撞到同一个 key，才是真正的中间表命名冲突，需要 fail-fast——
          // 这里不改名自动消歧（中间表名是持久化的物理表名，改名等于破坏性 schema 变更），
          // 而是要求调用方显式改用不同的实体名/命名空间来错开物理表
          const relationPair = new Set<EntityRelationMetadata>([relationManyToMany, mapped.relation]);
          const existingRelationPair = this.#junction_relation_map.get(key);
          if (
            existingRelationPair &&
            !(existingRelationPair.has(relationManyToMany) && existingRelationPair.has(mapped.relation))
          ) {
            throw new RxDBError(
              `中间表命名冲突：namespace '${metadataOptions.namespace}' 下已存在名为 '${metadataOptions.name}' 的多对多中间表，关系 '${metadata.name}.${relationManyToMany.name}' 不能复用同一张表`
            );
          }
          this.#junction_relation_map.set(key, relationPair);

          // 检查中间表是否已经存在
          if (this.#metadata_map.has(key) === false) {
            @Entity(metadataOptions)
            class MappedClass extends EntityBase {}
            const mappedMetadata = getEntityMetadata(MappedClass);
            this.#metadata_map.set(key, mappedMetadata);
            this.#entity_map.set(key, MappedClass);
            entities.push(MappedClass);
          }
          relation.junctionEntityType = this.#entity_map.get(key)!;
        }
      })
    );

    // 构建 tableName 反向索引 + 将实体引用添加到 rxdb
    this.#metadata_map.forEach((metadata, key) => {
      const { name, namespace, tableName } = metadata;
      const entityForKey = this.#entity_map.get(key)!;

      const tableKey = get_entity_cache_key(tableName, namespace);
      // 与上面的 name 冲突检查同理：tableName 默认等于 name，
      // 「实体 A 显式指定的 tableName」撞上「实体 B 的 name（或 B 默认的 tableName）」
      // 是完全可能发生的真实场景，Map.set 静默覆盖会让 getEntityTypeByTableName 返回错误的实体
      const existingTableEntity = this.#tableName_entity_map.get(tableKey);
      if (existingTableEntity && existingTableEntity !== entityForKey) {
        throw new RxDBError(
          `表名冲突：namespace '${namespace}' 下已存在使用表名 '${tableName}' 的实体，实体 '${name}' 不能注册同一个表名`
        );
      }
      this.#tableName_entity_map.set(tableKey, entityForKey);
      this.#tableName_metadata_map.set(tableKey, metadata);

      let scope: object = this.rxdb;
      if (namespace !== 'public') {
        const namespaceScope = Reflect.get(scope, namespace);
        if (!namespaceScope || typeof namespaceScope !== 'object') {
          const nextScope = {};
          setSafeObjectKey(scope, namespace, nextScope);
          scope = nextScope;
        } else {
          scope = namespaceScope;
        }
      }
      setSafeObjectKey(scope, name, this.#entity_map.get(key));
    });
  }

  /**
   * 查找当前关系属性的映射关系
   * @param relation 当前关系属性
   */
  findMappedRelation(
    meta: EntityMetadata,
    relation: EntityRelationMetadata
  ): FindMappedRelationResult<EntityRelationMetadata> {
    // 反向关系的身份 = 两端 property 名互指 + 两端 entity/namespace 互指 + kind 互补。
    //
    // 少校验任何一项都会在「同两个实体之间存在多条并行关系」时命中错的那条：
    // 原本 ONE_TO_ONE 只看「kind 相同 + mappedEntity 指回来」，DualDoc.owner 会命中
    // DualParty 上声明在前的 auditedDoc；ONE_TO_MANY / MANY_TO_ONE 也各只校验半边字段。
    //
    // 补齐后不需要再做「匹配不唯一就 fail-fast」：`mapped.name === relation.mappedProperty`
    // 已经把候选约束到唯一一个属性名上，而属性名在单个实体内本就唯一。
    const expectedKind = REVERSE_RELATION_KIND[relation.kind];
    if (!expectedKind) return void 0;
    const filterFn = (mapped: EntityRelationMetadata): boolean =>
      mapped.kind === expectedKind &&
      mapped.name === relation.mappedProperty &&
      mapped.mappedProperty === relation.name &&
      mapped.mappedEntity === meta.name &&
      mapped.mappedNamespace === meta.namespace;

    for (const metadata of this.#metadata_map.values()) {
      if (metadata.name !== relation.mappedEntity || metadata.namespace !== relation.mappedNamespace) {
        continue;
      }
      // 用 relationMap（跨继承链合并）而不是 relations（仅本类声明），
      // 否则反向关系声明在父类上时永远找不到
      for (const mapped of metadata.relationMap?.values() ?? metadata.relations ?? []) {
        if (filterFn(mapped)) return { metadata, relation: mapped };
      }
    }
    return void 0;
  }

  /**
   * 通过查询条件的字段找出关系数组
   * @param field 查询条件的字段
   */
  getFieldRelations(metadata: EntityMetadata, field: string): GetFieldRelationsResult {
    if (!field.includes('.')) throw new RxDBError(`field '${field}' 必须是关联属性查询`);
    const relations: { metadata: EntityMetadata; relation: EntityRelationMetadata }[] = [];
    const properties = field.split('.');
    const lastIndex = properties.length - 1;
    let meta = metadata;
    let property: EntityPropertyMetadata;
    let isForeignKey: boolean = false;
    let propertyName: string = '';
    // 当查询 `xxxx.id` 时候，检查 `xxxx` 属性是否是外键, 如果是 fk 优先使用 `xxxId` 形式
    if (properties.length === 2 && properties[1] == 'id') {
      isForeignKey = meta.foreignKeyRelationMap.has(`${properties[0]}Id`);
      propertyName = properties[0] + 'Id';
    }
    for (let index = 0; index < properties.length; index++) {
      const prop = properties[index];
      if (index === lastIndex) {
        const found = meta.propertyMap.get(prop);
        if (!found) throw new RxDBError(`property '${prop}' not found`);
        property = found;
      } else {
        const relation = meta.relationMap.get(prop);
        if (!relation) throw new RxDBError(`relation '${prop}' not found`);
        relations.push({ relation, metadata: meta });
        meta = this.getEntityMetadata(relation.mappedEntity, relation.mappedNamespace)!;
      }
    }

    return {
      property: property!,
      propertyName: propertyName || property!.name,
      isForeignKey: isForeignKey!,
      relations
    } satisfies GetFieldRelationsResult;
  }

  /**
   * 获取实体元数据
   */
  getEntityMetadata(name: string, namespace: string): EntityMetadata | undefined {
    const key = get_entity_cache_key(name, namespace);
    return this.#metadata_map.get(key);
  }

  /**
   * 获取实体元数据
   */
  getEntityType<T extends EntityType>(name: string, namespace: string): T | undefined {
    const key = get_entity_cache_key(name, namespace);
    return this.#entity_map.get(key) as T | undefined;
  }

  /**
   * 通过 tableName 获取实体类型
   * @param tableName 数据库表名
   * @param namespace 命名空间
   */
  getEntityTypeByTableName<T extends EntityType>(tableName: string, namespace: string): T | undefined {
    const key = get_entity_cache_key(tableName, namespace);
    return this.#tableName_entity_map.get(key) as T | undefined;
  }

  /**
   * 通过 tableName 获取实体元数据
   * @param tableName 数据库表名
   * @param namespace 命名空间
   */
  getEntityMetadataByTableName(tableName: string, namespace: string): EntityMetadata | undefined {
    const key = get_entity_cache_key(tableName, namespace);
    return this.#tableName_metadata_map.get(key);
  }
}

export interface GetFieldRelationsResult {
  /**
   * 关系组
   */
  relations: { metadata: EntityMetadata; relation: EntityRelationMetadata }[];

  /**
   * 要查询的属性
   */
  property: EntityPropertyMetadata;

  /**
   * 查询的属性名字
   * 当 isForeignKey = true 的时候 propertyName = xxxId
   */
  propertyName: string;
  /**
   * 要查询的属性是否是当前查询 Entity 外键
   */
  isForeignKey: boolean;
}
