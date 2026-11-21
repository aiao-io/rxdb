import type { SchemaManifest, Value } from '../model.js';
import { schemaModel, type RecordField } from '../schema.js';

/**
 * 协作界面里实体与字段的标签，由宿主应用提供；返回中文原文，界面经协作词条表翻译后显示（词条表里没有的原样显示）。
 * 三端应用传入同一份标签，界面因此与实体定义解耦：协作包不含任何实体特定的名字。
 */
export interface CollaborationLabels {
  /** 实体的标签，用于编辑器的分区标题、「新增…」按钮与只读记录表的类型列。 */
  entity(entity: string): string;
  /** 字段的标签；`declared` 是数据模式清单里声明的显示名（单值关联的外键字段取关联的显示名）。 */
  field(entity: string, field: string, declared: string): string;
}

let labels: CollaborationLabels | undefined;
/** 安装当前使用的标签；传入 undefined 则实体显示实体名、字段显示清单里声明的显示名。`mountCollaboration` 在挂载时调用。 */
export function useLabels(value: CollaborationLabels | undefined): void {
  labels = value;
}
/** 实体的标签原文（未翻译；交给 `section`、`input` 等界面元素时由它们翻译，直接写进单元格时先经 `tx`）。 */
export function entityText(entity: string): string {
  return labels ? labels.entity(entity) : entity;
}
/** 字段的标签原文（未翻译，规则同 {@link entityText}）；字段不在清单里时为字段名。 */
export function fieldText(schema: SchemaManifest, entity: string, field: string): string {
  const declared = schemaModel(schema).entity(entity)?.field(field)?.descriptor.displayName ?? field;
  return labels ? labels.field(entity, field, declared) : declared;
}

/** 只显示日期的日期字段：清单里取值类型是日期、格式是 `dateTime` 且 `display: 'date'`（资产的购入日期、维护记录的日期）。 */
export function isDateOnly(field: RecordField | undefined): boolean {
  if (!field || field.target !== undefined || field.descriptor.valueType !== 'date') return false;
  const format = field.descriptor.format;
  return format?.kind === 'dateTime' && format.display === 'date';
}
/** ISO 时刻文本里的日期部分（`YYYY-MM-DD`）；不是以日期开头的文本原样交回。 */
export const datePart = (value: string): string => (/^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value);
/**
 * 记录取值在界面上的写法：只显示日期的日期字段（{@link isDateOnly}）取日期部分，与日期输入框一致；其余原样。
 * 记录里存的是落库形态（日期是 ISO 时刻文本），这里只换显示，不改写取值。
 */
export function displayValue(schema: SchemaManifest, entity: string, field: string, value: Value | undefined) {
  return typeof value === 'string' && isDateOnly(schemaModel(schema).entity(entity)?.field(field)) ?
      datePart(value)
    : value;
}
