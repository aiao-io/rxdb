/**
 * @fileoverview 版本切换 SQL 按主键物理列定位行：主键属性 `id` 可被 `columnName` 改写
 *
 * @remarks
 * 拉取（`mergeChanges(…, true)`）、undo / redo、切分支与检出位播种共用 `convertSwitchResultToSql`。
 * 删除的 `= ANY($1)`、upsert 的 `ON CONFLICT (…)` 与更新一腿的 `WHERE …` 写死 `id` 时，这类实体的每条动作都报
 * `column "id" does not exist`，整笔回滚。
 *
 * 记日志与 `log: false` 两组都跑。记日志的实体还钉变更触发器：不关触发器时每条动作都按主键物理列记下 entityId；
 * 拉取回填关掉触发器、一条不记，回填后重挂的触发器照常记下本地写。仓库写入链路见 `../custom-primary-key.spec.ts`。
 */
import {
  Entity,
  EntityBase,
  PropertyType,
  RxDB,
  RxDBChange,
  type RxDBEntityId,
  type SwitchVersionActions,
  type SwitchVersionChange,
  SyncType
} from '@aiao/rxdb';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGliteRepository } from '../../repository/PGliteRepository.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from '../test-utils.js';

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

@Entity({
  name: 'SwitchCpkLoggedUuid',
  tableName: 'switch_cpk_logged_uuid',
  properties: [
    { name: 'id', columnName: 'row_key', type: PropertyType.uuid, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
class SwitchCpkLoggedUuid extends EntityBase {
  label!: string;
}

@Entity({
  name: 'SwitchCpkLoggedInteger',
  tableName: 'switch_cpk_logged_integer',
  properties: [
    { name: 'id', columnName: 'row_no', type: PropertyType.integer, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
class SwitchCpkLoggedInteger extends EntityBase {
  label!: string;
}

@Entity({
  name: 'SwitchCpkLoggedBigint',
  tableName: 'switch_cpk_logged_bigint',
  properties: [
    { name: 'id', columnName: 'row_big', type: PropertyType.bigint, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string }
  ]
})
class SwitchCpkLoggedBigint extends EntityBase {
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

const UUID_ID: RxDBEntityId = '0193a2f0-0000-7000-8000-0000000000a1';
const BIGINT_ID: RxDBEntityId = 9007199254740993n;

const cases = [
  {
    title: 'uuid 主键',
    log: false,
    entity: 'SwitchCpkUuid',
    table: '"public"."switch_cpk_uuid"',
    column: 'row_key',
    id: UUID_ID
  },
  {
    title: 'integer 主键',
    log: false,
    entity: 'SwitchCpkInteger',
    table: '"public"."switch_cpk_integer"',
    column: 'row_no',
    id: 7
  },
  {
    title: 'bigint 主键',
    log: false,
    entity: 'SwitchCpkBigint',
    table: '"public"."switch_cpk_bigint"',
    column: 'row_big',
    id: BIGINT_ID
  },
  {
    title: 'uuid 主键（记日志）',
    log: true,
    entity: 'SwitchCpkLoggedUuid',
    table: '"public"."switch_cpk_logged_uuid"',
    column: 'row_key',
    id: UUID_ID
  },
  {
    title: 'integer 主键（记日志）',
    log: true,
    entity: 'SwitchCpkLoggedInteger',
    table: '"public"."switch_cpk_logged_integer"',
    column: 'row_no',
    id: 7
  },
  {
    title: 'bigint 主键（记日志）',
    log: true,
    entity: 'SwitchCpkLoggedBigint',
    table: '"public"."switch_cpk_logged_bigint"',
    column: 'row_big',
    id: BIGINT_ID
  }
];

describe('版本切换 SQL：自定义主键列', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [
        SwitchCpkUuid,
        SwitchCpkInteger,
        SwitchCpkBigint,
        SwitchCpkLoggedUuid,
        SwitchCpkLoggedInteger,
        SwitchCpkLoggedBigint
      ],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    adapter = (await rxdb.connect('pglite')) as RxDBAdapterPGlite;
  });

  // 记日志的表上 DELETE 会经触发器落变更行：整库清掉再重挂触发器，下一条用例从空的变更日志开始
  afterEach(async () => {
    await cleanup_db(adapter);
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

  const changesOf = async (entity: string): Promise<Array<Pick<RxDBChange, 'type' | 'entityId'>>> => {
    const repository = adapter.getRepository<typeof RxDBChange, PGliteRepository<typeof RxDBChange>>(RxDBChange);
    const changes = await repository.findAll({
      where: { combinator: 'and', rules: [{ field: 'entity', operator: '=', value: entity }] },
      orderBy: [{ field: 'id', sort: 'asc' }]
    });
    return changes.map(row => ({ type: row.type, entityId: row.entityId }));
  };

  describe.each(cases)('$title', ({ entity, table, column, id }) => {
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

    it('更新：UPDATE 一腿按主键物理列改写目标行', async () => {
      await adapter.mergeChanges(actionsOf({ inserts: new Map([[key, change({ id, label: 'before' })]]) }));
      await adapter.mergeChanges(
        actionsOf({ updates: new Map([[key, change({ label: 'after' }, { label: 'before' })]]) })
      );

      expect(await labelsOf(table, column)).toEqual([{ key: String(id), label: 'after' }]);
    });

    it('拉取回填（关触发器）：插入、更新、删除都按主键物理列落地，不记变更行', async () => {
      const pull = (part: Partial<SwitchVersionActions>) => adapter.mergeChanges(actionsOf(part), undefined, true);

      await pull({ inserts: new Map([[key, change({ id, label: 'pulled' })]]) });
      await pull({ updates: new Map([[key, change({ label: 'pulled-2' }, { label: 'pulled' })]]) });
      expect(await labelsOf(table, column)).toEqual([{ key: String(id), label: 'pulled-2' }]);

      await pull({ deletes: new Map([[key, change(null, { id, label: 'pulled-2' })]]) });
      expect(await labelsOf(table, column)).toEqual([]);
      expect(await changesOf(entity)).toEqual([]);
    });
  });

  describe.each(cases.filter(item => item.log))('$title：变更触发器', ({ entity, id }) => {
    const key = `public:${entity}:${String(id)}`;

    it('不关触发器：插入、更新、删除都按主键物理列记下 entityId', async () => {
      await adapter.mergeChanges(actionsOf({ inserts: new Map([[key, change({ id, label: 'v1' })]]) }));
      await adapter.mergeChanges(actionsOf({ updates: new Map([[key, change({ label: 'v2' }, { label: 'v1' })]]) }));
      await adapter.mergeChanges(actionsOf({ deletes: new Map([[key, change(null, { id, label: 'v2' })]]) }));

      expect(await changesOf(entity)).toEqual([
        { type: 'INSERT', entityId: id },
        { type: 'UPDATE', entityId: id },
        { type: 'DELETE', entityId: id }
      ]);
    });

    it('拉取回填后重挂的触发器照常按主键物理列记下本地写', async () => {
      await adapter.mergeChanges(
        actionsOf({ inserts: new Map([[key, change({ id, label: 'pulled' })]]) }),
        undefined,
        true
      );
      await adapter.mergeChanges(
        actionsOf({ updates: new Map([[key, change({ label: 'local' }, { label: 'pulled' })]]) })
      );

      expect(await changesOf(entity)).toEqual([{ type: 'UPDATE', entityId: id }]);
    });
  });
});
