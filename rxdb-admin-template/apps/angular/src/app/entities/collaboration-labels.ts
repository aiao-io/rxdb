import type { CollaborationLabels } from '@rxdb-admin-template/collaboration';

/** 协作编辑器里各实体的标签：沿用协作界面一直使用的简短标签（中文原文，由协作词条表翻译）。 */
const entityLabels: Readonly<Record<string, string>> = { AssetCategory: '分类', Asset: '资产', AssetEvent: '维护记录' };

/**
 * 传给协作界面的实体与字段标签：协作包不认识任何具体实体，标签由应用提供。
 * 字段取数据模式清单里声明的显示名（即实体定义的 displayName），只有分类的名称沿用「名称」，与资产的名称列一致。
 */
export const collaborationLabels: CollaborationLabels = {
  entity: entity => entityLabels[entity] ?? entity,
  field: (entity, field, declared) => (entity === 'AssetCategory' && field === 'name' ? '名称' : declared)
};
