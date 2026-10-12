/**
 * @fileoverview SQLite family 漂移检查的单元测试（US-030 AC#10 / #11 / #16）。
 *
 * 用 mock client 喂 `sqlite_master` 的建表 SQL 文本，覆盖：
 * - AC#10：声明了 CHECK 而库里没有 → 抛 RxDBConstraintDriftError 列出缺失与多余；
 * - AC#11：只改表达式不改 name → 约束名换哈希 → 旧名判「多余」、新名判「缺失」；
 * - AC#16：外键约束 / 匿名 CHECK / 系统触发器 / idx_ 索引都不在比对范围；
 * - 通过 `adapter.checkEntityConstraints()` 的完整路径（bootstrapTransaction 事务内执行）。
 */

import {
  compileCheckConstraint,
  Entity,
  EntityBase,
  getEntityMetadata,
  PropertyType,
  RxDBConstraintDriftError,
  type EntityType
} from '@aiao/rxdb';
import { describe, expect, it, vi } from 'vitest';
import type { SqliteClientLike, SqliteSuccessResult } from '../sqlite-core.interface.js';
import { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
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

const querier = (createSqlByTable: Record<string, string>) => ({
  execute: vi.fn().mockImplementation(async (sql: string, bindings?: unknown[]) => {
    void sql;
    const tableName = String(bindings?.[0] ?? '');
    return createSqlByTable[tableName] === undefined ? sqliteMasterResult('') : sqliteMasterResult(createSqlByTable[tableName]);
  })
});

const createSqlWith = (constraints: readonly string[]): string =>
  `CREATE TABLE "public$Checked" ("id" TEXT PRIMARY KEY, "qty" INTEGER, "note" TEXT, ${constraints.join(', ')})`;

describe('check_entity_constraints_sqlite（AC#10 / #11 / #16）', () => {
  it('声明与库一致时不抛错', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({
      'public$Checked': createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`
      ])
    });
    await expect(check_entity_constraints_sqlite(q as never, [Checked])).resolves.toBeUndefined();
  });

  it('AC#10：库里缺一条 CHECK → 抛 RxDBConstraintDriftError 列出缺失，不自动补建', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({ 'public$Checked': createSqlWith([`CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`]) });
    try {
      await check_entity_constraints_sqlite(q as never, [Checked]);
      expect.unreachable('漂移应当抛错');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBConstraintDriftError);
      const drift = error as RxDBConstraintDriftError;
      expect(drift.entity).toBe('Checked');
      expect(drift.tableName).toBe('Checked');
      expect(drift.missing).toEqual([noteName]);
      expect(drift.extra).toEqual([]);
    }
    // 只读：没有下发任何 DDL（execute 只有一条 sqlite_master 查询）
    expect(q.execute).toHaveBeenCalledTimes(1);
    expect(String(q.execute.mock.calls[0][0])).toContain('sqlite_master');
  });

  it('AC#10：库里多条声明外的 ck_ 约束 → 列「多余」', async () => {
    const [qtyName, noteName] = expectedNames();
    const q = querier({
      'public$Checked': createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`,
        `CONSTRAINT "ck_Checked_removed_1a2b3c4d" CHECK ("qty" < 100)`
      ])
    });
    try {
      await check_entity_constraints_sqlite(q as never, [Checked]);
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
      'public$Checked': createSqlWith([
        `CONSTRAINT "ck_Checked_qty_positive_deadbeef" CHECK ("qty" > 1)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`
      ])
    });
    try {
      await check_entity_constraints_sqlite(q as never, [Checked]);
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
      'public$Checked': createSqlWith([
        `CONSTRAINT "${qtyName}" CHECK ("qty" > 0)`,
        `CONSTRAINT "${noteName}" CHECK ("note" <= 10)`,
        `CONSTRAINT "Checked_parent_fk" FOREIGN KEY ("parentId") REFERENCES "other"("id")`,
        `CHECK ("qty" IN (0, 1))`,
        `CHECK (JSON_VALID("note"))`
      ])
    });
    await expect(check_entity_constraints_sqlite(q as never, [Checked])).resolves.toBeUndefined();
  });

  it('未声明 checks 的实体表上没有 ck_ 对象 → 无漂移；有残留 ck_ → 判多余', async () => {
    @Entity({ name: 'Plain', namespace: 'public', log: false, properties: [{ name: 'x', type: PropertyType.string }] })
    class Plain extends EntityBase {}

    await expect(
      check_entity_constraints_sqlite(
        querier({ 'public$Plain': 'CREATE TABLE "public$Plain" ("id" TEXT PRIMARY KEY, "x" TEXT)' }) as never,
        [Plain]
      )
    ).resolves.toBeUndefined();

    try {
      await check_entity_constraints_sqlite(
        querier({
          'public$Plain': 'CREATE TABLE "public$Plain" ("id" TEXT PRIMARY KEY, "x" TEXT, CONSTRAINT "ck_Plain_stale_0badc0de" CHECK ("x" != \'bad\'))'
        }) as never,
        [Plain]
      );
      expect.unreachable('残留 ck_ 约束应当判多余');
    } catch (error) {
      expect((error as RxDBConstraintDriftError).extra).toEqual(['ck_Plain_stale_0badc0de']);
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
