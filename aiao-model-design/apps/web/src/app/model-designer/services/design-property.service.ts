import { RxDB, type UUID } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { computed, inject, Injectable, Injector, type Signal } from '@angular/core';
import { KEYVALUE_SUB_TYPES, type PropertyType } from '../constants';
import { DesignIndex, DesignProperty } from '../models/index.js';
import { DesignEntityService } from './design-entity.service';
import { DesignIndexService } from './design-index.service';
import { compareSortOrder, nextSortOrder, optimisticUpdate, reorderItems } from './entity-utils';
import { firstQueryError } from './lazy-query';

/**
 * 设计属性管理服务
 *
 * 管理实体属性的 CRUD，删除时级联清理引用该属性的索引。
 * 支持 keyValue 类型的嵌套子属性。
 */
@Injectable()
export class DesignPropertyService {
  readonly #rxdb = inject(RxDB);
  readonly #injector = inject(Injector);
  readonly #entityService = inject(DesignEntityService);
  readonly #propertiesQuery = useFindAll(DesignProperty, {
    where: {
      combinator: 'and',
      rules: []
    }
  });
  readonly #allProperties = this.#propertiesQuery.value;
  readonly #propertiesCache = new Map<string, Signal<DesignProperty[]>>();
  readonly #childPropertiesCache = new Map<string, Signal<DesignProperty[]>>();

  /** 活查询失败时的消息（缺陷台账 #21） */
  readonly queryError = firstQueryError([this.#propertiesQuery]);

  /** keyValue 子属性允许的类型 */
  readonly keyValueSubTypes = KEYVALUE_SUB_TYPES;

  /** 当前模型设计下的所有属性（过滤了不属于当前设计的实体） */
  readonly allProperties = computed(() => {
    const entityIds = new Set(this.#entityService.entities().map(e => e.id));
    return this.#allProperties().filter(p => entityIds.has(p.designEntityId));
  });

  /** 获取指定实体的顶层属性列表（按 sortOrder 排序，结果缓存） */
  propertiesOf(entityId: string): Signal<DesignProperty[]> {
    let cached = this.#propertiesCache.get(entityId);
    if (!cached) {
      cached = computed(() =>
        this.#allProperties()
          .filter(p => p.designEntityId === entityId && !p.parentId)
          .sort(compareSortOrder)
      );
      this.#propertiesCache.set(entityId, cached);
    }
    return cached;
  }

  /** 获取指定父属性的子属性列表（按 sortOrder 排序，结果缓存） */
  childPropertiesOf(parentId: string): Signal<DesignProperty[]> {
    let cached = this.#childPropertiesCache.get(parentId);
    if (!cached) {
      cached = computed(() =>
        this.#allProperties()
          .filter(p => p.parentId === parentId)
          .sort(compareSortOrder)
      );
      this.#childPropertiesCache.set(parentId, cached);
    }
    return cached;
  }

  /** 创建新属性 */
  async create(entityId: string, name: string, propertyType: PropertyType, parentId?: string): Promise<DesignProperty> {
    const siblings =
      parentId ?
        this.#allProperties().filter(p => p.parentId === parentId)
      : this.#allProperties().filter(p => p.designEntityId === entityId && !p.parentId);

    // 子属性同名校验
    if (siblings.some(s => s.name === name)) {
      throw new Error(`Duplicate child property name: ${name}`);
    }

    const property = new DesignProperty({
      name,
      propertyType,
      sortOrder: nextSortOrder(siblings)
    });
    property.designEntityId = entityId as UUID;
    if (parentId) property.parentId = parentId as UUID;
    await property.save();
    return property;
  }

  /** 更新属性字段 */
  async update(
    id: string,
    changes: Partial<Omit<DesignProperty, 'id' | 'designEntityId' | 'createdAt' | 'updatedAt'>>
  ): Promise<void> {
    const property = this.#allProperties().find(p => p.id === id);
    if (!property) throw new Error(`Property not found: ${id}`);

    // 子属性同名校验
    if (changes.name != null) {
      const siblings =
        property.parentId ?
          this.#allProperties().filter(p => p.parentId === property.parentId && p.id !== id)
        : this.#allProperties().filter(p => p.designEntityId === property.designEntityId && !p.parentId && p.id !== id);
      if (siblings.some(s => s.name === changes.name)) {
        throw new Error(`Duplicate property name: ${changes.name}`);
      }
    }

    // keyValue 类型变更为非 keyValue 时，级联删除所有子属性（同一事务）
    if (changes.propertyType && property.propertyType === 'keyValue' && changes.propertyType !== 'keyValue') {
      const children = this.#allProperties().filter(p => p.parentId === id);
      // 从 enum 切换走时清理 enumValues
      if (changes.propertyType !== 'enum') {
        changes = { ...changes, enumValues: null } as typeof changes;
      }
      const prev = structuredClone(
        Object.fromEntries(Object.keys(changes).map(k => [k, (property as unknown as Record<string, unknown>)[k]]))
      );
      Object.assign(property, changes);

      const updateMap = new Map<typeof DesignProperty, Set<DesignProperty>>([[DesignProperty, new Set([property])]]);
      const removeMap = new Map<typeof DesignProperty, Set<DesignProperty>>();
      if (children.length > 0) {
        removeMap.set(DesignProperty, new Set(children));
      }

      try {
        await this.#rxdb.entityManager.mutations({
          create: new Map(),
          update: updateMap,
          remove: removeMap
        });
      } catch (e) {
        Object.assign(property, prev);
        throw e;
      }
      return;
    }

    // 从 enum 切换为其他类型时清理 enumValues
    if (changes.propertyType && property.propertyType === 'enum' && changes.propertyType !== 'enum') {
      changes = { ...changes, enumValues: null } as typeof changes;
    }

    await optimisticUpdate(property, changes);
  }

  /**
   * 批量更新多个属性，所有变更在同一个 mutations 事务中执行（单条历史记录）。
   * 仅做简单的字段覆盖，不处理 keyValue 级联逻辑。
   * 不支持 propertyType 变更——类型切换涉及子属性级联，必须通过 update() 逐个处理。
   */
  async updateBatch(
    items: { id: string; changes: Partial<Omit<DesignProperty, 'id' | 'designEntityId' | 'createdAt' | 'updatedAt'>> }[]
  ): Promise<void> {
    if (!items.length) return;
    if (items.some(i => 'propertyType' in i.changes)) {
      throw new Error('updateBatch does not support propertyType changes; use update() instead');
    }
    const toUpdate = new Set<DesignProperty>();
    const prevMap = new Map<DesignProperty, Record<string, unknown>>();
    for (const { id, changes } of items) {
      const prop = this.#allProperties().find(p => p.id === id);
      if (!prop) continue;
      const prev = structuredClone(
        Object.fromEntries(Object.keys(changes).map(k => [k, (prop as unknown as Record<string, unknown>)[k]]))
      );
      prevMap.set(prop, prev);
      Object.assign(prop, changes);
      toUpdate.add(prop);
    }
    if (!toUpdate.size) return;
    const updateMap = new Map([[DesignProperty, toUpdate]]);
    try {
      await this.#rxdb.entityManager.mutations({ create: new Map(), update: updateMap, remove: new Map() });
    } catch (e) {
      for (const [prop, prev] of prevMap) Object.assign(prop, prev);
      throw e;
    }
  }

  /**
   * 删除属性，同时级联清理引用该属性的索引和子属性。
   * 如果索引的 propertyIds 移除该属性后为空，则删除整个索引。
   * 仍有剩余属性的索引直接 UPDATE propertyIds。
   * 所有变更在同一个 mutations 事务中执行，保证 undo/redo 原子性。
   */
  async remove(id: string): Promise<void> {
    const property = this.#allProperties().find(p => p.id === id);
    if (!property) throw new Error(`Property not found: ${id}`);

    const indexService = this.#injector.get(DesignIndexService);
    const indexes = indexService.indexesOf(property.designEntityId)();

    const removeMap = new Map<typeof DesignProperty | typeof DesignIndex, Set<DesignProperty | DesignIndex>>();
    const updateMap = new Map<typeof DesignProperty | typeof DesignIndex, Set<DesignProperty | DesignIndex>>();

    const propertiesToRemove = new Set<DesignProperty>([property]);

    // 级联删除子属性
    const children = this.#allProperties().filter(p => p.parentId === id);
    for (const child of children) {
      propertiesToRemove.add(child);
    }

    removeMap.set(DesignProperty, propertiesToRemove);

    const indexesToRemove = new Set<DesignIndex>();
    const indexesToUpdate = new Set<DesignIndex>();

    const allRemovedIds = new Set<string>([...propertiesToRemove].map(p => p.id));

    for (const idx of indexes) {
      const hasRef = idx.propertyIds.some(pid => allRemovedIds.has(pid));
      if (!hasRef) continue;
      const remaining = idx.propertyIds.filter(pid => !allRemovedIds.has(pid));
      if (remaining.length === 0) {
        indexesToRemove.add(idx);
      } else {
        idx.propertyIds = remaining;
        indexesToUpdate.add(idx);
      }
    }

    if (indexesToRemove.size > 0) removeMap.set(DesignIndex, indexesToRemove);
    if (indexesToUpdate.size > 0) updateMap.set(DesignIndex, indexesToUpdate);

    await this.#rxdb.entityManager.mutations({
      create: new Map(),
      update: updateMap,
      remove: removeMap
    });
  }

  /** 清除指定实体的属性缓存 */
  evictCache(entityId: string): void {
    this.#propertiesCache.delete(entityId);
  }

  /** 按 ID 数组顺序重排属性 sortOrder */
  async reorder(ids: string[]): Promise<void> {
    await reorderItems(this.#allProperties(), ids);
  }
}
