import { getEntityMetadata, type EntityType, type RxDB } from '@aiao/rxdb';
import { firstValueFrom } from 'rxjs';
import { demand, type Records, type SchemaManifest, type Value } from '../model.js';
import { maxChanges } from '../records.js';
import { assertRecordsFit, schemaModel, type RecordField } from '../schema.js';
import { tx } from './translate.js';

/**
 * 仅在用户明确预览导入时连接匿名库，读取属于工作区数据模式清单的实体，保留原记录标识与关系，不写入原库。
 * 每条记录只取清单里的记录字段（普通属性与单值关联的外键），清单之外的实体与字段不读；日期写成 ISO 时刻文本。
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

/**
 * 运行时取值换成记录取值：`Date` 写成 `toISOString()` 的 ISO 时刻文本，其余只接受 JSON 原生类型。
 * 与 sqlite-wasm 的落库形态一致：适配器把 `Date` 按 `toISOString()` 存进 TEXT 列，working-tree 捕获的单元里就是这一串，
 * 只显示日期的字段也不截成 `YYYY-MM-DD`（界面显示时再取日期部分）。
 */
function serializeValue(field: RecordField, value: unknown): Value {
  if (value instanceof Date) {
    demand(!Number.isNaN(value.getTime()), 'invalid', tx('{v0} 日期格式错误', { v0: field.name }));
    return value.toISOString();
  }
  demand(
    value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean',
    'invalid',
    '字段值格式错误'
  );
  demand(typeof value !== 'number' || Number.isFinite(value), 'invalid', '数字必须有限');
  return value;
}

/**
 * 一次导入最多的记录数：每条记录在团队库里是一个插入单元，同步时整棵工作树形成一个提交，而服务端拒绝超过
 * 单个提交变更上限的提交——超过的在预览时就拒绝确认，不留下一份同步不上去的工作树。
 */
export const importLimit = maxChanges;

/**
 * 匿名记录写进团队库的实体顺序：被单值关联引用的实体排在引用方前面（外键指向的记录先写），同一层按清单顺序；
 * 关联成环的实体（例如自引用）放在最后，按清单顺序。
 */
export function importOrder(schema: SchemaManifest): string[] {
  const entities = schemaModel(schema).entities;
  const placed: string[] = [];
  const targets = (entity: (typeof entities)[number]) =>
    entity.fields.flatMap(field =>
      field.target === undefined || field.target === entity.entity ? [] : [field.target]
    );
  for (let round = 0; round < entities.length; round++) {
    const ready = entities.filter(
      entity => !placed.includes(entity.entity) && targets(entity).every(target => placed.includes(target))
    );
    if (!ready.length) break;
    placed.push(...ready.map(entity => entity.entity));
  }
  return [...placed, ...entities.map(entity => entity.entity).filter(entity => !placed.includes(entity))];
}
