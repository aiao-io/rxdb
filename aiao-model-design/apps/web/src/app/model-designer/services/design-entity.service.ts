import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { computed, inject, Injectable, Injector, signal } from '@angular/core';
import { generateUniqueName } from '../constants';
import { DesignEntity, DesignRelation } from '../models/index.js';
import { DesignIndexService } from './design-index.service';
import { DesignPropertyService } from './design-property.service';
import { DesignRelationService } from './design-relation.service';
import { nextSortOrder, optimisticUpdate, reorderItems } from './entity-utils';
import { firstQueryError } from './lazy-query';
import { ModelDesignService } from './model-design.service';
import { ModelValidatorService } from './model-validator.service';

/**
 * 新建实体的初始画布坐标。
 *
 * ⚠️ 此前是「对角线错开 + 取模」：`(n % 5) * 40` 同时作用于 x 和 y，
 * 于是第 6 个实体（n=5，取模回 0）与第 1 个**完全重叠**在 (100,100)，
 * 第 7 个压第 2 个，以此类推——恰好踩中 US-220 AC#1「已有 5+ 实体」的前置条件
 *（specs/027 e2e 2026-07-27 实测）。取模本身是对的（防止实体多了无限往右下跑偏），
 * 错在把一维序号投影到一条对角线上。改为二维网格：列内换行、行数增长，
 * 任意 n 都不重叠，且横向宽度有界。
 */
const NODE_POSITION = {
  DEFAULT_X: 100,
  DEFAULT_Y: 100,
  /**
   * 每行最多排几个，超出换行。
   * 3 列 × 260px 列宽 + 240px 节点宽 ≈ 880px，留在常见画布可视区内——
   * x6 不渲染视口外的 Angular shape，排太宽会让新建的实体「看不见」。
   */
  COLUMNS: 3,
  COLUMN_WIDTH: 260,
  ROW_HEIGHT: 180
} as const;

/** 按序号算出不重叠的初始坐标（纯函数，便于单测） */
export function resolveInitialNodePosition(index: number): { nodeX: number; nodeY: number } {
  const column = index % NODE_POSITION.COLUMNS;
  const row = Math.floor(index / NODE_POSITION.COLUMNS);
  return {
    nodeX: NODE_POSITION.DEFAULT_X + column * NODE_POSITION.COLUMN_WIDTH,
    nodeY: NODE_POSITION.DEFAULT_Y + row * NODE_POSITION.ROW_HEIGHT
  };
}

/**
 * 设计实体管理服务
 *
 * 管理模型设计中实体的 CRUD、选择、排序和画布位置。
 */
@Injectable()
export class DesignEntityService {
  readonly #rxdb = inject(RxDB);
  readonly #modelDesignService = inject(ModelDesignService);
  readonly #validator = inject(ModelValidatorService);
  readonly #injector = inject(Injector);

  readonly #entitiesQuery = useFindAll(DesignEntity, {
    where: {
      combinator: 'and',
      rules: []
    }
  });
  readonly #allEntities = this.#entitiesQuery.value;

  /** 活查询失败时的消息；失败即订阅终止，列表会永远停在最后一帧（缺陷台账 #21） */
  readonly queryError = firstQueryError([this.#entitiesQuery]);

  /** 当前模型设计下的所有实体（响应式） */
  readonly entities = computed(() => {
    const designId = this.#modelDesignService.activeDesignId();
    if (!designId) return [];
    return this.#allEntities().filter(e => e.modelDesignId === designId);
  });

  /** 当前模型设计下所有实体名称列表 */
  readonly entityNames = computed(() => this.entities().map(e => e.name));

  /** 当前选中的实体 ID 集合 */
  readonly selectedEntityIds = signal<ReadonlySet<string>>(new Set());

  /** 选中单个实体（替换选择集） */
  selectOne(id: string): void {
    this.selectedEntityIds.set(new Set([id]));
  }

  /** 切换选中状态（Ctrl+Click） */
  toggleSelect(id: string): void {
    const current = new Set(this.selectedEntityIds());
    if (current.has(id)) {
      current.delete(id);
    } else {
      current.add(id);
    }
    this.selectedEntityIds.set(current);
  }

  /** 批量设置选中（框选） */
  selectMany(ids: string[]): void {
    this.selectedEntityIds.set(new Set(ids));
  }

  /** 清空选择 */
  clearSelection(): void {
    this.selectedEntityIds.set(new Set());
  }

  /** 创建新实体，自动生成唯一名称和画布位置；可指定命名空间 */
  async create(name?: string, namespace?: string): Promise<DesignEntity> {
    const design = this.#modelDesignService.activeDesign();
    if (!design) throw new Error('No active model design');
    const existingNames = this.entityNames();
    const finalName = name ?? generateUniqueName('NewEntity', existingNames);
    const entities = this.entities();
    const { nodeX, nodeY } = resolveInitialNodePosition(entities.length);

    const entity = new DesignEntity({
      name: finalName,
      entityNamespace: namespace ?? undefined,
      sortOrder: nextSortOrder(entities),
      nodeX,
      nodeY
    });
    entity.modelDesignId = design.id;
    this.#assertValidIdentity(entity, entities);
    await entity.save();
    return entity;
  }

  /** 更新实体基本信息 */
  async update(
    id: string,
    changes: Partial<
      Pick<DesignEntity, 'name' | 'tableName' | 'displayName' | 'entityNamespace' | 'extendsBase' | 'repositoryType'>
    >
  ): Promise<void> {
    const entity = this.entities().find(e => e.id === id);
    if (!entity) throw new Error(`Entity not found: ${id}`);
    const candidate = { ...entity, ...changes } as DesignEntity;
    this.#assertValidIdentity(
      candidate,
      this.entities().filter(item => item.id !== id)
    );
    await optimisticUpdate(entity, changes);
  }

  /** 更新实体在画布上的位置 */
  async updatePosition(id: string, x: number, y: number): Promise<void> {
    const entity = this.entities().find(e => e.id === id);
    if (!entity) throw new Error(`Entity not found: ${id}`);
    await optimisticUpdate(entity, { nodeX: x, nodeY: y });
  }

  /** 批量更新多个实体在画布上的位置（单事务，单条历史记录） */
  async updatePositionsBatch(items: { id: string; x: number; y: number }[]): Promise<void> {
    if (items.length === 0) return;

    const entities = this.entities();
    const updates = items.map(item => {
      const entity = entities.find(e => e.id === item.id);
      if (!entity) throw new Error(`Entity not found: ${item.id}`);
      return { entity, x: item.x, y: item.y };
    });

    const toUpdate = new Set<DesignEntity>();
    const prevMap = new Map<DesignEntity, { nodeX: number; nodeY: number }>();
    for (const { entity, x, y } of updates) {
      prevMap.set(entity, { nodeX: entity.nodeX, nodeY: entity.nodeY });
      entity.nodeX = x;
      entity.nodeY = y;
      toUpdate.add(entity);
    }

    if (toUpdate.size === 0) return;

    const updateMap = new Map([[DesignEntity, toUpdate]]);
    try {
      await this.#rxdb.entityManager.mutations({
        create: new Map(),
        update: updateMap,
        remove: new Map()
      });
    } catch (e) {
      for (const [entity, prev] of prevMap) {
        entity.nodeX = prev.nodeX;
        entity.nodeY = prev.nodeY;
      }
      throw e;
    }
  }

  /** 更新实体在画布上的宽度 */
  async updateWidth(id: string, width: number): Promise<void> {
    const entity = this.entities().find(e => e.id === id);
    if (!entity) throw new Error(`Entity not found: ${id}`);
    await optimisticUpdate(entity, { nodeWidth: width });
  }

  /** 删除实体及其关联的目标关系，清理缓存 */
  async remove(id: string): Promise<void> {
    await this.removeMany([id]);
  }

  /**
   * 批量删除多个实体，所有变更在单一事务内完成
   *
   * 同时清除关联的目标关系、属性缓存、索引缓存，并更新选中集合。
   */
  async removeMany(ids: string[]): Promise<void> {
    if (ids.length === 0) return;

    const entities = this.entities();
    const toRemoveEntities = ids.map(id => {
      const e = entities.find(en => en.id === id);
      if (!e) throw new Error(`Entity not found: ${id}`);
      return e;
    });

    const relationService = this.#injector.get(DesignRelationService);
    const allTargetRelations = ids.flatMap(id => relationService.findByTargetEntity(id));

    const removeMap = new Map<typeof DesignEntity | typeof DesignRelation, Set<DesignEntity | DesignRelation>>();
    if (allTargetRelations.length > 0) {
      removeMap.set(DesignRelation, new Set(allTargetRelations));
    }
    removeMap.set(DesignEntity, new Set(toRemoveEntities));

    await this.#rxdb.entityManager.mutations({
      create: new Map(),
      update: new Map(),
      remove: removeMap
    });

    const propertyService = this.#injector.get(DesignPropertyService);
    const indexService = this.#injector.get(DesignIndexService);
    for (const id of ids) {
      relationService.evictCache(id);
      propertyService.evictCache(id);
      indexService.evictCache(id);
    }

    const sel = new Set(this.selectedEntityIds());
    let changed = false;
    for (const id of ids) {
      if (sel.delete(id)) changed = true;
    }
    if (changed) this.selectedEntityIds.set(sel);
  }

  /** 按 ID 数组顺序重排实体 sortOrder */
  async reorder(ids: string[]): Promise<void> {
    await reorderItems(this.entities(), ids);
  }

  #assertValidIdentity(entity: DesignEntity, siblings: DesignEntity[]): void {
    const validation = this.#validator.validateEntityIdentity(entity, siblings);
    if (!validation.valid) throw new Error(validation.errors.join(', '));
  }
}
