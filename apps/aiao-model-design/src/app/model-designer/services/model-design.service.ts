import {
  DesignEntity,
  DesignIndex,
  DesignProperty,
  DesignRelation,
  ModelDesign
} from '../models/index.js';
import { RxDB } from '@aiao/rxdb';
import { useFindAll } from '@aiao/rxdb-angular';
import { computed, inject, Injectable, signal } from '@angular/core';
import { generateCopyName } from '../constants/naming';
import { MODEL_DESIGNER_TRANSLATIONS } from '../i18n';
import {
  cloneDesignSnapshot,
  type ClonedSnapshot,
  type DesignEntitySnapshot,
  type DesignIndexSnapshot,
  type DesignPropertySnapshot,
  type DesignRelationSnapshot
} from '../utils/design-clone';
import type { PopulateEntityManager } from './ai-model-populate.service';
import { ConfirmDialogService } from './confirm-dialog.service';
import { optimisticUpdate } from './entity-utils';
import { createQueryGate, firstQueryError } from './lazy-query';

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
  readonly #confirmDialog = inject(ConfirmDialogService);
  readonly #t = inject(MODEL_DESIGNER_TRANSLATIONS);
  readonly #entitiesQuery = useFindAll(DesignEntity, { where: { combinator: 'and', rules: [] } });
  readonly #propertiesQuery = useFindAll(DesignProperty, { where: { combinator: 'and', rules: [] } });
  readonly #relationsQuery = useFindAll(DesignRelation, { where: { combinator: 'and', rules: [] } });
  readonly #indexesQuery = useFindAll(DesignIndex, { where: { combinator: 'and', rules: [] } });
  readonly #allEntities = this.#entitiesQuery.value;
  readonly #allProperties = this.#propertiesQuery.value;
  readonly #allRelations = this.#relationsQuery.value;
  readonly #allIndexes = this.#indexesQuery.value;

  /**
   * 快照类操作（copy / rollback）的就绪闸门。
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

  /**
   * 将目标设计回滚为快照设计的内容，需二次确认（危险操作，替换目标设计现有全部实体）
   * @returns 是否实际执行了回滚；用户取消确认时返回 `false`
   */
  async rollback(targetId: string, snapshotId: string): Promise<boolean> {
    await this.#snapshotReady();
    const target = this.designs().find(d => d.id === targetId);
    if (!target) throw new Error(`ModelDesign not found: ${targetId}`);
    const snapshot = this.designs().find(d => d.id === snapshotId);
    if (!snapshot) throw new Error(`ModelDesign not found: ${snapshotId}`);

    const confirmed = await this.#confirmDialog.confirm({
      title: this.#t().confirmDialog.rollbackTitle,
      message: this.#t().confirmDialog.rollbackMessage,
      danger: true
    });
    if (!confirmed) return false;

    const existingEntities = this.#allEntities().filter(e => e.modelDesignId === targetId);
    const removeMap = new Map<unknown, Set<unknown>>();
    if (existingEntities.length) removeMap.set(DesignEntity, new Set(existingEntities));

    const cloned = cloneDesignSnapshot(...this.#snapshotOf(snapshotId));
    const createMap = this.#buildCreateMap(cloned, targetId);

    if (createMap.size || removeMap.size) {
      await this.#rxdb.entityManager.mutations({ create: createMap, update: new Map(), remove: removeMap });
    }
    return true;
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
    const em: PopulateEntityManager = this.#rxdb.entityManager;
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
