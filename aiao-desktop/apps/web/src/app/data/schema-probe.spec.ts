import { EntityType, getEntityMetadata } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';

import { DesktopFile } from '../disk/desktop-file.entity';
import { SchemaInspector, expectedColumns, probeSchema } from './schema-probe';
import { SystemPreference } from './system-preference.entity';

interface FakeDatabase {
  /** 库里有的表 → 它的列；没列出的实体就是缺表。 */
  readonly tables: ReadonlyMap<EntityType, readonly string[]>;
  readonly record?: unknown;
}

const nameOf = (entity: EntityType): string => getEntityMetadata(entity).name;

function inspect(database: FakeDatabase): SchemaInspector {
  const byName = new Map([...database.tables].map(([entity, columns]) => [nameOf(entity), columns]));
  return {
    tableName: nameOf,
    tableExists: async entity => database.tables.has(entity),
    columns: async table => byName.get(table) ?? [],
    readRecord: async () => database.record
  };
}

describe('expectedColumns：实体声明里会落成物理列的名字', () => {
  it('包含声明的属性列', () => {
    expect(expectedColumns(SystemPreference)).toEqual(expect.arrayContaining(['key', 'value']));
  });
});

describe('probeSchema：连接之前的只读探测', () => {
  const full = new Map<EntityType, readonly string[]>([
    [SystemPreference, expectedColumns(SystemPreference)],
    [DesktopFile, expectedColumns(DesktopFile)]
  ]);

  it('系统偏好表不存在：全新的库，不再往下查', async () => {
    const probe = await probeSchema(inspect({ tables: new Map() }), [SystemPreference, DesktopFile]);
    expect(probe).toEqual({ hasPreferenceTable: false, recordValue: undefined, missing: [] });
  });

  it('结构完整：没有缺的东西，原样带出版本记录', async () => {
    const record = { version: 3, build: '', upgradedAt: 1 };
    const probe = await probeSchema(inspect({ tables: full, record }), [SystemPreference, DesktopFile]);
    expect(probe).toEqual({ hasPreferenceTable: true, recordValue: record, missing: [] });
  });

  it('缺表：按物理表名列出', async () => {
    const tables = new Map(full);
    tables.delete(DesktopFile);
    const probe = await probeSchema(inspect({ tables }), [SystemPreference, DesktopFile]);
    expect(probe.missing).toEqual([nameOf(DesktopFile)]);
  });

  it('缺列：列成「表.列」，表里多出来的列不算问题', async () => {
    const tables = new Map(full);
    const columns = expectedColumns(DesktopFile);
    tables.set(DesktopFile, [...columns.filter(column => column !== 'name'), 'legacy_column']);
    const probe = await probeSchema(inspect({ tables }), [SystemPreference, DesktopFile]);
    expect(probe.missing).toEqual([`${nameOf(DesktopFile)}.name`]);
  });

  it('没有版本记录那一行：记录值是 undefined', async () => {
    const probe = await probeSchema(inspect({ tables: full }), [SystemPreference]);
    expect(probe.recordValue).toBeUndefined();
  });
});
