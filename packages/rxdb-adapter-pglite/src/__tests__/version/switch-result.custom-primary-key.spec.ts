/**
 * @fileoverview 版本切换 SQL 按主键物理列定位行：主键属性 `id` 可被 `columnName` 改写
 *
 * @remarks
 * 拉取（`mergeChanges(…, true)`）、undo / redo、切分支与检出位播种共用 `convertSwitchResultToSql`。
 * 删除的 `= ANY($1)` 与 upsert 的 `ON CONFLICT (…)` 写死 `id` 时，这类实体的每条动作都报
 * `column "id" does not exist`，整笔回滚。
 *
 * 实体关掉变更日志：PGlite 的变更触发器同样按 `id` 列取主键，自定义主键列的实体只有不记日志时才写得进去
 *（见 `encrypted-custom-primary-key.spec.ts`）；本文件只钉切换 SQL 这一格。
 */
import {
  Entity,
  EntityBase,
  PropertyType,
  RxDB,
  type RxDBEntityId,
  type SwitchVersionActions,
  type SwitchVersionChange,
  SyncType
} from '@aiao/rxdb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { generateDbName } from '../test-utils.js';

@Entity({
  name: 'SwitchCpkUuid',
  tableName: 'switch_cpk_uuid',
  log: false,
  properties: [
    { name: 'id', columnName: 'row_key', type: PropertyType.uuid, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
class SwitchCpkUuid extends EntityBase {
  label!: string;
}

@Entity({
  name: 'SwitchCpkInteger',
  tableName: 'switch_cpk_integer',
  log: false,
  properties: [
    { name: 'id', columnName: 'row_no', type: PropertyType.integer, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
class SwitchCpkInteger extends EntityBase {
  label!: string;
}

@Entity({
  name: 'SwitchCpkBigint',
  tableName: 'switch_cpk_bigint',
  log: false,
  properties: [
    { name: 'id', columnName: 'row_big', type: PropertyType.bigint, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
class SwitchCpkBigint extends EntityBase {
  label!: string;
}

const change = (patch: object | null, inversePatch: object | null = null): SwitchVersionChange => ({
  patch,
  inversePatch
});

const actionsOf = (part: Partial<SwitchVersionActions>): SwitchVersionActions => ({
  deletes: part.deletes ?? new Map(),
  inserts: part.inserts ?? new Map(),
  updates: part.updates ?? new Map()
});

const cases = [
  {
    type: 'uuid',
    entity: 'SwitchCpkUuid',
    table: '"public"."switch_cpk_uuid"',
    column: 'row_key',
    id: '0193a2f0-0000-7000-8000-0000000000a1' as RxDBEntityId
  },
  { type: 'integer', entity: 'SwitchCpkInteger', table: '"public"."switch_cpk_integer"', column: 'row_no', id: 7 },
  {
    type: 'bigint',
    entity: 'SwitchCpkBigint',
    table: '"public"."switch_cpk_bigint"',
    column: 'row_big',
    id: 9007199254740993n
  }
] as const;

describe('版本切换 SQL：自定义主键列', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [SwitchCpkUuid, SwitchCpkInteger, SwitchCpkBigint],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = (await rxdb.connect('pglite')) as RxDBAdapterPGlite;
  });

  afterEach(async () => {
    for (const { table } of cases) await adapter.internalQuery(`DELETE FROM ${table}`);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  const labelsOf = async (table: string, column: string): Promise<Array<{ key: string; label: string }>> => {
    const result = await adapter.internalQuery<{ key: string; label: string }>(
      `SELECT "${column}"::text AS key, label FROM ${table} ORDER BY label`
    );
    return result.rows;
  };

  describe.each(cases)('$type 主键', ({ entity, table, column, id }) => {
    const key = `public:${entity}:${String(id)}`;

    it('插入：按主键物理列写入', async () => {
      await adapter.mergeChanges(actionsOf({ inserts: new Map([[key, change({ id, label: 'merged' })]]) }));

      expect(await labelsOf(table, column)).toEqual([{ key: String(id), label: 'merged' }]);
    });

    it('插入撞上已有行：ON CONFLICT 落在主键物理列上，覆盖成目标状态', async () => {
      await adapter.mergeChanges(actionsOf({ inserts: new Map([[key, change({ id, label: 'first' })]]) }));
      await adapter.mergeChanges(actionsOf({ inserts: new Map([[key, change({ id, label: 'second' })]]) }));

      expect(await labelsOf(table, column)).toEqual([{ key: String(id), label: 'second' }]);
    });

    it('删除：按主键物理列删掉目标行', async () => {
      await adapter.mergeChanges(actionsOf({ inserts: new Map([[key, change({ id, label: 'doomed' })]]) }));
      await adapter.mergeChanges(actionsOf({ deletes: new Map([[key, change(null, { id, label: 'doomed' })]]) }));

      expect(await labelsOf(table, column)).toEqual([]);
    });
  });

  it('拉取回填（关触发器）同样按主键物理列插入与删除', async () => {
    const { entity, table, column, id } = cases[0];
    const key = `public:${entity}:${String(id)}`;

    await adapter.mergeChanges(
      actionsOf({ inserts: new Map([[key, change({ id, label: 'pulled' })]]) }),
      undefined,
      true
    );
    expect(await labelsOf(table, column)).toEqual([{ key: String(id), label: 'pulled' }]);

    await adapter.mergeChanges(
      actionsOf({ deletes: new Map([[key, change(null, { id, label: 'pulled' })]]) }),
      undefined,
      true
    );
    expect(await labelsOf(table, column)).toEqual([]);
  });
});
