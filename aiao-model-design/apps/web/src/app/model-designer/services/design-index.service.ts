import { RxDB, type UUID } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { computed, inject, Injectable, type Signal } from '@angular/core';
import { DesignIndex } from '../models/index.js';
import { compareSortOrder, nextSortOrder, optimisticUpdate } from './entity-utils';
import { firstQueryError } from './lazy-query';

/**
 * 设计索引管理服务
 *
 * 管理实体索引的 CRUD 和缓存。
 */
@Injectable()
export class DesignIndexService {
  readonly #rxdb = inject(RxDB);
  readonly #indexesQuery = useFindAll(DesignIndex, {
    where: {
      combinator: 'and',
      rules: []
    }
  });
  readonly #allIndexes = this.#indexesQuery.value;
  readonly #indexesCache = new Map<string, Signal<DesignIndex[]>>();

  /** 活查询失败时的消息（缺陷台账 #21） */
  readonly queryError = firstQueryError([this.#indexesQuery]);

  /** 获取指定实体的索引列表（按 sortOrder 排序，结果缓存） */
  indexesOf(entityId: string): Signal<DesignIndex[]> {
    let cached = this.#indexesCache.get(entityId);
    if (!cached) {
      cached = computed(() =>
        this.#allIndexes()
          .filter(i => i.designEntityId === entityId)
          .sort(compareSortOrder)
      );
      this.#indexesCache.set(entityId, cached);
    }
    return cached;
  }

  /** 创建新索引 */
  async create(entityId: string, propertyIds: string[], isUnique = false): Promise<DesignIndex> {
    const existing = this.#allIndexes().filter(i => i.designEntityId === entityId);
    const index = new DesignIndex({
      propertyIds,
      isUnique,
      sortOrder: nextSortOrder(existing)
    });
    index.designEntityId = entityId as UUID;
    await index.save();
    return index;
  }

  /** 更新索引属性 */
  async update(id: string, changes: Partial<Pick<DesignIndex, 'propertyIds' | 'isUnique'>>): Promise<void> {
    const index = this.#allIndexes().find(i => i.id === id);
    if (!index) throw new Error(`Index not found: ${id}`);
    await optimisticUpdate(index, changes);
  }

  /**
   * 批量更新多个索引，所有变更在同一个 mutations 事务中执行（单条历史记录）。
   */
  async updateBatch(
    items: {
      id: string;
      changes: Partial<Pick<DesignIndex, 'propertyIds' | 'isUnique' | 'displayName' | 'sortOrder'>>;
    }[]
  ): Promise<void> {
    if (!items.length) return;
    const toUpdate = new Set<DesignIndex>();
    const prevMap = new Map<DesignIndex, Record<string, unknown>>();
    for (const { id, changes } of items) {
      const idx = this.#allIndexes().find(i => i.id === id);
      if (!idx) continue;
      const prev = structuredClone(
        Object.fromEntries(Object.keys(changes).map(k => [k, (idx as unknown as Record<string, unknown>)[k]]))
      );
      prevMap.set(idx, prev);
      Object.assign(idx, changes);
      toUpdate.add(idx);
    }
    if (!toUpdate.size) return;
    const updateMap = new Map([[DesignIndex, toUpdate]]);
    try {
      await this.#rxdb.entityManager.mutations({ create: new Map(), update: updateMap, remove: new Map() });
    } catch (e) {
      for (const [idx, prev] of prevMap) Object.assign(idx, prev);
      throw e;
    }
  }

  /** 删除索引 */
  async remove(id: string): Promise<void> {
    const index = this.#allIndexes().find(i => i.id === id);
    if (!index) throw new Error(`Index not found: ${id}`);
    await index.remove();
  }

  /** 清除指定实体的索引缓存 */
  evictCache(entityId: string): void {
    this.#indexesCache.delete(entityId);
  }
}
