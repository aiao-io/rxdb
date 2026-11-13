import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { computed, inject, Injectable, signal } from '@angular/core';
import { DEFAULT_MODEL_NAME, generateCopyName } from '../constants/naming';
import { DesignEntity, DesignIndex, DesignProperty, DesignRelation, ModelDesign } from '../models/index.js';
import {
  cloneDesignSnapshot,
  type ClonedSnapshot,
  type DesignEntitySnapshot,
  type DesignIndexSnapshot,
  type DesignPropertySnapshot,
  type DesignRelationSnapshot
} from '../utils/design-clone';
import { optimisticUpdate } from './entity-utils';
import { createQueryGate, firstQueryError } from './lazy-query';

/** 克隆设计时用到的 EntityManager 子集：按指定 ID 构造实体并批量写入。 */
interface CloneEntityManager {
  createEntityRef<T extends object>(EntityType: new (...args: never[]) => T, data: Record<string, unknown>): T;
  mutations(options: {
    create: Map<unknown, Set<unknown>>;
    update: Map<unknown, Set<unknown>>;
    remove: Map<unknown, Set<unknown>>;
  }): Promise<unknown>;
}

function toEntitySnapshot(e: DesignEntity): DesignEntitySnapshot {
  return {
    id: e.id,
    name: e.name,
    tableName: e.tableName ?? null,
    displayName: e.displayName ?? null,
    entityNamespace: e.entityNamespace ?? null,
    extendsBase: e.extendsBase,
    repositoryType: e.repositoryType,
    nodeX: e.nodeX,
    nodeY: e.nodeY,
    nodeWidth: e.nodeWidth,
    sortOrder: e.sortOrder
  };
}

function toPropertySnapshot(p: DesignProperty): DesignPropertySnapshot {
  return {
    id: p.id,
    designEntityId: p.designEntityId,
    parentId: p.parentId ?? null,
    name: p.name,
    propertyType: p.propertyType,
    columnName: p.columnName ?? null,
    displayName: p.displayName ?? null,
    isUnique: p.isUnique,
    isNullable: p.isNullable,
    isRequired: p.isRequired,
    isReadonly: p.isReadonly,
    isSortable: p.isSortable,
    defaultValue: p.defaultValue ?? null,
    enumValues: p.enumValues ?? null,
    sortOrder: p.sortOrder
  };
}

function toRelationSnapshot(r: DesignRelation): DesignRelationSnapshot {
  return {
    id: r.id,
    designEntityId: r.designEntityId,
    name: r.name,
    relationKind: r.relationKind,
    mappedEntityId: r.mappedEntityId ?? null,
    mappedPropertyId: r.mappedPropertyId ?? null,
    mappedNamespace: r.mappedNamespace ?? null,
    columnName: r.columnName ?? null,
    displayName: r.displayName ?? null,
    onDeleteAction: r.onDeleteAction ?? null,
    onUpdateAction: r.onUpdateAction ?? null,
    sortOrder: r.sortOrder
  };
}

function toIndexSnapshot(idx: DesignIndex): DesignIndexSnapshot {
  return {
    id: idx.id,
    designEntityId: idx.designEntityId,
    propertyIds: idx.propertyIds,
    isUnique: idx.isUnique,
    displayName: idx.displayName ?? null,
    sortOrder: idx.sortOrder
  };
}

/**
 * 模型设计管理服务
 *
 * 管理 ModelDesign 的 CRUD 和当前激活设计的状态。
 * 应用级单例：`/model-designer` 与 `/er` 等路由需共享同一 `activeDesignId`。
 */
@Injectable({ providedIn: 'root' })
export class ModelDesignService {
  readonly #rxdb = inject(RxDB);
  readonly #entitiesQuery = useFindAll(DesignEntity, { where: { combinator: 'and', rules: [] } });
  readonly #propertiesQuery = useFindAll(DesignProperty, { where: { combinator: 'and', rules: [] } });
  readonly #relationsQuery = useFindAll(DesignRelation, { where: { combinator: 'and', rules: [] } });
  readonly #indexesQuery = useFindAll(DesignIndex, { where: { combinator: 'and', rules: [] } });
  readonly #allEntities = this.#entitiesQuery.value;
  readonly #allProperties = this.#propertiesQuery.value;
  readonly #allRelations = this.#relationsQuery.value;
  readonly #allIndexes = this.#indexesQuery.value;

  /**
   * 快照类操作（copy）的就绪闸门。
   *
   * ⚠️ 这些查询是 lazy signal：不读不订阅、首读拿 `initialValue: []`。
   * `#snapshotOf` 直接读它们做「有哪些实体要克隆」的判断，若在首帧到达前调用
   * 就会**复制出一个空设计**（2026-07-27 e2e 实测：副本零实体、零属性）。
   * 这个缺陷长期存在但从没被触发——复制入口在产品路径上不可达（US-103 AC#1），
   * 入口修好的同一天就暴露了。
   */
  readonly #snapshotReady = createQueryGate([
    this.#entitiesQuery,
    this.#propertiesQuery,
    this.#relationsQuery,
    this.#indexesQuery
  ]);

  readonly #designsQuery = useFindAll(ModelDesign, { where: { combinator: 'and', rules: [] } });

  /** 全部模型设计列表 */
  readonly designs = this.#designsQuery.value;

  /** 设计列表活查询首帧是否已到达（首帧前 designs 恒为 initialValue []） */
  readonly designsReady = this.#designsQuery.hasValue;

  /** 等待设计列表首帧的闸门（ensureDefaultDesign 用） */
  readonly #designsGate = createQueryGate([this.#designsQuery]);

  /**
   * 活查询失败时的消息（[缺陷台账 #21](../../../../requirements/known-defects.md)）。
   *
   * 活查询 error 之后订阅即终止，列表会**永远**停在最后一帧——数据在库里、
   * 界面停在旧数量、只有刷新能恢复。这个信号存在的意义就是让那一刻不再是静默的。
   */
  readonly queryError = firstQueryError([
    this.#designsQuery,
    this.#entitiesQuery,
    this.#propertiesQuery,
    this.#relationsQuery,
    this.#indexesQuery
  ]);

  /** 当前激活的设计 ID */
  readonly activeDesignId = signal<string | null>(null);

  /** 默认设计创建的在飞 Promise（并发去重） */
  #defaultDesignPromise: Promise<ModelDesign | null> | null = null;

  /** 当前激活的设计实例 */
  readonly activeDesign = computed(() => {
    const id = this.activeDesignId();
    if (!id) return null;
    return this.designs().find(d => d.id === id) ?? null;
  });

  /** 创建新模型设计并激活 */
  async create(name: string, namespace = 'public'): Promise<ModelDesign> {
    const design = new ModelDesign({ name, namespace });
    await design.save();
    this.activeDesignId.set(design.id);
    return design;
  }

  /** 加载指定设计（切换激活状态） */
  load(id: string): void {
    this.activeDesignId.set(id);
  }

  /**
   * 确保至少存在一个模型设计：等设计列表首帧到达后，若列表为空则创建
   * 默认设计 `schema` 并激活；已有设计时不做任何事。
   *
   * 供设计页「首次进入自动落进设计页」使用。并发调用共享同一在飞 Promise，
   * 不会重复创建。
   */
  ensureDefaultDesign(): Promise<ModelDesign | null> {
    this.#defaultDesignPromise ??= this.#createDefaultDesignIfNeeded();
    return this.#defaultDesignPromise;
  }

  async #createDefaultDesignIfNeeded(): Promise<ModelDesign | null> {
    try {
      await this.#designsGate();
      return this.designs().length === 0 ? await this.create(DEFAULT_MODEL_NAME) : null;
    } finally {
      this.#defaultDesignPromise = null;
    }
  }

  /** 更新模型设计字段 */
  async update(id: string, changes: Partial<Pick<ModelDesign, 'name' | 'description' | 'namespace'>>): Promise<void> {
    const design = this.designs().find(d => d.id === id);
    if (!design) throw new Error(`ModelDesign not found: ${id}`);
    await optimisticUpdate(design, changes);
  }

  /** 删除模型设计，若为当前激活设计则清空激活状态 */
  async remove(id: string): Promise<void> {
    const design = this.designs().find(d => d.id === id);
    if (!design) throw new Error(`ModelDesign not found: ${id}`);
    await design.remove();
    if (this.activeDesignId() === id) {
      this.activeDesignId.set(null);
    }
  }

  /** 复制模型设计及其全部实体/属性/关系/索引，不切换当前激活设计 */
  async copy(id: string): Promise<ModelDesign> {
    await this.#snapshotReady();
    const source = this.designs().find(d => d.id === id);
    if (!source) throw new Error(`ModelDesign not found: ${id}`);

    const name = generateCopyName(
      source.name,
      this.designs().map(d => d.name)
    );
    const design = new ModelDesign({ name, namespace: source.namespace, description: source.description });
    await design.save();

    const cloned = cloneDesignSnapshot(...this.#snapshotOf(id));
    const createMap = this.#buildCreateMap(cloned, design.id);
    if (createMap.size) {
      await this.#rxdb.entityManager.mutations({ create: createMap, update: new Map(), remove: new Map() });
    }

    return design;
  }

  /** 读取指定设计的实体/属性/关系/索引全量数据，供 {@link cloneDesignSnapshot} 消费 */
  #snapshotOf(
    designId: string
  ): [DesignEntitySnapshot[], DesignPropertySnapshot[], DesignRelationSnapshot[], DesignIndexSnapshot[]] {
    const entities = this.#allEntities().filter(e => e.modelDesignId === designId);
    const entityIds = new Set(entities.map(e => e.id));
    const properties = this.#allProperties().filter(p => entityIds.has(p.designEntityId));
    const relations = this.#allRelations().filter(r => entityIds.has(r.designEntityId));
    const indexes = this.#allIndexes().filter(i => entityIds.has(i.designEntityId));
    return [
      entities.map(toEntitySnapshot),
      properties.map(toPropertySnapshot),
      relations.map(toRelationSnapshot),
      indexes.map(toIndexSnapshot)
    ];
  }

  /** 将克隆快照转换为按实体类型分组的 create Map，克隆实体额外写入所属 modelDesignId */
  #buildCreateMap(cloned: ClonedSnapshot, modelDesignId: string): Map<unknown, Set<unknown>> {
    const em: CloneEntityManager = this.#rxdb.entityManager;
    const createMap = new Map<unknown, Set<unknown>>();

    if (cloned.entities.length) {
      createMap.set(
        DesignEntity,
        new Set(cloned.entities.map(e => em.createEntityRef(DesignEntity, { ...e, modelDesignId })))
      );
    }
    if (cloned.properties.length) {
      createMap.set(DesignProperty, new Set(cloned.properties.map(p => em.createEntityRef(DesignProperty, { ...p }))));
    }
    if (cloned.relations.length) {
      createMap.set(DesignRelation, new Set(cloned.relations.map(r => em.createEntityRef(DesignRelation, { ...r }))));
    }
    if (cloned.indexes.length) {
      createMap.set(DesignIndex, new Set(cloned.indexes.map(i => em.createEntityRef(DesignIndex, { ...i }))));
    }
    return createMap;
  }
}
