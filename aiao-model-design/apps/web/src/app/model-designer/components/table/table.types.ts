import type { EntityTableRecord } from '@aiao/rxdb-model-angular';

export type DetailTab = 'properties' | 'relations' | 'indexes';

export interface TableRecord extends EntityTableRecord {
  index?: number | string;
  name?: string;
  propertyType?: string;
  columnName?: string;
  displayName?: string;
  isNullable?: boolean;
  isRequired?: boolean;
  isUnique?: boolean;
  isReadonly?: boolean;
  isSortable?: boolean;
  defaultValue?: string;
  enumValues?: string;
  relationKind?: string;
  mappedEntityId?: string;
  mappedPropertyId?: string;
  onDeleteAction?: string;
  onUpdateAction?: string;
  propertyNames?: string;
  actions?: string;
  _source?: string;
  _category?: string;
  _propId?: string | null;
  _relId?: string | null;
  _idxId?: string | null;
  _propertyIds?: string[];
  _mappedEntityId?: string;
  _mappedPropertyId?: string;
  _isInvalid?: boolean;
  /** keyValue 子属性的树结构子节点 */
  children?: TableRecord[];
  /** 父属性 ID（子属性行） */
  _parentPropId?: string | null;
}
