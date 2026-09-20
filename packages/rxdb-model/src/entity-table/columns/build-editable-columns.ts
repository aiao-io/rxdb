import type {
  EntityMetadata,
  EntityPropertyMetadata,
  EntityRelationMetadata,
  FieldFormat,
  FieldOptions
} from '@aiao/rxdb';
import { PropertyType, RelationKind } from '@aiao/rxdb';
import type { ColumnDefine } from '@visactor/vtable/es/ts-types/index.js';
import type { RelatedEntityItem } from '../../entity-form/interfaces.js';
import { actionsColumn, buildPropertyColumn, formatDateValue, type KVSchemaEntry } from './column-utils.js';

/** 仅展示（不可编辑）的系统字段 */
export const DISPLAY_ONLY_FIELDS = new Set(['createdBy', 'updatedBy']);

/** 跳过（不显示为独立列）的系统字段 */
export const SKIP_FIELDS = new Set(['id', 'createdAt', 'updatedAt']);

/** 关联实体候选 provider 工厂：根据外键字段和关联实体名返回 provider 函数 */
export type RelatedItemsProviderFactory = (
  fkField: string,
  relatedEntityName: string
) => (() => RelatedEntityItem[]) | undefined;

/** 构建可编辑列的选项 */
export interface BuildEditableColumnsOptions {
  /** 关联实体候选 provider 工厂（按外键字段与关联实体名返回 provider） */
  relatedItemsProviderFactory?: RelatedItemsProviderFactory;
  /** 操作列标题（默认「操作」） */
  actionsTitle?: string;
  /** 删除按钮文案（默认「删除」） */
  deleteLabel?: string;
  /** 查看按钮文案（默认「查看」） */
  viewLabel?: string;
  /** 创建时间列标题（默认「创建时间」） */
  createdAtTitle?: string;
  /** 更新时间列标题（默认「更新时间」） */
  updatedAtTitle?: string;
}

function buildKeyValueSchema(prop: EntityPropertyMetadata): Record<string, KVSchemaEntry> {
  const schema: Record<string, KVSchemaEntry> = {};
  const properties = (
    prop as EntityPropertyMetadata & {
      properties?: ReadonlyArray<{
        name: string;
        displayName?: string;
        type: EntityPropertyMetadata['type'];
        required?: boolean;
        nullable?: boolean;
      }>;
    }
  ).properties;
  if (!properties) return schema;
  for (const p of properties) {
    schema[p.name] = {
      label: p.displayName,
      type: normalizeKVSchemaEntryType(p.type),
      required: p.required,
      nullable: p.nullable
    };
  }
  return schema;
}

/**
 * 将实体属性类型归一化为 keyValue Schema 值类型
 *
 * 仅 string / enum / uuid / number / integer / boolean / date 可直接映射，
 * 其余类型返回 undefined。
 *
 * @param type 实体属性类型（PropertyType 枚举值）
 * @returns 对应的 KVSchemaEntry 值类型；无法映射时返回 undefined
 */
export function normalizeKVSchemaEntryType(type: EntityPropertyMetadata['type']): KVSchemaEntry['type'] | undefined {
  switch (typeof type === 'string' ? type : String(type)) {
    case PropertyType.string:
    case PropertyType.enum:
    case PropertyType.uuid:
      return 'string';
    case PropertyType.number:
      return 'number';
    case PropertyType.integer:
      return 'integer';
    case PropertyType.boolean:
      return 'boolean';
    case PropertyType.date:
      return 'date';
    default:
      return undefined;
  }
}

/**
 * 根据 EntityMetadata 构建可编辑的 VTable 列定义
 *
 * 按照以下顺序排列列：
 * 1. ID 列
 * 2. 普通属性列（跳过 SKIP_FIELDS 和 DISPLAY_ONLY_FIELDS）
 * 3. 计算属性列
 * 4. 外键关系列
 * 5. createdAt / updatedAt 系统时间列
 * 6. 操作列（查看 + 删除）
 *
 * @param metadata 实体元数据
 * @param options 可选构建选项
 * @returns 可编辑的列定义数组
 */
export function buildEditableColumns(
  metadata: EntityMetadata,
  options: BuildEditableColumnsOptions = {}
): ColumnDefine[] {
  const {
    relatedItemsProviderFactory,
    actionsTitle = '操作',
    deleteLabel = '删除',
    viewLabel = '查看',
    createdAtTitle = '创建时间',
    updatedAtTitle = '更新时间'
  } = options;

  const columns: ColumnDefine[] = [{ field: 'id', title: 'ID', width: 260, sort: true }];

  for (const [key, prop] of metadata.propertyMap) {
    if (DISPLAY_ONLY_FIELDS.has(key) || SKIP_FIELDS.has(key)) continue;
    const raw = prop as Record<string, unknown>;
    columns.push(
      buildPropertyColumn({
        field: key,
        title: prop.displayName ?? key,
        type: prop.type,
        readonly: raw['readonly'] === true,
        enumValues: raw['enum'] as string[] | undefined,
        keyValueSchema: prop.type === PropertyType.keyValue ? buildKeyValueSchema(prop) : undefined,
        format: raw['format'] as FieldFormat | undefined,
        options: raw['options'] as FieldOptions | undefined
      })
    );
  }

  for (const [key, prop] of metadata.computedPropertyMap) {
    columns.push(
      buildPropertyColumn({
        field: key,
        title: prop.displayName ?? key,
        type: 'computed',
        readonly: true
      })
    );
  }

  for (const [fkField, relation] of metadata.foreignKeyRelationMap as Map<string, EntityRelationMetadata>) {
    const type = relation.kind === RelationKind.ONE_TO_ONE ? 'oneToOne' : 'manyToOne';
    columns.push(
      buildPropertyColumn({
        field: fkField,
        title: relation.displayName ?? fkField,
        type,
        nullable: (relation as Record<string, unknown>)['nullable'] === true,
        relatedItemsProvider: relatedItemsProviderFactory?.(fkField, relation.mappedEntity)
      })
    );
  }

  columns.push(
    {
      field: 'createdAt',
      title: createdAtTitle,
      width: 160,
      fieldFormat: (r: Record<string, unknown>) => formatDateValue(r['createdAt'])
    },
    {
      field: 'updatedAt',
      title: updatedAtTitle,
      width: 160,
      fieldFormat: (r: Record<string, unknown>) => formatDateValue(r['updatedAt'])
    },
    actionsColumn(actionsTitle, deleteLabel, viewLabel)
  );

  return columns;
}
