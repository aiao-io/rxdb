import type { DesignEntity, DesignIndex, DesignProperty, DesignRelation } from '../../models/index.js';
import {
  EntityTableComponent,
  ensureBaseEditorRegistered,
  type BatchChangeItem,
  type CellChangeEvent,
  type EntityTableRecord
} from '@aiao/rxdb-model-angular';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  output,
  signal,
  viewChild
} from '@angular/core';
import {
  CASCADE_ACTIONS,
  PROPERTY_COLUMN_NAME_PATTERN,
  PROPERTY_NAME_PATTERN,
  PROPERTY_TYPES,
  RELATION_KIND_OPTIONS,
  generateUniqueName,
  type ExtendsOption
} from '../../constants';
import { MODEL_DESIGNER_TRANSLATIONS } from '../../i18n/translations';
import type { DesignIndexChanges, DesignPropertyChanges, DesignRelationChanges } from '../../interfaces';
import { RelationFieldErrors } from '../../interfaces/designer.interface';
import {
  buildCustomProperties,
  buildInheritedProperties,
  buildInheritedRelations,
  buildTargetRelationsByEntity
} from '../shared/entity-edit-utils';
import {
  handleIndexCellChange,
  handlePropertyCellChange,
  handleRelationCellChange,
  type PropertyCellCallbacks
} from './table-cell-handlers';
import { buildIndexRecords, buildPropertyRecords, buildRelationRecords } from './table-records';
import { detectCellError } from './table-tooltip';

import { generateKeysBetween } from '@aiao/utils';
import { createIndexColumns } from './table.columns.indexes';
import { createPropertyColumns, type PropertyColumnsErrorContext } from './table.columns.properties';
import { createRelationColumns, type RelationColumnsErrorContext } from './table.columns.relations';
import type { DropdownOptions } from './table.columns.shared';
import type { DetailTab, TableRecord } from './table.types';

let domainEditorRegistered = false;

/** 严格按路由实体 ID 解析活动实体，不对缺失上下文做隐式回退 */
export function resolveActiveEntity(entities: DesignEntity[], entityId: string | null): DesignEntity | null {
  if (!entityId) return null;
  return entities.find(entity => entity.id === entityId) ?? null;
}

/** 注册模型设计器领域编辑器（在基础编辑器之上） */
function ensureDomainEditorsRegistered(): void {
  ensureBaseEditorRegistered();
  if (domainEditorRegistered) return;
  domainEditorRegistered = true;
}

/**
 * 表格视图组件
 *
 * 委托 EntityTableComponent 管理 VTable 实例，
 * 专注于模型设计领域逻辑（记录构建、列定义、单元格处理、排序）。
 */
@Component({
  selector: 'lib-table-view',
  imports: [EntityTableComponent],
  templateUrl: './table-view.component.html',
  styleUrl: './table-view.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class TableViewComponent {
  /** 每个属性 ID 的校验错误（name / columnName）。切换标签页或值变合法时清除 */
  readonly #propertyErrors = signal<Map<string, { name?: boolean; columnName?: boolean }>>(new Map());
  /** 新增属性行的名称校验失败状态 */
  readonly #addRowNameError = signal(false);
  /** 多选编辑器提交的属性 ID，由 createIndexColumns 回调写入，handleIndexCellChange 消耗后清空 */
  #pendingPropertyIds: string[] | null = null;
  readonly #propertyCellCallbacks: PropertyCellCallbacks = {
    setPropertyError: (id, f, err) => this.#setPropertyError(id, f, err),
    setAddRowNameError: err => this.#addRowNameError.set(err),
    revertCell: (c, r, v) => this.entityTable()?.changeCellValue(c, r, v),
    emitPropertyAdded: ev => this.propertyAdded.emit(ev),
    emitPropertyUpdated: ev => this.propertyUpdated.emit(ev)
  };

  protected readonly entityTable = viewChild(EntityTableComponent);
  protected readonly t = inject(MODEL_DESIGNER_TRANSLATIONS);

  // ── 输入 ──────────────────────────────────────────────────────────
  readonly entities = input.required<DesignEntity[]>();
  readonly propertiesMap = input.required<Map<string, DesignProperty[]>>();
  readonly childPropertiesMap = input<Map<string, DesignProperty[]>>(new Map());
  readonly relationsMap = input<Map<string, DesignRelation[]>>(new Map());
  readonly invalidRelationIds = input<ReadonlySet<string>>(new Set());
  readonly relationFieldErrors = input<RelationFieldErrors>(new Map());
  readonly missingInverseRelationIds = input<ReadonlySet<string>>(new Set());
  readonly indexesMap = input<Map<string, DesignIndex[]>>(new Map());

  readonly isDarkMode = input<boolean>(false);
  readonly activeEntityId = input<string | null>(null);
  readonly detailTab = input<DetailTab>('properties');

  // ── 输出 ──────────────────────────────────────────────────────────
  readonly propertyUpdated = output<{ id: string; changes: DesignPropertyChanges }>();
  readonly propertiesBatchUpdated = output<{ id: string; changes: DesignPropertyChanges }[]>();
  readonly propertyAdded = output<{ entityId: string; name: string; type: string }>();
  readonly propertyDeleted = output<string>();
  readonly childPropertyAdded = output<{ entityId: string; parentPropertyId: string; name: string; type: string }>();
  readonly relationUpdated = output<{ id: string; changes: DesignRelationChanges }>();
  readonly relationsBatchUpdated = output<{ id: string; changes: DesignRelationChanges }[]>();
  readonly relationDeleted = output<string>();
  readonly relationAdded = output<{ entityId: string; name: string; kind: string; targetEntity: string }>();
  readonly indexUpdated = output<{ id: string; changes: DesignIndexChanges }>();
  readonly indexesBatchUpdated = output<{ id: string; changes: DesignIndexChanges }[]>();
  readonly indexDeleted = output<string>();
  readonly indexAdded = output<{ entityId: string; propertyIds: string[]; isUnique: boolean }>();

  // ── 领域计算 ──────────────────────────────────────────────────────
  readonly activeEntity = computed(() => {
    return resolveActiveEntity(this.entities(), this.activeEntityId());
  });

  readonly currentExtendsBase = computed(() => (this.activeEntity()?.extendsBase || 'EntityBase') as ExtendsOption);
  readonly activeInheritedProperties = buildInheritedProperties(this.currentExtendsBase);
  readonly activeInheritedRelations = buildInheritedRelations(this.currentExtendsBase);

  readonly activeEntityProperties = computed(() => {
    const entity = this.activeEntity();
    if (!entity) return [];
    return (this.propertiesMap().get(entity.id) ?? []) as DesignProperty[];
  });

  readonly customProperties = computed(() => buildCustomProperties(this.activeEntityProperties)());

  readonly activeEntityRelations = computed(() => {
    const entity = this.activeEntity();
    if (!entity) return [];
    return (this.relationsMap().get(entity.id) ?? []) as DesignRelation[];
  });

  readonly activeEntityIndexes = computed(() => {
    const entity = this.activeEntity();
    if (!entity) return [];
    return (this.indexesMap().get(entity.id) ?? []) as DesignIndex[];
  });

  readonly activeProperties = computed(() => this.customProperties().map(p => ({ id: p.id, name: p.name })));

  /** 索引下拉可选属性：继承属性（仅 property 类型）+ 自定义属性 */
  readonly activePropertiesForIndex = computed(() => [
    ...this.activeInheritedProperties()
      .filter(p => p.category === 'property')
      .map(p => ({ id: p.name, name: p.displayName })),
    ...this.activeProperties()
  ]);

  readonly flatAllRelations = computed(() => [...this.relationsMap().values()].flat());
  readonly targetRelationsByEntity = buildTargetRelationsByEntity(this.flatAllRelations);

  readonly dropdownOptions = computed<DropdownOptions>(() => {
    const entities = this.entities();
    const targetRelByEntityMap = this.targetRelationsByEntity();
    const targetRelMap = new Map<string, { id: string; name: string }[]>();
    for (const [key, value] of targetRelByEntityMap) {
      targetRelMap.set(
        key,
        value.map(r => ({ id: r.id, name: r.name }))
      );
    }
    return {
      propertyTypes: PROPERTY_TYPES,
      relationKinds: RELATION_KIND_OPTIONS,
      cascadeActions: CASCADE_ACTIONS,
      entities: entities.map(e => ({ id: e.id, name: e.name })),
      targetRelationsByEntity: targetRelMap,
      availableProperties: this.activePropertiesForIndex()
    };
  });

  // ── EntityTableComponent 绑定信号 ─────────────────────────────────

  /** 表格记录（根据当前标签页构建） */
  readonly tableRecords = computed<EntityTableRecord[]>(() => {
    if (!this.activeEntity()) return [];
    const tab = this.detailTab();
    if (tab === 'properties') {
      return buildPropertyRecords(this.activeInheritedProperties(), this.customProperties(), this.childPropertiesMap());
    } else if (tab === 'relations') {
      return buildRelationRecords(
        this.activeInheritedRelations(),
        this.activeEntityRelations(),
        this.entities(),
        this.targetRelationsByEntity(),
        this.invalidRelationIds()
      );
    }
    return buildIndexRecords(this.activeEntityIndexes(), this.activePropertiesForIndex());
  });

  /** 表格列定义（根据当前标签页 + 错误上下文 + 下拉选项构建） */
  readonly tableColumns = computed(() => {
    const tab = this.detailTab();
    const t = this.t();
    const opts = this.dropdownOptions();
    if (tab === 'properties') {
      return createPropertyColumns(t, this.#getPropertyErrorContext(), opts);
    } else if (tab === 'relations') {
      return createRelationColumns(t, opts, this.#getRelationErrorContext());
    }
    return createIndexColumns(t, opts, ids => {
      this.#pendingPropertyIds = ids;
    });
  });

  /** 各标签页的记录 ID 字段 */
  readonly tableIdField = computed(() => {
    const tab = this.detailTab();
    return (
      tab === 'properties' ? '_propId'
      : tab === 'relations' ? '_relId'
      : '_idxId'
    );
  });

  /** 各标签页中不允许清空的必填字段 */
  readonly tableNonClearableFields = computed<ReadonlySet<string>>(() => {
    const tab = this.detailTab();
    if (tab === 'properties') return new Set(['name', 'propertyType']);
    if (tab === 'relations') return new Set(['name', 'relationKind']);
    return new Set();
  });

  /** 单元格错误检测器，委托给 detectCellError */
  readonly cellErrorDetector = computed(() => {
    const tab = this.detailTab();
    const propCtx = { propertyErrors: this.#propertyErrors(), addRowNameError: this.#addRowNameError() };
    const relCtx = {
      invalidRelationIds: this.invalidRelationIds(),
      relationFieldErrors: this.relationFieldErrors(),
      missingInverseRelationIds: this.missingInverseRelationIds()
    };
    const hints = this.t().validation;
    return (record: EntityTableRecord, field: string): string | null => {
      const result = detectCellError(tab, record as TableRecord, field, propCtx, relCtx, hints);
      return result.content ?? null;
    };
  });

  constructor() {
    ensureDomainEditorsRegistered();

    // 同步当前数据的校验错误，使无效的 name/columnName 在加载时显示红色
    effect(() => {
      if (this.detailTab() !== 'properties') return;
      const props = this.customProperties();
      const next = new Map<string, { name?: boolean; columnName?: boolean }>();
      for (const p of props) {
        const nameErr = !PROPERTY_NAME_PATTERN.test(p.name);
        const colErr = p.columnName != null && p.columnName !== '' && !PROPERTY_COLUMN_NAME_PATTERN.test(p.columnName);
        if (nameErr || colErr) next.set(p.id, { name: nameErr || undefined, columnName: colErr || undefined });
      }
      for (const children of this.childPropertiesMap().values()) {
        for (const child of children) {
          const nameErr = !PROPERTY_NAME_PATTERN.test(child.name);
          const colErr =
            child.columnName != null && child.columnName !== '' && !PROPERTY_COLUMN_NAME_PATTERN.test(child.columnName);
          if (nameErr || colErr) next.set(child.id, { name: nameErr || undefined, columnName: colErr || undefined });
        }
      }
      this.#propertyErrors.set(next);
    });
  }

  /** 子属性行的动态 cellType 列不可清空 */
  readonly cellClearableFn = (record: Record<string, unknown>): boolean => {
    return !(record['_parentPropId'] && this.detailTab() === 'properties');
  };

  // ── EntityTableComponent 事件处理 ─────────────────────────────────

  onCellChanged(event: CellChangeEvent): void {
    const record = event.record as TableRecord;
    const tab = this.detailTab();

    if (tab === 'properties') {
      handlePropertyCellChange(
        record,
        event.field,
        event.col,
        event.row,
        event.value,
        this.activeEntity(),
        this.customProperties(),
        this.#propertyCellCallbacks
      );
    } else if (tab === 'relations') {
      handleRelationCellChange(record, event.field, event.value, this.entities(), this.targetRelationsByEntity(), ev =>
        this.relationUpdated.emit(ev)
      );
    } else {
      const pendingIds = this.#pendingPropertyIds;
      this.#pendingPropertyIds = null;
      handleIndexCellChange(record, event.field, event.value, ev => this.indexUpdated.emit(ev), pendingIds);
    }
  }

  onRowDeleted(record: EntityTableRecord): void {
    const r = record as TableRecord;
    const tab = this.detailTab();
    if (tab === 'properties' && r._propId && !r._readonly) {
      this.propertyDeleted.emit(r._propId as string);
    } else if (tab === 'relations' && r._relId && !r._readonly) {
      this.relationDeleted.emit(r._relId as string);
    } else if (tab === 'indexes' && r._idxId) {
      this.indexDeleted.emit(r._idxId as string);
    }
  }

  onIconClicked(event: { name: string; record: EntityTableRecord }): void {
    if (event.name !== 'add-child-action') return;
    const record = event.record as TableRecord;
    if (!record._propId || record._readonly) return;
    const entity = this.activeEntity();
    if (!entity) return;
    const parentId = record._propId as string;
    const children = this.childPropertiesMap().get(parentId) ?? [];
    const existingNames = children.map(c => c.name);
    this.childPropertyAdded.emit({
      entityId: entity.id,
      parentPropertyId: parentId,
      name: generateUniqueName('newField', existingNames),
      type: 'string'
    });
  }

  onBatchUpdated(mutations: BatchChangeItem[]): void {
    if (!mutations.length) return;
    this.#emitPasteBatch(mutations);
  }

  onRowReordered(ids: string[]): void {
    const tab = this.detailTab();
    if (tab === 'properties') {
      this.#reorderPropertiesFromIds(ids);
    } else if (tab === 'relations') {
      this.#reorderRelations(ids);
    } else {
      this.#reorderIndexes(ids);
    }
  }

  // ── 内部方法 ───────────────────────────────────────────────────────

  #getPropertyErrorContext(): PropertyColumnsErrorContext {
    return {
      propertyErrors: this.#propertyErrors(),
      addRowNameError: this.#addRowNameError(),
      propertyNameHint: this.t().validation.propertyNameHint,
      columnNameHint: this.t().validation.columnNameHint,
      errorBgColor: 'rgba(239,68,68,0.15)'
    };
  }

  #getRelationErrorContext(): RelationColumnsErrorContext {
    return {
      invalidRelationIds: this.invalidRelationIds(),
      relationFieldErrors: this.relationFieldErrors(),
      missingInverseRelationIds: this.missingInverseRelationIds(),
      errorBgColor: 'rgba(239,68,68,0.15)'
    };
  }

  #setPropertyError(propId: string, field: 'name' | 'columnName', hasError: boolean): void {
    const next = new Map(this.#propertyErrors());
    const cur = next.get(propId) ?? {};
    if (hasError) {
      next.set(propId, { ...cur, [field]: true });
    } else {
      const updated = { ...cur, [field]: false };
      if (!updated.name && !updated.columnName) next.delete(propId);
      else next.set(propId, updated);
    }
    this.#propertyErrors.set(next);
  }

  /** 将 paste/delete mutations 按 record 分发，发射批量更新事件 */
  #emitPasteBatch(mutations: BatchChangeItem[]): void {
    const tab = this.detailTab();
    const entities = this.entities();
    const targetRelsByEntity = this.targetRelationsByEntity();
    const tableIdField = this.tableIdField();
    const recordsById = new Map(this.tableRecords().map(r => [String(r[tableIdField] ?? ''), r as TableRecord]));

    const isSameValue = (a: unknown, b: unknown): boolean => {
      const na = a === '' || a == null ? null : a;
      const nb = b === '' || b == null ? null : b;
      return na === nb;
    };

    const propMap = new Map<string, DesignPropertyChanges>();
    const relMap = new Map<string, DesignRelationChanges>();
    const idxMap = new Map<string, DesignIndexChanges>();

    for (const { recordId, changes } of mutations) {
      const record = recordsById.get(recordId);
      if (!record || record._readonly || record._isAddRow) continue;

      for (const [fieldName, rawValue] of Object.entries(changes)) {
        if (!fieldName || fieldName.startsWith('_')) continue;
        if (isSameValue(rawValue, (record as Record<string, unknown>)[fieldName])) continue;

        if (tab === 'properties') {
          const fieldMap: Record<string, keyof DesignPropertyChanges> = {
            name: 'name',
            propertyType: 'propertyType',
            columnName: 'columnName',
            displayName: 'displayName',
            isNullable: 'isNullable',
            isRequired: 'isRequired',
            isUnique: 'isUnique',
            isReadonly: 'isReadonly',
            isSortable: 'isSortable',
            defaultValue: 'defaultValue',
            enumValues: 'enumValues'
          };
          const propertyField = fieldMap[fieldName];
          if (!propertyField) continue;
          const value =
            propertyField === 'columnName' && (rawValue === '' || rawValue == null) ? null
            : propertyField === 'enumValues' ?
              (() => {
                const str = typeof rawValue === 'string' ? rawValue : String(rawValue ?? '');
                const vals = str
                  .split(',')
                  .map(s => s.trim())
                  .filter(Boolean);
                return vals.length > 0 ? [...new Set(vals)] : null;
              })()
            : rawValue;
          const existing = propMap.get(recordId) ?? {};
          propMap.set(recordId, { ...existing, [propertyField]: value });
        } else if (tab === 'relations') {
          let value = rawValue;
          if (fieldName === 'mappedEntityId' && value) {
            const entity = entities.find(e => e.name === value);
            value = entity?.id ?? null;
          } else if (fieldName === 'mappedPropertyId' && value) {
            const mappedEntityId = record._mappedEntityId as string | undefined;
            if (mappedEntityId) {
              const rels = targetRelsByEntity.get(mappedEntityId) ?? [];
              value = rels.find(r => r.name === value)?.id ?? null;
            }
          }
          const relFieldMap: Record<string, keyof DesignRelationChanges> = {
            name: 'name',
            displayName: 'displayName',
            relationKind: 'relationKind',
            mappedEntityId: 'mappedEntityId',
            columnName: 'columnName',
            mappedPropertyId: 'mappedPropertyId',
            onDeleteAction: 'onDeleteAction',
            onUpdateAction: 'onUpdateAction'
          };
          const relField = relFieldMap[fieldName];
          if (!relField) continue;
          const existing = relMap.get(recordId) ?? {};
          relMap.set(recordId, { ...existing, [relField]: value || null });
        } else {
          const idxFieldMap: Record<string, keyof DesignIndexChanges> = {
            displayName: 'displayName',
            isUnique: 'isUnique'
          };
          const idxField = idxFieldMap[fieldName];
          if (!idxField) continue;
          const existing = idxMap.get(recordId) ?? {};
          idxMap.set(recordId, { ...existing, [idxField]: rawValue });
        }
      }
    }

    if (propMap.size > 0) {
      this.propertiesBatchUpdated.emit([...propMap.entries()].map(([id, changes]) => ({ id, changes })));
    }
    if (relMap.size > 0) {
      this.relationsBatchUpdated.emit([...relMap.entries()].map(([id, changes]) => ({ id, changes })));
    }
    if (idxMap.size > 0) {
      this.indexesBatchUpdated.emit([...idxMap.entries()].map(([id, changes]) => ({ id, changes })));
    }
  }

  /** 从 EntityTableComponent 的 rowReordered ID 列表中，分离顶层和子属性进行排序 */
  #reorderPropertiesFromIds(ids: string[]): void {
    const childIdSet = new Set<string>([...this.childPropertiesMap().values()].flat().map(c => c.id));
    const topIds = ids.filter(id => !childIdSet.has(id));
    const topBatch = this.#computeReorderBatch(topIds, this.customProperties());

    // 子属性排序（按父级分组，保持 ID 列表中的顺序）
    const childMap = this.childPropertiesMap();
    const childByParent = new Map<string, string[]>();
    for (const id of ids) {
      if (!childIdSet.has(id)) continue;
      for (const [parentId, children] of childMap) {
        if (children.some(c => c.id === id)) {
          const list = childByParent.get(parentId) ?? [];
          list.push(id);
          childByParent.set(parentId, list);
          break;
        }
      }
    }
    const childBatch: { id: string; changes: DesignPropertyChanges }[] = [];
    for (const [parentId, childIds] of childByParent) {
      const origChildren = childMap.get(parentId) ?? [];
      childBatch.push(...this.#computeReorderBatch(childIds, origChildren));
    }

    const batch = [...topBatch, ...childBatch];
    if (batch.length > 0) this.propertiesBatchUpdated.emit(batch);
  }

  #reorderRelations(ids: string[]): void {
    const batch = this.#computeReorderBatch(ids, this.activeEntityRelations());
    if (batch.length > 0) this.relationsBatchUpdated.emit(batch as { id: string; changes: DesignRelationChanges }[]);
  }

  #reorderIndexes(ids: string[]): void {
    const batch = this.#computeReorderBatch(ids, this.activeEntityIndexes());
    if (batch.length > 0) this.indexesBatchUpdated.emit(batch as { id: string; changes: DesignIndexChanges }[]);
  }

  #computeReorderBatch<T extends { id: string; sortOrder: string }>(
    orderedIds: string[],
    items: readonly T[]
  ): { id: string; changes: { sortOrder: string } }[] {
    if (orderedIds.length === 0) return [];
    const keys = generateKeysBetween(null, null, orderedIds.length);
    const batch: { id: string; changes: { sortOrder: string } }[] = [];
    for (let i = 0; i < orderedIds.length; i++) {
      const item = items.find(x => x.id === orderedIds[i]);
      if (item && item.sortOrder !== keys[i]) {
        batch.push({ id: orderedIds[i], changes: { sortOrder: keys[i] } });
      }
    }
    return batch;
  }
}
