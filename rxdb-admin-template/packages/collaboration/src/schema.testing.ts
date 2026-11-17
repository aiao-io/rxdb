import { readFileSync } from 'node:fs';
import { diffRecords } from './changes.js';
import type { CollaborationLabels } from './client/labels.js';
import type { ChangeSet, Records, SchemaManifest } from './model.js';
import { namespaceOf, parseSchemaManifest } from './schema.js';

/**
 * 产品的数据模式清单（三端应用的资产实体，`rxdb-admin-template/schema/collaboration-schema.json`）。
 * 协作包的用例大多沿用资产数据，按这份清单校验；三端各有一致性用例核对它与实体定义相同。
 */
export const assetSchema: SchemaManifest = parseSchemaManifest(
  JSON.parse(readFileSync(new URL('../../../schema/collaboration-schema.json', import.meta.url), 'utf8'))
);
/** 资产实体的命名空间（清单里全部是 `assets`）。 */
export const assetNamespaces = namespaceOf(assetSchema);
/** 按资产清单的命名空间比较两份记录，得到字段级变更。 */
export const diffAssets = (before: Records, after: Records): ChangeSet[] => diffRecords(before, after, assetNamespaces);
/** 资产实体在协作编辑器里的标签，与三端应用 `entities/collaboration-labels.ts` 传给协作界面的相同。 */
const assetEntityLabels: Readonly<Record<string, string>> = {
  AssetCategory: '分类',
  Asset: '资产',
  AssetEvent: '维护记录'
};
export const assetLabels: CollaborationLabels = {
  entity: entity => assetEntityLabels[entity] ?? entity,
  field: (entity, field, declared) => (entity === 'AssetCategory' && field === 'name' ? '名称' : declared)
};
