import { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../models/index.js';
import type { UUID } from '@aiao/rxdb';
import type { PropertyType } from '../constants/options';
import type { RelationKind } from '../constants/relation';
import type { AiEntityContext } from '../types/ai-schemas';
import { LAYOUT, calculateLayout, resolveEntityNameConflicts } from './ai-model-layout';
import {
  filterIncompleteEntities,
  mapEntityToRxDB,
  normalizeEntityName,
  normalizePropertyType,
  retainCompleteEntities
} from './ai-model-mapper';
import type { DesignEntityService } from './design-entity.service';
import type { DesignIndexService } from './design-index.service';
import type { DesignPropertyService } from './design-property.service';
import type { DesignRelationService } from './design-relation.service';
import { nextSortOrder } from './entity-utils';

/**
 * EntityManager 子集接口，用于 populate 批量创建
 */
export interface PopulateEntityManager {
  createEntityRef<T extends object>(EntityType: new (...args: never[]) => T, data: Record<string, unknown>): T;
  mutations(options: {
    create: Map<unknown, Set<unknown>>;
    update: Map<unknown, Set<unknown>>;
    remove: Map<unknown, Set<unknown>>;
  }): Promise<unknown>;
}

/**
 * AI 输出 → RxDB 模型写入服务
 *
 * 将 AI 生成的结构化输出映射为 RxDB 实体操作。
 */
export class AiModelPopulateService {
  readonly #entityService: DesignEntityService | undefined;
  readonly #propertyService: DesignPropertyService | undefined;
  readonly #relationService: DesignRelationService | undefined;
  readonly #indexService: DesignIndexService | undefined;
  readonly #entityManager: PopulateEntityManager | undefined;

  /**
   * 跨 populate() 调用的已提交 ID 集合
   *
   * mutations() 写入到 RxDB Worker 后，Angular 响应式信号可能不会立即反映新记录。
   * 在同一次生成流程中，安全网 fallback populate 可能读到过期信号并尝试重复写入
   * 相同的 AI UUID ID，导致 UNIQUE constraint 错误。
   * 通过维护内存中的已提交集合来防止跨调用的重复创建。
   */
  readonly #committedEntityIds = new Set<string>();
  readonly #committedPropertyIds = new Set<string>();
  readonly #committedRelationIds = new Set<string>();
  readonly #committedIndexIds = new Set<string>();

  /** @deprecated 使用导出的 mapEntityToRxDB 函数 */
  mapEntityToRxDB = mapEntityToRxDB;

  /** @deprecated 使用导出的 resolveEntityNameConflicts 函数 */
  resolveEntityNameConflicts = resolveEntityNameConflicts;

  /** @deprecated 使用导出的 calculateLayout 函数 */
  calculateLayout = calculateLayout;

  /** @deprecated 使用导出的 filterIncompleteEntities 函数 */
  filterIncompleteEntities = filterIncompleteEntities;

  /** @deprecated 使用导出的 retainCompleteEntities 函数 */
  retainCompleteEntities = retainCompleteEntities;

  /** @deprecated 使用导出的 normalizePropertyType 函数 */
  normalizePropertyType = normalizePropertyType;

  /** @deprecated 使用导出的 normalizeEntityName 函数 */
  normalizeEntityName = normalizeEntityName;

  constructor(
    entityService?: DesignEntityService,
    propertyService?: DesignPropertyService,
    relationService?: DesignRelationService,
    indexService?: DesignIndexService,
    entityManager?: PopulateEntityManager
  ) {
    this.#entityService = entityService;
    this.#propertyService = propertyService;
    this.#relationService = relationService;
    this.#indexService = indexService;
    this.#entityManager = entityManager;
  }

  /**
   * AI 实体列表 → RxDB 批量写入（upsert 语义）
   *
   * 有 entityManager 时使用 createEntityRef 直接指定 AI UUID 为真实 ID，
   * 一次 mutations 批量持久化，消除信号时序问题。
   * 无 entityManager 时回退到逐条 service 创建（仅测试用）。
   */
  async populate(aiEntities: AiEntityContext[], designId?: string): Promise<void> {
    if (!this.#entityService || !this.#propertyService || !this.#relationService || !this.#indexService) return;

    const existing = this.#entityService.entities();
    const valid = filterIncompleteEntities(aiEntities);
    if (!valid.length) return;

    if (this.#entityManager && designId) {
      await this.#populateWithEntityManager(valid, existing, designId);
    } else {
      await this.#populateLegacy(valid, existing);
    }
  }

  /**
   * 使用 createEntityRef 批量创建，AI UUID 直接成为真实 ID。
   * 所有新建项一次 mutations 写入，无信号时序问题。
   */
  async #populateWithEntityManager(
    valid: AiEntityContext[],
    existing: {
      id: string;
      name: string;
      displayName?: string | null;
      nodeX: number;
      nodeY: number;
      nodeWidth?: number;
      sortOrder: string;
    }[],
    designId: string
  ): Promise<void> {
    const em = this.#entityManager;
    const entityService = this.#entityService;
    const propertyService = this.#propertyService;
    const relationService = this.#relationService;
    const indexService = this.#indexService;
    if (!em || !entityService || !propertyService || !relationService || !indexService) {
      throw new Error('AI populate dependencies are not initialized');
    }
    const existingByName = new Map(existing.map(e => [e.name, e]));

    // 存在的实体 AI ID → 真实 ID（仅当 AI 给了不同的 ID 时需要映射）
    const idMap = new Map<string, string>();
    for (const e of existing) idMap.set(e.id, e.id);
    // 已提交但信号未更新的实体：AI UUID = 真实 ID
    for (const id of this.#committedEntityIds) idMap.set(id, id);

    // 分拣
    const toUpdate: { ai: AiEntityContext; existingId: string }[] = [];
    const toCreate: { ai: AiEntityContext; normalizedName: string }[] = [];

    for (const ai of valid) {
      const normalized = normalizeEntityName(ai.name);
      const match = existingByName.get(normalized);
      if (match) {
        toUpdate.push({ ai, existingId: match.id });
        if (ai.id && ai.id !== match.id) idMap.set(ai.id, match.id);
      } else if (ai.id && this.#committedEntityIds.has(ai.id)) {
        // 上次 populate() 已创建但 signal 尚未更新；AI UUID = 真实 ID
        toUpdate.push({ ai, existingId: ai.id });
      } else {
        toCreate.push({ ai, normalizedName: normalized });
      }
    }

    // 更新已有实体的 displayName（仅当实体在信号中可见时）
    for (const { ai, existingId } of toUpdate) {
      const entity = existing.find(e => e.id === existingId);
      if (entity && ai.displayName && entity.displayName !== ai.displayName) {
        await entityService.update(existingId, { displayName: ai.displayName });
      }
    }

    // 收集所有新建项
    const newEntities = new Set<DesignEntity>();
    const newProperties = new Set<DesignProperty>();
    const newRelations = new Set<DesignRelation>();
    const newIndexes = new Set<DesignIndex>();

    // 创建新实体（带 AI UUID）
    const newNames = toCreate.map(c => c.normalizedName);
    const resolvedNames = resolveEntityNameConflicts(newNames, [...existingByName.keys()]);
    const positions = calculateLayout(toCreate.length, existing);

    let entitySortBase = existing.length > 0 ? existing : [];
    for (const [index, item] of toCreate.entries()) {
      const ai = item.ai;
      const name = resolvedNames[index];
      const position = positions[index];
      if (!name || !position) throw new Error('AI entity layout is incomplete');
      const sortOrder = nextSortOrder(entitySortBase);
      const entity = em.createEntityRef(DesignEntity, {
        id: ai.id,
        name,
        displayName: ai.displayName ?? null,
        tableName: null,
        entityNamespace: ai.entityNamespace ?? null,
        extendsBase: 'EntityBase',
        repositoryType: 'Repository',
        nodeX: position.x,
        nodeY: position.y,
        nodeWidth: LAYOUT.NODE_WIDTH,
        sortOrder,
        modelDesignId: designId
      });
      newEntities.add(entity);
      this.#committedEntityIds.add(ai.id);
      entitySortBase = [
        ...entitySortBase,
        {
          id: ai.id,
          name,
          nodeX: position.x,
          nodeY: position.y,
          sortOrder
        } as (typeof existing)[number]
      ];
    }

    // 所有实体（已有 + 新建）的属性/关系/索引处理
    const allItems = [
      ...toUpdate.map(u => ({ ai: u.ai, entityId: u.existingId })),
      ...toCreate.map(c => ({ ai: c.ai, entityId: c.ai.id }))
    ];

    // 创建属性
    for (const { ai, entityId } of allItems) {
      const realEntityId = idMap.get(entityId) ?? entityId;
      const existingProps = propertyService.propertiesOf(realEntityId)();
      const existingPropNames = new Set(existingProps.map(p => p.name));
      // 映射已有属性 AI ID → 真实 ID（优先信号，再查已提交集合）
      for (const prop of ai.properties ?? []) {
        if (existingPropNames.has(prop.name)) {
          const real = existingProps.find(p => p.name === prop.name);
          if (real && prop.id) idMap.set(prop.id, real.id);
        } else if (prop.id && this.#committedPropertyIds.has(prop.id)) {
          idMap.set(prop.id, prop.id); // AI UUID = 真实 ID
        }
      }

      let propSortBase: { sortOrder: string }[] = [...existingProps];
      for (const prop of ai.properties ?? []) {
        if (existingPropNames.has(prop.name)) continue;
        // 已在前次 populate() 中创建但信号未更新（RxDB 异步通知）→ 跳过防重复
        if (prop.id && this.#committedPropertyIds.has(prop.id)) continue;
        const type = normalizePropertyType(prop.propertyType) as PropertyType;
        const sortOrder = nextSortOrder(propSortBase);
        const property = em.createEntityRef(DesignProperty, {
          id: prop.id,
          name: prop.name,
          propertyType: type,
          displayName: prop.displayName ?? null,
          columnName: null,
          isUnique: prop.isUnique ?? false,
          isNullable: prop.isNullable ?? false,
          isRequired: prop.isRequired ?? false,
          isReadonly: false,
          isSortable: false,
          defaultValue: prop.defaultValue ?? null,
          enumValues: prop.enumValues ?? null,
          sortOrder,
          designEntityId: realEntityId,
          parentId: null
        });
        newProperties.add(property);
        if (prop.id) this.#committedPropertyIds.add(prop.id);
        propSortBase = [...propSortBase, { sortOrder }];
      }
    }

    // 新建关系的 AI ID 集合（用于区分 updateBatch 范围）
    const newRelAiIds = new Set<string>();

    // 创建关系（两遍：先全量建立 idMap，再创建 ref）
    // 第一遍：映射所有已有关系 AI ID → 真实 ID
    for (const { ai, entityId } of allItems) {
      const realEntityId = idMap.get(entityId) ?? entityId;
      const existingRels = relationService.relationsOf(realEntityId)();
      const existingRelNames = new Set(existingRels.map(r => r.name));
      for (const rel of ai.relations ?? []) {
        if (existingRelNames.has(rel.name)) {
          const real = existingRels.find(r => r.name === rel.name);
          if (real && rel.id) idMap.set(rel.id, real.id);
        } else if (rel.id && this.#committedRelationIds.has(rel.id)) {
          idMap.set(rel.id, rel.id); // AI UUID = 真实 ID
        }
      }
    }

    // 第二遍：创建新关系 ref，mappedPropertyId 已能完整解析
    for (const { ai, entityId } of allItems) {
      const realEntityId = idMap.get(entityId) ?? entityId;
      const existingRels = relationService.relationsOf(realEntityId)();
      const existingRelNames = new Set(existingRels.map(r => r.name));

      let relSortBase: { sortOrder: string }[] = [...existingRels];
      for (const rel of ai.relations ?? []) {
        if (existingRelNames.has(rel.name)) continue;
        // 已在前次 populate() 中创建但信号未更新 → 跳过防重复
        if (rel.id && this.#committedRelationIds.has(rel.id)) continue;
        const realMappedEntityId = rel.mappedEntityId ? (idMap.get(rel.mappedEntityId) ?? rel.mappedEntityId) : null;
        // 直接解析 mappedPropertyId：新关系 AI UUID = 真实 ID，已有关系通过 idMap 解析
        const realMappedPropertyId =
          rel.mappedPropertyId ? (idMap.get(rel.mappedPropertyId) ?? rel.mappedPropertyId) : null;
        const sortOrder = nextSortOrder(relSortBase);
        const relation = em.createEntityRef(DesignRelation, {
          id: rel.id,
          name: rel.name,
          relationKind: rel.relationKind,
          mappedEntityId: realMappedEntityId,
          mappedPropertyId: realMappedPropertyId,
          mappedNamespace: null,
          columnName: null,
          displayName: null,
          onDeleteAction: rel.onDeleteAction ?? null,
          onUpdateAction: null,
          sortOrder,
          designEntityId: realEntityId
        });
        newRelations.add(relation);
        newRelAiIds.add(rel.id);
        if (rel.id) this.#committedRelationIds.add(rel.id);
        relSortBase = [...relSortBase, { sortOrder }];
      }
    }

    // 创建索引
    for (const { ai, entityId } of allItems) {
      const realEntityId = idMap.get(entityId) ?? entityId;
      for (const idx of ai.indexes ?? []) {
        // 已在前次 populate() 中创建但信号未更新 → 跳过防重复
        if (idx.id && this.#committedIndexIds.has(idx.id)) continue;
        const propIds = (idx.propertyIds ?? []).map(aiId => idMap.get(aiId) ?? aiId);
        if (propIds.length === 0) continue;
        const existingIndexes = indexService.indexesOf(realEntityId)();
        const sortOrder = nextSortOrder(existingIndexes);
        const index = em.createEntityRef(DesignIndex, {
          id: idx.id,
          propertyIds: propIds,
          isUnique: idx.isUnique ?? false,
          displayName: null,
          sortOrder,
          designEntityId: realEntityId
        });
        newIndexes.add(index);
        if (idx.id) this.#committedIndexIds.add(idx.id);
      }
    }

    // 一次性批量持久化
    const createMap = new Map<unknown, Set<unknown>>();
    if (newEntities.size) createMap.set(DesignEntity, newEntities as unknown as Set<unknown>);
    if (newProperties.size) createMap.set(DesignProperty, newProperties as unknown as Set<unknown>);
    if (newRelations.size) createMap.set(DesignRelation, newRelations as unknown as Set<unknown>);
    if (newIndexes.size) createMap.set(DesignIndex, newIndexes as unknown as Set<unknown>);

    if (createMap.size) {
      await em.mutations({ create: createMap, update: new Map(), remove: new Map() });
    }

    // 已有关系补链：mappedPropertyId 已在 idMap 中，updateBatch 可安全读取（关系早已存在于信号中）
    const relUpdates: { id: string; changes: { mappedPropertyId: string } }[] = [];
    for (const ai of valid) {
      for (const rel of ai.relations ?? []) {
        if (!rel.id || !rel.mappedPropertyId) continue;
        if (newRelAiIds.has(rel.id)) continue; // 新建关系已在 createEntityRef 中设置，跳过
        const realRelId = idMap.get(rel.id);
        if (!realRelId) continue;
        const realInverseId = idMap.get(rel.mappedPropertyId) ?? rel.mappedPropertyId;
        relUpdates.push({ id: realRelId, changes: { mappedPropertyId: realInverseId } });
      }
    }
    if (relUpdates.length) {
      await relationService.updateBatch(relUpdates);
    }
  }

  /**
   * 无 entityManager 时的回退路径（兼容测试和旧调用方式）
   */
  async #populateLegacy(
    valid: AiEntityContext[],
    existing: {
      id: string;
      name: string;
      displayName?: string | null;
      nodeX: number;
      nodeY: number;
      nodeWidth?: number;
    }[]
  ): Promise<void> {
    const entityService = this.#entityService;
    const propertyService = this.#propertyService;
    const relationService = this.#relationService;
    const indexService = this.#indexService;
    if (!entityService || !propertyService || !relationService || !indexService) {
      throw new Error('AI populate dependencies are not initialized');
    }
    const existingByName = new Map(existing.map(e => [e.name, e]));
    const idMap = new Map<string, string>();
    for (const e of existing) idMap.set(e.id, e.id);

    const toUpdate: { ai: AiEntityContext; existingId: string }[] = [];
    const toCreate: { ai: AiEntityContext; normalizedName: string }[] = [];

    for (const ai of valid) {
      const normalized = normalizeEntityName(ai.name);
      const match = existingByName.get(normalized);
      if (match) {
        toUpdate.push({ ai, existingId: match.id });
        if (ai.id) idMap.set(ai.id, match.id);
      } else {
        toCreate.push({ ai, normalizedName: normalized });
      }
    }

    for (const { ai, existingId } of toUpdate) {
      const entity = existing.find(e => e.id === existingId);
      if (entity && ai.displayName && entity.displayName !== ai.displayName) {
        await entityService.update(existingId, { displayName: ai.displayName });
      }
    }

    const newNames = toCreate.map(c => c.normalizedName);
    const resolvedNewNames = resolveEntityNameConflicts(newNames, [...existingByName.keys()]);
    const positions = calculateLayout(toCreate.length, existing);

    for (const [index, item] of toCreate.entries()) {
      const name = resolvedNewNames[index];
      const position = positions[index];
      if (!name || !position) throw new Error('AI entity layout is incomplete');
      const entity = await entityService.create(name);
      let needsSave = false;
      if (item.ai.displayName) {
        entity.displayName = item.ai.displayName;
        needsSave = true;
      }
      if (position.x !== entity.nodeX || position.y !== entity.nodeY) {
        entity.nodeX = position.x;
        entity.nodeY = position.y;
        needsSave = true;
      }
      if (needsSave) await entity.save();
      if (item.ai.id) idMap.set(item.ai.id, entity.id);
    }

    const allItems = [
      ...toUpdate.map(u => ({ ai: u.ai, entityId: u.existingId })),
      ...toCreate.map(c => ({ ai: c.ai, entityId: idMap.get(c.ai.id) ?? '' }))
    ];

    for (const { ai, entityId } of allItems) {
      if (!entityId) continue;
      const existingProps = propertyService.propertiesOf(entityId)();
      const propNameMap = new Map<string, string>(existingProps.map(p => [p.name, p.id]));

      for (const prop of ai.properties ?? []) {
        if (propNameMap.has(prop.name)) {
          const existingPropertyId = propNameMap.get(prop.name);
          if (prop.id && existingPropertyId) idMap.set(prop.id, existingPropertyId);
          continue;
        }
        const type = normalizePropertyType(prop.propertyType) as PropertyType;
        try {
          const created = await propertyService.create(entityId, prop.name, type);
          if (prop.id) idMap.set(prop.id, created.id);
          const extra: Partial<Parameters<DesignPropertyService['update']>[1]> = {};
          if (prop.displayName) extra.displayName = prop.displayName;
          if (prop.isRequired !== undefined) extra.isRequired = prop.isRequired;
          if (prop.isNullable !== undefined) extra.isNullable = prop.isNullable;
          if (prop.isUnique !== undefined) extra.isUnique = prop.isUnique;
          if (prop.defaultValue != null) extra.defaultValue = prop.defaultValue;
          if (prop.enumValues?.length) extra.enumValues = prop.enumValues;
          if (Object.keys(extra).length > 0) {
            await propertyService.update(created.id, extra);
          }
        } catch {
          /* 跳过重复或无效属性 */
        }
      }
    }

    const alreadyPaired = new Set<string>();
    for (const { ai, entityId } of allItems) {
      if (!entityId) continue;
      const existingRels = relationService.relationsOf(entityId)();
      const existingRelByName = new Map(existingRels.map(r => [r.name, r]));

      for (const rel of ai.relations ?? []) {
        const existingRel = rel.name ? existingRelByName.get(rel.name) : undefined;
        if (existingRel) {
          if (rel.id) idMap.set(rel.id, existingRel.id);
          if (existingRel.mappedPropertyId) alreadyPaired.add(existingRel.id);
          continue;
        }

        const realMappedEntityId = rel.mappedEntityId ? (idMap.get(rel.mappedEntityId) ?? null) : null;
        try {
          const relation = await relationService.create(
            entityId as UUID,
            realMappedEntityId as UUID | null,
            rel.relationKind as RelationKind
          );
          if (rel.id) idMap.set(rel.id, relation.id);
          if (rel.name || rel.onDeleteAction) {
            await relationService.update(relation.id, {
              ...(rel.name ? { name: rel.name } : {}),
              ...(rel.onDeleteAction ? { onDeleteAction: rel.onDeleteAction } : {})
            });
          }
        } catch {
          /* 跳过悬空或无效关系 */
        }
      }
    }

    for (const ai of valid) {
      for (const rel of ai.relations ?? []) {
        if (!rel.id || !rel.mappedPropertyId) continue;
        const realRelId = idMap.get(rel.id);
        if (!realRelId || alreadyPaired.has(realRelId)) continue;
        const realInverseId = idMap.get(rel.mappedPropertyId);
        if (realInverseId) {
          await relationService.update(realRelId, { mappedPropertyId: realInverseId });
        }
      }
    }

    for (const { ai, entityId } of allItems) {
      if (!entityId) continue;
      for (const idx of ai.indexes ?? []) {
        const propIds = (idx.propertyIds ?? [])
          .map((aiPropId: string) => idMap.get(aiPropId))
          .filter((id): id is string => !!id);
        if (propIds.length > 0) {
          try {
            await indexService.create(entityId, propIds, idx.isUnique);
          } catch {
            /* skip */
          }
        }
      }
    }
  }
}
