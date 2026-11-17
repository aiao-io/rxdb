import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { demand, type Records, type SchemaManifest, type Value } from '../model.js';
import { assertRecordsFit, schemaModel, type RecordField } from '../schema.js';
import { tx } from './translate.js';

/**
 * 仅在用户明确预览导入时连接匿名库，读取属于工作区数据模式清单的实体，保留原记录标识与关系，不写入原库。
 * 每条记录只取清单里的记录字段（普通属性与单值关联的外键），清单之外的实体与字段不读；日期按清单的显示方式写成日期文本。
 * @param entities 匿名库注册的实体类；不在清单里的跳过。
 * @param schema 当前工作区的数据模式清单。
 */
export async function readAnonymousRecords(
  database: RxDB,
  entities: readonly EntityType[],
  schema: SchemaManifest
): Promise<Records> {
  const model = schemaModel(schema);
  const records: Records = {};
  for (const entity of entities) {
    const found = model.entity(getEntityMetadata(entity).name);
    if (!found) continue;
    const rows = await firstValueFrom(
      database.entityManager.getRepository(entity).findAll({ where: { combinator: 'and', rules: [] } })
    );
    for (const row of rows) {
      const values = row as unknown as Record<string, unknown>;
      const data = Object.fromEntries(
        found.fields
          .filter(field => values[field.name] !== undefined)
          .map(field => [field.name, serializeValue(field, values[field.name])])
      );
      const id = String(values['id']);
      demand(!Object.hasOwn(records, id), 'conflict', '匿名记录 ID 跨实体重复，无法安全导入');
      records[id] = { entity: found.entity, fields: data };
    }
  }
  assertRecordsFit(schema, records);
  return records;
}

/** 运行时取值换成记录取值：`Date` 按字段的显示方式写成日期（`YYYY-MM-DD`）或完整的 ISO 时间，其余只接受 JSON 原生类型。 */
function serializeValue(field: RecordField, value: unknown): Value {
  if (value instanceof Date) {
    demand(!Number.isNaN(value.getTime()), 'invalid', tx('{v0} 日期格式错误', { v0: field.name }));
    const format = field.descriptor.format;
    const dateOnly = format?.kind === 'dateTime' && format.display === 'date';
    return dateOnly ? value.toISOString().slice(0, 10) : value.toISOString();
  }
  demand(
    value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    'invalid',
    '字段值格式错误'
  );
  demand(typeof value !== 'number' || Number.isFinite(value), 'invalid', '数字必须有限');
  return value;
}
