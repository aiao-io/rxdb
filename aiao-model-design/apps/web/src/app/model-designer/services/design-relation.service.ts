import { RxDB, UUID } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { computed, inject, Injectable, type Signal } from '@angular/core';
import { INVERSE_RELATION_KIND, RELATION_KINDS, type RelationKind } from '../constants';
import { DesignRelation } from '../models/index.js';
import { DesignEntityService } from './design-entity.service';
import { compareSortOrder, nextSortOrder, optimisticUpdate } from './entity-utils';
import { firstQueryError } from './lazy-query';

/**
 * 设计关系管理服务
 *
 * 管理实体间关系的 CRUD，支持按目标实体查找和批量删除。
 */
@Injectable()
export class DesignRelationService {
  readonly #rxdb = inject(RxDB);
  readonly #entityService = inject(DesignEntityService);

  readonly #relationsQuery = useFindAll(DesignRelation, {
    where: {
      combinator: 'and',
      rules: []
    }
  });
  readonly #allRelationsRaw = this.#relationsQuery.value;
  readonly #relationsCache = new Map<string, Signal<DesignRelation[]>>();

  /** 活查询失败时的消息（缺陷台账 #21） */
  readonly queryError = firstQueryError([this.#relationsQuery]);

  /** 当前模型设计下的所有关系（过滤了不属于当前设计的实体） */
  readonly allRelations = computed(() => {
    const entityIds = new Set(this.#entityService.entities().map(e => e.id));
    return this.#allRelationsRaw().filter(r => entityIds.has(r.designEntityId));
  });

  /** 获取指定实体的关系列表（按 sortOrder 排序，结果缓存） */
  relationsOf(entityId: string): Signal<DesignRelation[]> {
    let cached = this.#relationsCache.get(entityId);
    if (!cached) {
      cached = computed(() =>
        this.#allRelationsRaw()
          .filter(r => r.designEntityId === entityId)
          .sort(compareSortOrder)
      );
      this.#relationsCache.set(entityId, cached);
    }
    return cached;
  }

  /** 创建新关系，自动生成关系名称 */
  async create(sourceEntityId: UUID, targetEntityId: UUID | null, relationKind: RelationKind): Promise<DesignRelation> {
    const sourceEntity = this.#entityService.entities().find(e => e.id === sourceEntityId);
    if (!sourceEntity) throw new Error('Source entity not found');

    const targetEntity = targetEntityId ? this.#entityService.entities().find(e => e.id === targetEntityId) : null;
    if (targetEntityId && !targetEntity) throw new Error('Target entity not found');

    const name = this.#generateRelationName(targetEntity?.name, relationKind);
    const existing = this.#allRelationsRaw().filter(r => r.designEntityId === sourceEntityId);

    const relation = new DesignRelation({
      name,
      relationKind,
      mappedEntityId: targetEntityId,
      sortOrder: nextSortOrder(existing)
    });
    relation.designEntityId = sourceEntityId;
    await relation.save();

    return relation;
  }

  /**
   * 创建双向关系 pair（正 + 逆），并互写 `mappedPropertyId`。
   * 画布拖线 / 需要立即可渲染边的路径使用此方法。
   */
  async createLinkedPair(
    sourceEntityId: UUID,
    targetEntityId: UUID,
    relationKind: RelationKind = RELATION_KINDS.MANY_TO_ONE
  ): Promise<{ source: DesignRelation; inverse: DesignRelation }> {
    if (sourceEntityId === targetEntityId) {
      throw new Error('Cannot create relation pair on the same entity');
    }

    const source = await this.create(sourceEntityId, targetEntityId, relationKind);
    const inverse = await this.create(targetEntityId, sourceEntityId, INVERSE_RELATION_KIND[relationKind]);

    source.mappedPropertyId = inverse.id;
    inverse.mappedPropertyId = source.id;
    try {
      await this.#rxdb.entityManager.mutations({
        create: new Map(),
        update: new Map([[DesignRelation, new Set([source, inverse])]]),
        remove: new Map()
      });
    } catch (error) {
      source.mappedPropertyId = null;
      inverse.mappedPropertyId = null;
      throw error;
    }

    return { source, inverse };
  }

  /** 更新关系字段 */
  async update(
    id: string,
    changes: Partial<Omit<DesignRelation, 'id' | 'designEntityId' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    const relation = this.#allRelationsRaw().find(r => r.id === id);
    if (!relation) throw new Error(`Relation not found: ${id}`);
    await optimisticUpdate(relation, changes);
  }

  /**
   * 批量更新多个关系，所有变更在同一个 mutations 事务中执行（单条历史记录）。
   */
  async updateBatch(
    items: { id: string; changes: Partial<Omit<DesignRelation, 'id' | 'designEntityId' | 'createdAt' | 'updatedAt'>> }[]
  ): Promise<void> {
    if (!items.length) return;
    const toUpdate = new Set<DesignRelation>();
    const prevMap = new Map<DesignRelation, Record<string, unknown>>();
    for (const { id, changes } of items) {
      const rel = this.#allRelationsRaw().find(r => r.id === id);
      if (!rel) continue;
      const prev = structuredClone(
        Object.fromEntries(Object.keys(changes).map(k => [k, (rel as unknown as Record<string, unknown>)[k]]))
      );
      prevMap.set(rel, prev);
      Object.assign(rel, changes);
      toUpdate.add(rel);
    }
    if (!toUpdate.size) return;
    const updateMap = new Map([[DesignRelation, toUpdate]]);
    try {
      await this.#rxdb.entityManager.mutations({ create: new Map(), update: updateMap, remove: new Map() });
    } catch (e) {
      for (const [rel, prev] of prevMap) Object.assign(rel, prev);
      throw e;
    }
  }

  /** 删除关系 */
  async remove(id: string): Promise<void> {
    const relation = this.#allRelationsRaw().find(r => r.id === id);
    if (!relation) throw new Error(`Relation not found: ${id}`);
    await relation.remove();
  }

  /** 清除指定实体的关系缓存 */
  evictCache(entityId: string): void {
    this.#relationsCache.delete(entityId);
  }

  /** 查找目标实体为指定 ID 的所有关系 */
  findByTargetEntity(entityId: string): DesignRelation[] {
    return this.#allRelationsRaw().filter(r => r.mappedEntityId === entityId);
  }

  /** 批量删除指向指定实体的所有关系 */
  async removeByTargetEntity(entityId: string): Promise<void> {
    const toRemove = this.findByTargetEntity(entityId);
    if (toRemove.length === 0) return;

    const removeMap = new Map<typeof DesignRelation, Set<DesignRelation>>();
    removeMap.set(DesignRelation, new Set(toRemove));

    await this.#rxdb.entityManager.mutations({
      create: new Map(),
      update: new Map(),
      remove: removeMap
    });
  }

  #generateRelationName(targetName: string | undefined, kind: RelationKind): string {
    if (!targetName) return 'newRelation';
    const base = targetName.charAt(0).toLowerCase() + targetName.slice(1);
    return kind === RELATION_KINDS.ONE_TO_MANY ? base + 's' : base;
  }
}
