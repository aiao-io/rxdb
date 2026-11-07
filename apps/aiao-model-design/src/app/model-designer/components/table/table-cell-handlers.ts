import type { DesignEntity, DesignProperty, DesignRelation } from '../../models/index.js';
import { PROPERTY_COLUMN_NAME_PATTERN, PROPERTY_NAME_PATTERN } from '../../constants';
import type { DesignIndexChanges, DesignPropertyChanges, DesignRelationChanges } from '../../interfaces';
import type { TableRecord } from './table.types';

/** 将逗号分隔的字符串解析为去重去空的枚举值数组，空输入返回 null */
function parseEnumValues(raw: unknown): string[] | null {
  const str = typeof raw === 'string' ? raw : String(raw ?? '');
  const values = str
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  return values.length > 0 ? [...new Set(values)] : null;
}

/** 属性单元格变更的副作用回调 */
export interface PropertyCellCallbacks {
  setPropertyError(propId: string, field: 'name' | 'columnName', hasError: boolean): void;
  setAddRowNameError(error: boolean): void;
  revertCell(col: number, row: number, value: string | number | null): void;
  emitPropertyAdded(ev: { entityId: string; name: string; type: string }): void;
  emitPropertyUpdated(ev: { id: string; changes: DesignPropertyChanges }): void;
}

/** 处理属性标签页的单元格值变更 */
export function handlePropertyCellChange(
  record: TableRecord | undefined,
  fieldName: string | undefined,
  col: number,
  row: number,
  changedValue: unknown,
  activeEntity: DesignEntity | null,
  customProperties: DesignProperty[],
  cb: PropertyCellCallbacks
): void {
  if (!record) return;

  if (record._isAddRow) {
    if (fieldName === 'name' && typeof changedValue === 'string') {
      const trimmed = changedValue.trim();
      if (!trimmed) return;
      if (!PROPERTY_NAME_PATTERN.test(trimmed)) {
        cb.setAddRowNameError(true);
        cb.revertCell(col, row, '');
        return;
      }
      cb.setAddRowNameError(false);
      if (activeEntity) {
        cb.emitPropertyAdded({
          entityId: activeEntity.id,
          name: trimmed,
          type: (record.propertyType as string) || 'string'
        });
      }
    }
    return;
  }

  if (record._readonly || !record._propId) return;

  const propId = record._propId as string;
  // 子属性（_parentPropId 存在）视为有效记录；顶层属性必须在 customProperties 中
  const isChild = !!record._parentPropId;
  if (!isChild && !customProperties.find(p => p.id === propId)) return;

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

  const propertyField = fieldMap[fieldName || ''];
  if (!propertyField) return;

  if (fieldName === 'name') {
    const str = typeof changedValue === 'string' ? changedValue : String(changedValue ?? '');
    cb.setPropertyError(propId, 'name', !PROPERTY_NAME_PATTERN.test(str));
  } else if (fieldName === 'columnName') {
    const str = changedValue === null || changedValue === undefined ? '' : String(changedValue);
    cb.setPropertyError(propId, 'columnName', str !== '' && !PROPERTY_COLUMN_NAME_PATTERN.test(str));
  }

  const value =
    propertyField === 'columnName' && (changedValue === '' || changedValue === null || changedValue === undefined) ?
      null
    : propertyField === 'enumValues' ? parseEnumValues(changedValue)
    : changedValue;
  cb.emitPropertyUpdated({ id: propId, changes: { [propertyField]: value } as DesignPropertyChanges });
}

/** 处理关系标签页的单元格值变更 */
export function handleRelationCellChange(
  record: TableRecord | undefined,
  fieldName: string | undefined,
  changedValue: unknown,
  entities: DesignEntity[],
  targetRelsByEntity: Map<string, DesignRelation[]>,
  emitRelationUpdated: (ev: { id: string; changes: DesignRelationChanges }) => void
): void {
  if (!record || record._readonly || record._isAddRow || !record._relId) return;

  const relId = record._relId as string;

  let value = changedValue;
  if (fieldName === 'mappedEntityId' && changedValue) {
    const entity = entities.find(e => e.name === changedValue);
    value = entity?.id ?? null;
    if (value && value !== record._mappedEntityId) {
      emitRelationUpdated({
        id: relId,
        changes: { mappedEntityId: value, mappedPropertyId: null } as DesignRelationChanges
      });
      return;
    }
  } else if (fieldName === 'mappedPropertyId' && changedValue) {
    const mappedEntityId = record._mappedEntityId;
    if (mappedEntityId) {
      const relations = targetRelsByEntity.get(mappedEntityId) ?? [];
      value = relations.find(r => r.name === changedValue)?.id ?? null;
    }
  }

  const fieldMap: Record<string, keyof DesignRelationChanges> = {
    name: 'name',
    displayName: 'displayName',
    relationKind: 'relationKind',
    mappedEntityId: 'mappedEntityId',
    columnName: 'columnName',
    mappedPropertyId: 'mappedPropertyId',
    onDeleteAction: 'onDeleteAction',
    onUpdateAction: 'onUpdateAction'
  };

  const relationField = fieldMap[fieldName || ''];
  if (relationField) {
    emitRelationUpdated({
      id: relId,
      changes: { [relationField]: value || null } as DesignRelationChanges
    });
  }
}

/** 处理索引标签页的单元格值变更 */
export function handleIndexCellChange(
  record: TableRecord | undefined,
  fieldName: string | undefined,
  changedValue: unknown,
  emitIndexUpdated: (ev: { id: string; changes: DesignIndexChanges }) => void,
  pendingPropertyIds?: string[] | null
): void {
  if (!record || record._isAddRow || !record._idxId) return;

  const idxId = record._idxId as string;

  if (fieldName === 'propertyNames') {
    if (!pendingPropertyIds) return;
    emitIndexUpdated({ id: idxId, changes: { propertyIds: pendingPropertyIds } });
    return;
  }

  const fieldMap: Record<string, keyof DesignIndexChanges> = {
    displayName: 'displayName',
    isUnique: 'isUnique'
  };

  const indexField = fieldMap[fieldName || ''];
  if (indexField) {
    emitIndexUpdated({ id: idxId, changes: { [indexField]: changedValue } as DesignIndexChanges });
  }
}
