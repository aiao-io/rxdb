import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { demand, type DataRow, type Records, type Value } from '../model.js';
import { assertRecords } from '../records.js';
const fields: Record<DataRow['entity'], string[]> = {
  AssetCategory: ['name', 'description'],
  Asset: ['name', 'status', 'purchasePrice', 'purchaseDate', 'categoryId'],
  AssetEvent: ['summary', 'cost', 'happenedAt', 'assetId']
};
/** 仅在用户明确预览导入时连接匿名库，保留原记录标识与关系，不写入原库。 */
export async function readAnonymousAssets(database: RxDB, entities: readonly EntityType[]): Promise<Records> {
  const records: Records = {};
  for (const entity of entities) {
    const name = getEntityMetadata(entity).name as DataRow['entity'];
    if (!Object.hasOwn(fields, name)) continue;
    const rows = await firstValueFrom(
      database.entityManager.getRepository(entity).findAll({ where: { combinator: 'and', rules: [] } })
    );
    for (const row of rows) {
      const values = row as unknown as Record<string, Value>;
      const data = Object.fromEntries(
        fields[name].filter(field => values[field] !== undefined).map(field => [field, values[field]])
      );
      const id = String(values['id']);
      demand(!Object.hasOwn(records, id), 'conflict', '匿名记录 ID 跨实体重复，无法安全导入');
      records[id] = { entity: name, fields: data };
    }
  }
  assertRecords(records);
  return records;
}
