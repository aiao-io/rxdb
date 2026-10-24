/**
 * @fileoverview SQLite family 漂移检查的单元测试（US-030 AC#10 / #11 / #16）。
 *
 * 用 mock client 喂 `sqlite_master` 的建表 SQL 文本与索引 / 触发器行，覆盖：
 * - AC#10：声明了 CHECK / 条件唯一索引 / 区间排他而库里没有 → 抛 RxDBConstraintDriftError 列出缺失与多余；
 * - AC#11：只改表达式不改 name → 约束名换哈希 → 旧名判「多余」、新名判「缺失」；
 * - AC#12：区间排他只剩插入触发器（UPDATE 能静默造出重叠）→ 判缺失 `_u`；
 * - AC#16：外键约束 / 匿名 CHECK / 系统触发器 / idx_ 索引都不在比对范围；
 * - 通过 `adapter.checkEntityConstraints()` 的完整路径（bootstrapTransaction 事务内执行）。
 */

import {
  compileCheckConstraint,
  compileConditionalUniqueIndex,
  compileExclusionConstraint,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDBConstraintDriftError,
  WorktreeTableSet,
  type EntityType
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import type { SqliteClientLike, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { check_entity_constraints_sqlite } from '../table/check-entity-constraints.js';

@Entity({
  name: 'Checked',
  namespace: 'public',
  log: false,
  properties: [
    { name: 'qty', type: PropertyType.integer, nullable: true },
    { name: 'note', type: PropertyType.string, nullable: true }
  ],
  checks: [
    { name: 'qty_positive', rule: { combinator: 'and', rules: [{ field: 'qty', operator: '>', value: 0 }] } },
    { name: 'note_short', rule: { combinator: 'and', rules: [{ field: 'note', operator: '<=', value: 'z' }] } }
  ]
})
class Checked extends EntityBase {
  qty!: number | null;
}

/** 两条声明的确定性约束名。 */
const expectedNames = (): [string, string] => {
  const meta = getEntityMetadata(Checked);
  return [
    compileCheckConstraint(meta, meta.checkMap.get('qty_positive')!).name,
    compileCheckConstraint(meta, meta.checkMap.get('note_short')!).name
  ];
};

const sqliteMasterResult = (createSql: string): SqliteSuccessResult => ({
  sql: '',
  rowsAffected: 0,
  elapsed: 0,
  results: [{ columns: ['sql'], rows: [[createSql]] }]
});

/** 挂在表上的索引 / 触发器名（`sqlite_master` 里 `type = 'index' | 'trigger'` 的行）。 */
interface CatalogObjects {
  readonly index?: Record<string, readonly string[]>;
  readonly trigger?: Record<string, readonly string[]>;
}

const querier = (createSqlByTable: Record<string, string>, objects: CatalogObjects = {}) => ({
  execute: vi.fn().mockImplementation(async (sql: string, bindings?: unknown[]) => {
    // 索引 / 触发器查询：bindings = [type, tableName]
    if (String(sql).includes('type = ?')) {
      const [type, tableName] = (bindings ?? []).map(String) as ['index' | 'trigger', string];
      const names = objects[type]?.[tableName] ?? [];
      return {
        sql: '',
        rowsAffected: 0,
        elapsed: 0,
        results: [{ columns: ['name'], rows: names.map(name => [name]) }]
      };
    }
    const tableName = String(bindings?.[0] ?? '');
    // 未登记的表：无结果集（sqlite_master 查不到该表 = 表缺失）
    return createSqlByTable[tableName] === undefined ?
        { sql: '', rowsAffected: 0, elapsed: 0, results: [] }
      : sqliteMasterResult(createSqlByTable[tableName]);
  })
});

const createSqlWith = (constraints: readonly string[]): string =>
  `CREATE TABLE "public$Checked" ("id" TEXT PRIMARY KEY, "qty" INTEGER, "note" TEXT, ${constraints.join(', ')})`;

describe('check_entity_constraints_sqlite（AC#10 / #11 / #16）', () => {
  it('声明与库一致时不抛错', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({
      public$Checked: createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`
      ])
    });
    await expect(
      check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked])
    ).resolves.toBeUndefined();
  });

  it('AC#10：库里缺一条 CHECK → 抛 RxDBConstraintDriftError 列出缺失，不自动补建', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({ public$Checked: createSqlWith([`CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`]) });
    try {
      await check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBConstraintDriftError);
      const drift = error as RxDBConstraintDriftError;
      expect(drift.entity).toBe('Checked');
      expect(drift.tableName).toBe('Checked');
      expect(drift.missing).toEqual([noteName]);
      expect(drift.extra).toEqual([]);
    }
    // 只读：没有下发任何 DDL（建表文本、索引、触发器三条 sqlite_master 查询）
    expect(q.execute).toHaveBeenCalledTimes(3);
    for (const [sql] of q.execute.mock.calls) {
      expect(String(sql)).toMatch(/^SELECT [^;]* FROM sqlite_master WHERE/);
    }
  });

  it('AC#10：库里多条声明外的 ck_ 约束 → 列「多余」', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({
      public$Checked: createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`,
        `CONSTRAINT "ck_Checked_removed_1a2b3c4d" CHECK ("qty" < 100)`
      ])
    });
    try {
      await check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      const drift = error as RxDBConstraintDriftError;
      expect(drift.missing).toEqual([]);
      expect(drift.extra).toEqual(['ck_Checked_removed_1a2b3c4d']);
    }
  });

  it('AC#11：只改表达式不改 name → 哈希换名 → 旧名判多余、新名判缺失', async () => {
    const [qtyName, noteName] = expectedNames();
    // 库里是同名约束的旧哈希版本：名字不同、语义已变
    const q = querier({
      public$Checked: createSqlWith([
        `CONSTRAINT "ck_Checked_qty_positive_deadbeef" CHECK ("qty" > 1)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`
      ])
    });
    try {
      await check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      const drift = error as RxDBConstraintDriftError;
      expect(drift.missing).toEqual([qtyName]);
      expect(drift.extra).toEqual(['ck_Checked_qty_positive_deadbeef']);
    }
  });

  it('AC#16：外键 / 匿名 CHECK / idx_ 索引 / 系统触发器都不在比对范围', async () => {
    const [qtyName, noteName] = expectedNames();
    // sqlite_master 的 sql 文本里混入各种「不是我家的」对象名
    const q = querier({
      public$Checked: createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`,
        `CONSTRAINT "Checked_parent_fk" FOREIGN KEY ("parentId") REFERENCES "other"("id")`,
        `CHECK ("qty" IN (0, 1))`,
        `CHECK (JSON_VALID("note"))`
      ])
    });
    await expect(
      check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked])
    ).resolves.toBeUndefined();
  });

  it('评审反例：ck_ 起头的外键 / 唯一约束名不算 CHECK（只认名字后紧跟 CHECK 的命名约束）', async () => {
    const [qtyName, noteName] = expectedNames();
    // foreignKeys 的约束名就是作者给的 name，合法地可以 ck_ 起头；手写迁移的 UNIQUE 同理
    const q = querier({
      public$Checked: createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`,
        `CONSTRAINT "ck_parent_fk" FOREIGN KEY ("parentId") REFERENCES "parent" ("id")`,
        `constraint ck_note_unique UNIQUE ("note")`
      ])
    });
    await expect(
      check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked])
    ).resolves.toBeUndefined();
  });

  it('评审反例：字符串字面量里伪造的 CONSTRAINT "ck_..." 片段不算约束名', async () => {
    const [qtyName, noteName] = expectedNames();
    // 默认值字面量里藏着伪约束文本：不剥离字面量就会解析出假 ck 名、每次 connect 报「多余」
    const q = querier({
      public$Checked: createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`,
        `"note" TEXT DEFAULT 'CONSTRAINT "ck_Checked_fake_0badc0de" CHECK (1)'`
      ])
    });
    await expect(
      check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked])
    ).resolves.toBeUndefined();
  });

  it('评审反例：小写 constraint 关键字与无引号 / 反引号标识符同样被识别', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({
      public$Checked: createSqlWith([
        `constraint ${qtyName} CHECK ("qty" > 0)`,
        `CONSTRAINT \`${noteName}\` CHECK ("note" <= 10)`
      ])
    });
    await expect(
      check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked])
    ).resolves.toBeUndefined();
  });

  it('评审反例：表缺失 fail-fast 报漂移并点名表缺失（两后端同口径，不静默跳过）', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({}); // 任何表名都没有行
    try {
      await check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Checked]);
      expect.unreachable('表缺失应当报漂移');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBConstraintDriftError);
      const drift = error as RxDBConstraintDriftError;
      expect(drift.tableMissing).toBe(true);
      expect(drift.missing).toEqual([noteName, qtyName]);
      expect(drift.message).toContain('missing from the database catalog');
    }
  });

  it('未声明 checks 的实体表上没有 ck_ 对象 → 无漂移；有残留 ck_ → 判多余', async () => {
    @Entity({ name: 'Plain', namespace: 'public', log: false, properties: [{ name: 'x', type: PropertyType.string }] })
    class Plain extends EntityBase {}

    await expect(
      check_entity_constraints_sqlite(
        querier({ public$Plain: 'CREATE TABLE "public$Plain" ("id" TEXT PRIMARY KEY, "x" TEXT)' }) as never,
        WorktreeTableSet.MAIN,
        [Plain]
      )
    ).resolves.toBeUndefined();

    try {
      await check_entity_constraints_sqlite(
        querier({
          public$Plain:
            'CREATE TABLE "public$Plain" ("id" TEXT PRIMARY KEY, "x" TEXT, CONSTRAINT "ck_Plain_stale_0badc0de" CHECK ("x" != \'bad\'))'
        }) as never,
        WorktreeTableSet.MAIN,
        [Plain]
      );
      expect.unreachable('残留 ck_ 约束应当判多余');
    } catch (error) {
      expect((error as RxDBConstraintDriftError).extra).toEqual(['ck_Plain_stale_0badc0de']);
    }
  });
});

describe('条件唯一索引与区间排他的漂移（阶段 B / C）', () => {
  @Entity({
    name: 'Ranged',
    namespace: 'public',
    log: false,
    properties: [
      { name: 'lineId', type: PropertyType.string },
      { name: 'state', type: PropertyType.string },
      { name: 'unitFrom', type: PropertyType.integer, nullable: true },
      { name: 'unitTo', type: PropertyType.integer, nullable: true }
    ],
    indexes: [
      { name: 'line_idx', properties: ['lineId'] },
      {
        name: 'released_line',
        properties: ['lineId'],
        unique: true,
        where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
      }
    ],
    exclusions: [{ name: 'no_overlap', equal: ['lineId'], ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }] }]
  })
  class Ranged extends EntityBase {}

  const names = () => {
    const meta = getEntityMetadata(Ranged);
    const exclusion = compileExclusionConstraint(meta, meta.exclusionMap.get('no_overlap')!).name;
    return {
      unique: compileConditionalUniqueIndex(meta, meta.indexMap.get('released_line')!).name,
      insertTrigger: `${exclusion}_i`,
      updateTrigger: `${exclusion}_u`
    };
  };

  const createSql = { public$Ranged: 'CREATE TABLE "public$Ranged" ("id" TEXT PRIMARY KEY, "lineId" TEXT)' };

  it('uq_ 索引与两个 ex_ 触发器俱全 → 无漂移；idx_ 索引与系统 CRUD 触发器不在范围（AC#16）', async () => {
    const { unique, insertTrigger, updateTrigger } = names();
    const q = querier(createSql, {
      index: { public$Ranged: ['idx_public$Ranged_line_idx', unique, 'sqlite_autoindex_public$Ranged_1'] },
      trigger: { public$Ranged: ['public$Ranged_insert', 'public$Ranged_update', insertTrigger, updateTrigger] }
    });
    await expect(check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Ranged])).resolves.toBeUndefined();
  });

  it('AC#10：缺 uq_ 索引 → 判缺失；残留别的 uq_ 索引 → 判多余', async () => {
    const { unique, insertTrigger, updateTrigger } = names();
    const q = querier(createSql, {
      index: { public$Ranged: ['uq_Ranged_released_line_deadbeef'] },
      trigger: { public$Ranged: [insertTrigger, updateTrigger] }
    });
    try {
      await check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Ranged]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      const drift = error as RxDBConstraintDriftError;
      expect(drift.missing).toEqual([unique]);
      expect(drift.extra).toEqual(['uq_Ranged_released_line_deadbeef']);
    }
  });

  it('AC#12：只剩插入触发器（UPDATE 能静默造出重叠）→ 判缺失 _u', async () => {
    const { unique, insertTrigger, updateTrigger } = names();
    const q = querier(createSql, {
      index: { public$Ranged: [unique] },
      trigger: { public$Ranged: [insertTrigger] }
    });
    try {
      await check_entity_constraints_sqlite(q as never, WorktreeTableSet.MAIN, [Ranged]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      const drift = error as RxDBConstraintDriftError;
      expect(drift.missing).toEqual([updateTrigger]);
      expect(drift.extra).toEqual([]);
    }
  });
});

describe('adapter.checkEntityConstraints 完整路径（bootstrapTransaction 内执行）', () => {
  /** 与 RxDBAdapterSqliteBase.spec.ts 同一口径的事务序幕替身：分支读必须答话。 */
  const BRANCH_TABLE_PATTERN = /^SELECT [^;]*FROM "rxdb\$rxdb_branch"/;
  const branchRow = (sql: string) => ({
    sql,
    rowsAffected: 0,
    elapsed: 0,
    results: [{ columns: ['__rowid', 'id', 'activated'], rows: [[1, 'main', 1]] }]
  });

  class TestAdapter extends RxDBAdapterSqliteBase {
    readonly name = 'test-sqlite';
    constructor(
      rxdb: Parameters<RxDBAdapterSqliteBase['constructor']>[0],
      private readonly clientFactory: () => SqliteClientLike
    ) {
      super(rxdb);
    }
    protected override async createClient(): Promise<SqliteClientLike> {
      return this.clientFactory();
    }
  }

  const rxdbMock = (entities: EntityType[]) =>
    ({
      config: { entities, dbName: 'drift-adapter-mock' },
      context: {},
      connect: vi.fn().mockResolvedValue(undefined),
      dispatchEvent: vi.fn(),
      schemaManager: { getEntityTypeByTableName: vi.fn(), getEntityMetadata: vi.fn(), getEntityType: vi.fn() }
    }) as never;

  it('漂移经 checkEntityConstraints 抛出，且查询落在事务内（不经过就绪门）', async () => {
    const [qtyName, noteName] = expectedNames();
    const client: SqliteClientLike = {
      execute: vi.fn().mockImplementation(async (sql: string) => {
        if (BRANCH_TABLE_PATTERN.test(String(sql))) return branchRow(sql);
        // 宿主版本门槛在 connect() 里查一次：替身答 3.53.0（达标）
        if (String(sql).includes('sqlite_version()')) {
          return { sql: '', rowsAffected: 0, elapsed: 0, results: [{ columns: ['version'], rows: [['3.53.0']] }] };
        }
        return sqliteMasterResult(createSqlWith([`CONSTRAINT "ck_Checked_qty_positive_deadbeef" CHECK ("qty" > 1)`]));
      }),
      disconnect: vi.fn().mockResolvedValue(undefined),
      version: vi.fn().mockResolvedValue('3.53.0'),
      addEventListener: vi.fn()
    };
    const adapter = new TestAdapter(rxdbMock([Checked]), () => client);
    await adapter.connect();
    try {
      await adapter.checkEntityConstraints([Checked]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBConstraintDriftError);
      const drift = error as RxDBConstraintDriftError;
      expect(drift.missing).toEqual([noteName, qtyName]);
      expect(drift.extra).toEqual(['ck_Checked_qty_positive_deadbeef']);
    }
    await adapter.disconnect();
  });
});
