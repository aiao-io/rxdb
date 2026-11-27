/**
 * @fileoverview 自定义主键列的写入链路（PGlite）：主键属性 `id` 经 `columnName` 落到别的物理列
 *
 * @remarks
 * 主键的 JS 属性名恒为 `id`，物理列名可以改。拼进 SQL 的主键列只要有一处写死字面量 `id`，这类实体在那条路上就报
 * `column "id" does not exist`（变更触发器里报 `record "new" has no field "id"`）。这里钉住仓库单条写、批量写、
 * 按行号回查、变更触发器记下的 entityId，以及撤销 / 重做与切分支走的 UPDATE 一腿；uuid / integer / bigint 三种主键，
 * 记日志与 `log: false` 两组各跑一遍。sqlite-core 的同一组断言在 `shared-custom-primary-key.suite.ts`（SQLC-014）；
 * 版本切换 SQL 本身（含拉取回填）见 `version/switch-result.custom-primary-key.spec.ts`。
 */
import {
  Entity,
  EntityBase,
  type EntityPropertyMetadataOptions,
  PropertyType,
  RxDB,
  RxDBChange,
  type RxDBEntityId,
  SyncType
} from '@aiao/rxdb';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import type { PGliteRepository } from '../repository/PGliteRepository.js';
import { RxDBAdapterPGlite } from '../RxDBAdapterPGlite.js';
import { cleanup_db, generateDbName } from './test-utils.js';

/** 一种主键：属性名恒为 `id`、物理列改了名；两个取值供单条与批量用例 */
interface KeyKind {
  readonly kind: 'Uuid' | 'Integer' | 'Bigint';
  readonly column: string;
  readonly idProperty: EntityPropertyMetadataOptions;
  readonly ids: readonly [RxDBEntityId, RxDBEntityId];
}

const KEY_KINDS: readonly KeyKind[] = [
  {
    kind: 'Uuid',
    column: 'row_key',
    idProperty: {
      name: 'id',
      columnName: 'row_key',
      type: PropertyType.uuid,
      primary: true,
      unique: true,
      readonly: true
    },
    ids: ['0193a2f0-0000-7000-8000-0000000000c1', '0193a2f0-0000-7000-8000-0000000000c2']
  },
  {
    kind: 'Integer',
    column: 'row_no',
    idProperty: {
      name: 'id',
      columnName: 'row_no',
      type: PropertyType.integer,
      primary: true,
      unique: true,
      readonly: true
    },
    ids: [7, 8]
  },
  {
    kind: 'Bigint',
    column: 'row_big',
    idProperty: {
      name: 'id',
      columnName: 'row_big',
      type: PropertyType.bigint,
      primary: true,
      unique: true,
      readonly: true
    },
    // 越过 2^53：主键在 SQL 与变更日志里都不能经 JS number 走一遭
    ids: [9_007_199_254_740_993n, 9_007_199_254_740_995n]
  }
];

const defineEntity = (key: KeyKind, log: boolean) => {
  const mode = log ? 'Logged' : 'Unlogged';
  const tableName = `cpk_${mode.toLowerCase()}_${key.kind.toLowerCase()}`;

  @Entity({
    name: `Cpk${mode}${key.kind}` as Capitalize<string>,
    tableName,
    log,
    properties: [key.idProperty, { name: 'label', type: PropertyType.string }]
  })
  class CpkRow extends EntityBase<RxDBEntityId> {
    declare id: RxDBEntityId;
    label!: string;
  }

  return { EntityType: CpkRow, entity: `Cpk${mode}${key.kind}`, table: `"public"."${tableName}"` };
};

const CASES = [true, false].flatMap(log =>
  KEY_KINDS.map(key => ({
    title: `${log ? '记日志' : 'log: false'} · ${key.kind.toLowerCase()} 主键`,
    log,
    key,
    ...defineEntity(key, log)
  }))
);

/** 自定义主键列 + 加密列 + 记日志：加密 AAD 里带着行主键，变更行与撤销回写都得取同一个值 */
@Entity({
  name: 'CpkLoggedSecret',
  tableName: 'cpk_logged_secret',
  properties: [
    { name: 'id', columnName: 'pk_id', type: PropertyType.uuid, primary: true, unique: true, readonly: true },
    { name: 'label', type: PropertyType.string },
    { name: 'secret', type: PropertyType.string, encrypted: true, nullable: true }
  ]
})
class CpkLoggedSecret extends EntityBase<RxDBEntityId> {
  declare id: RxDBEntityId;
  label!: string;
  secret!: string | null;
}

const changesOf = async (
  adapter: RxDBAdapterPGlite,
  entity: string
): Promise<Array<Pick<RxDBChange, 'type' | 'entityId'>>> => {
  const repository = adapter.getRepository<typeof RxDBChange, PGliteRepository<typeof RxDBChange>>(RxDBChange);
  const changes = await repository.findAll({
    where: { combinator: 'and', rules: [{ field: 'entity', operator: '=', value: entity }] },
    orderBy: [{ field: 'id', sort: 'asc' }]
  });
  return changes.map(change => ({ type: change.type, entityId: change.entityId }));
};

describe.sequential('自定义主键列的写入链路（PGlite）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: CASES.map(item => item.EntityType),
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.use(rxDBPluginHistory);
    adapter = (await rxdb.connect('pglite')) as RxDBAdapterPGlite;
  });

  afterEach(async () => {
    const { historyManager } = rxdb.versionManager as unknown as { historyManager: { clearRedoStack(): void } };
    historyManager.clearRedoStack();
    await cleanup_db(adapter);
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  /** 按主键物理列读回落库的行，绕开实体缓存与查询生成器 */
  const rowsOf = async (table: string, column: string): Promise<Array<{ key: string; label: string }>> =>
    (
      await adapter.internalQuery<{ key: string; label: string }>(
        `SELECT "${column}"::text AS key, label FROM ${table} ORDER BY label`
      )
    ).rows;

  describe.each(CASES)('$title', ({ key, EntityType, table }) => {
    const [firstId, secondId] = key.ids;
    const make = (id: RxDBEntityId, label: string) => {
      const row = new EntityType();
      row.id = id;
      row.label = label;
      return row;
    };

    it('单条 create → update → remove：按主键物理列写入、改写、删除', async () => {
      const row = make(firstId, 'created');
      await row.save();
      expect(await rowsOf(table, key.column)).toEqual([{ key: String(firstId), label: 'created' }]);

      row.label = 'updated';
      await row.save();
      expect(await rowsOf(table, key.column)).toEqual([{ key: String(firstId), label: 'updated' }]);

      await row.remove();
      expect(await rowsOf(table, key.column)).toEqual([]);
    });

    it('批量写（mutations）：插入、更新、删除都按主键物理列定位', async () => {
      const first = make(firstId, 'batch-a');
      const second = make(secondId, 'batch-b');
      await rxdb.entityManager.saveMany([first, second]);

      first.label = 'batch-a2';
      second.label = 'batch-b2';
      await rxdb.entityManager.saveMany([first, second]);
      expect(await rowsOf(table, key.column)).toEqual([
        { key: String(firstId), label: 'batch-a2' },
        { key: String(secondId), label: 'batch-b2' }
      ]);

      await rxdb.entityManager.removeMany([first, second]);
      expect(await rowsOf(table, key.column)).toEqual([]);
    });

    it('按行号回查（findByRowIds）：NOTIFY 给的是文本行号，按主键物理列取行', async () => {
      await make(firstId, 'by-row-id').save();
      rxdb.entityManager.cleanAllCache();

      const repository = adapter.getRepository<typeof EntityType, PGliteRepository<typeof EntityType>>(EntityType);
      const found = await repository.findByRowIds([String(firstId)]);

      expect(found.map(row => ({ id: row.id, label: row.label }))).toEqual([{ id: firstId, label: 'by-row-id' }]);
    });
  });

  describe.each(CASES.filter(item => item.log))('$title：变更日志与版本切换', ({ key, EntityType, entity, table }) => {
    const [firstId, secondId] = key.ids;
    const make = (id: RxDBEntityId, label: string) => {
      const row = new EntityType();
      row.id = id;
      row.label = label;
      return row;
    };

    it('变更触发器按主键物理列记下 entityId', async () => {
      const row = make(firstId, 'v1');
      await row.save();
      row.label = 'v2';
      await row.save();
      await row.remove();

      expect(await changesOf(adapter, entity)).toEqual([
        { type: 'INSERT', entityId: firstId },
        { type: 'UPDATE', entityId: firstId },
        { type: 'DELETE', entityId: firstId }
      ]);
    });

    it('撤销 / 重做：UPDATE 一腿按主键物理列回写', async () => {
      const row = make(firstId, 'v1');
      await row.save();
      row.label = 'v2';
      await row.save();

      await rxdb.versionManager.history().undo();
      expect(await rowsOf(table, key.column)).toEqual([{ key: String(firstId), label: 'v1' }]);

      await rxdb.versionManager.history().redo();
      expect(await rowsOf(table, key.column)).toEqual([{ key: String(firstId), label: 'v2' }]);
    });

    it('切分支：切回 main 时 UPDATE 一腿按主键物理列回滚，分支上新建的行被删掉', async () => {
      const branchId = `cpk_${key.kind.toLowerCase()}`;
      const row = make(firstId, 'on-main');
      await row.save();
      await rxdb.versionManager.createBranch(branchId);
      await rxdb.versionManager.switchBranch(branchId);

      row.label = 'on-branch';
      await row.save();
      await make(secondId, 'z-branch-only').save();
      expect(await rowsOf(table, key.column)).toEqual([
        { key: String(firstId), label: 'on-branch' },
        { key: String(secondId), label: 'z-branch-only' }
      ]);

      await rxdb.versionManager.switchBranch('main');
      expect(await rowsOf(table, key.column)).toEqual([{ key: String(firstId), label: 'on-main' }]);
    });
  });

  it('业务表不挂 notify_change：它只挂在主键恒为 id 的三张系统表上', async () => {
    const { rows } = await adapter.internalQuery<{ table: string }>(
      `SELECT c.relname AS "table"
         FROM pg_trigger t
         JOIN pg_class c ON c.oid = t.tgrelid
         JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE NOT t.tgisinternal AND p.proname = 'notify_change'
        ORDER BY c.relname`
    );

    expect(rows.map(row => row.table)).toEqual(['rxdb_branch', 'rxdb_change', 'rxdb_migration']);
  });
});

// 单独起一个适配器：实体声明了加密列，适配器要先解锁才能写，不该把这个前提压到上面那组用例身上
describe.sequential('自定义主键列 + 加密列 + 记日志（PGlite）', () => {
  let rxdb: RxDB;
  let adapter: RxDBAdapterPGlite;

  beforeAll(async () => {
    rxdb = new RxDB({
      dbName: generateDbName(),
      entities: [CpkLoggedSecret],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory' }));
    rxdb.use(rxDBPluginHistory);
    adapter = (await rxdb.connect('pglite')) as RxDBAdapterPGlite;
    await adapter.encryption.unlock({ keyBytes: new Uint8Array(32).fill(9), idleTimeoutMs: 0 });
  });

  afterAll(async () => {
    if (rxdb) await rxdb.disconnectAll();
  });

  it('写入、变更行与撤销回写都按主键物理列走，密文落库、读回解得开', async () => {
    const id: RxDBEntityId = '0193a2f0-0000-7000-8000-0000000000d1';
    const row = new CpkLoggedSecret();
    row.id = id;
    row.label = 'secret-row';
    row.secret = 'secret-v1';
    await row.save();
    row.secret = 'secret-v2';
    await row.save();

    expect(await changesOf(adapter, 'CpkLoggedSecret')).toEqual([
      { type: 'INSERT', entityId: id },
      { type: 'UPDATE', entityId: id }
    ]);

    await rxdb.versionManager.history().undo();

    const stored = await adapter.internalQuery<{ secret: string }>(
      `SELECT secret FROM "public"."cpk_logged_secret" WHERE "pk_id" = $1`,
      [id]
    );
    expect(stored.rows.map(item => item.secret)).toHaveLength(1);
    expect(stored.rows[0].secret).not.toContain('secret-v1');

    rxdb.entityManager.cleanAllCache();
    const repository = adapter.getRepository<typeof CpkLoggedSecret, PGliteRepository<typeof CpkLoggedSecret>>(
      CpkLoggedSecret
    );
    const restored = await repository.findAll({ where: { combinator: 'and', rules: [] } });
    expect(restored.map(item => ({ id: item.id, secret: item.secret }))).toEqual([{ id, secret: 'secret-v1' }]);
  });
});
