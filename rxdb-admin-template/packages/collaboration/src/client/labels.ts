import type { SchemaManifest } from '../model.js';
import { schemaModel } from '../schema.js';

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
