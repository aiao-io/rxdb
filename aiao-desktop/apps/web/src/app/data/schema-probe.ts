import { EntityType, WorktreeTableSet, getEntityMetadata } from '@aiao/rxdb';
import { RxDBAdapterSqlite, sqliteGetTableNameByMetadata } from '@aiao/rxdb-adapter-sqlite-wasm';

import { SCHEMA_RECORD_KEY, SchemaProbe } from './schema-version';
import { SystemPreference } from './system-preference.entity';

/** 探测库需要的最小只读面；真实现包着 sqlite 适配器，单测里换成假的。 */
export interface SchemaInspector {
  /** 实体对应的物理表名。 */
  tableName(entity: EntityType): string;
  /** 实体的表是否存在。 */
  tableExists(entity: EntityType): Promise<boolean>;
  /** 表里现有的列名。 */
  columns(table: string): Promise<readonly string[]>;
  /** 读版本记录那一行的值；没有这一行时为 `undefined`。 */
  readRecord(): Promise<unknown>;
}

/** 实体声明里会落成物理列的名字。 */
export function expectedColumns(entity: EntityType): string[] {
  return [...getEntityMetadata(entity).propertyMap.values()].map(property => property.columnName);
}

/**
 * 探测库的现状：系统偏好表在不在、版本记录是什么、实体的表与列缺了哪些。**只读**，
 * 在 `RxDB.connect()` 之前跑——连接会静默补建缺失的表，等它补完就分不出「新增实体」和「缺表损坏」了。
 *
 * @param inspector 只读探测面
 * @param entities 要核对的实体（桌面自己登记的那些）
 */
export async function probeSchema(inspector: SchemaInspector, entities: readonly EntityType[]): Promise<SchemaProbe> {
  if (!(await inspector.tableExists(SystemPreference)))
    return { hasPreferenceTable: false, recordValue: undefined, missing: [] };
  const recordValue = await inspector.readRecord();
  const missing: string[] = [];
  for (const entity of entities) {
    const table = inspector.tableName(entity);
    if (!(await inspector.tableExists(entity))) {
      missing.push(table);
      continue;
    }
    const present = new Set(await inspector.columns(table));
    for (const column of expectedColumns(entity)) if (!present.has(column)) missing.push(`${table}.${column}`);
  }
  return { hasPreferenceTable: true, recordValue, missing };
}

const quote = (identifier: string): string => `"${identifier.replaceAll('"', '""')}"`;

/** 包着 sqlite-wasm 适配器的真探测面：只用适配器的只读入口，不写库。 */
export function adapterInspector(adapter: RxDBAdapterSqlite): SchemaInspector {
  const rows = async (sql: string, bindings: (string | number)[] = []): Promise<unknown[][]> =>
    (await adapter.internalQuery(sql, bindings)).results.flatMap(result => result.rows as unknown[][]);
  const tableName = (entity: EntityType): string =>
    sqliteGetTableNameByMetadata(getEntityMetadata(entity), WorktreeTableSet.MAIN);
  const columnOf = (name: string): string => {
    const property = getEntityMetadata(SystemPreference).propertyMap.get(name);
    if (!property) throw new Error(`SystemPreference 缺少属性 ${name}`);
    return property.columnName;
  };
  return {
    tableName,
    tableExists: entity => adapter.isTableExisted(entity),
    columns: async table => (await rows('SELECT "name" FROM pragma_table_info(?)', [table])).map(row => String(row[0])),
    readRecord: async () => {
      const found = await rows(
        `SELECT ${quote(columnOf('value'))} FROM ${quote(tableName(SystemPreference))} WHERE ${quote(columnOf('key'))} = ? LIMIT 1`,
        [SCHEMA_RECORD_KEY]
      );
      if (found.length === 0) return undefined;
      const raw = found[0][0];
      if (typeof raw !== 'string') return raw;
      /* 值列是 JSON 文本：解析失败的文本原样交给判定，由它归为「无法解析的版本记录」。 */
      const parsed = parseJson(raw);
      return parsed.ok ? parsed.value : raw;
    }
  };
}

function parseJson(text: string): { readonly ok: true; readonly value: unknown } | { readonly ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}
