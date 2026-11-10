/**
 * @fileoverview bigint 区间排他在 int8 最大值端点上的真实 SQL 回归（RV-01a1bbb3b74e），SQLite family 一侧。
 *
 * 建表 DDL（表 + 排他的插入 / 更新触发器）由 `create_table_sql` 生成，在真实 SQLite 内存库上执行
 * （浏览器模式 sqlite-wasm、Node 模式 `node:sqlite`）：
 * - 触发器只用 `<` / `<=` 比端点、不做规范化，最大值端点照常比较：具名用例与端点矩阵比对的参照语义与
 *   PGlite 侧（`create_table_exclusion_bigint.executable.spec.ts`）是同一份；
 * - 触发器名与违约消息里的约束名由核心的规范化定义派生：PG 表达式加了最大值分支，bigint `[]` 维的两个
 *   触发器随之换名；
 * - 换名迁移：0.0.28 起建过的库漂移检查报旧触发器多余、新触发器缺失；按迁移说明换名重建后与新建库逐字相同，
 *   违约照常归一。
 */

import {
  compileExclusionConstraint,
  Entity,
  EntityBase,
  exclusionTriggerNames,
  getEntityMetadata,
  hashConstraintDefinition,
  parseExclusionViolation,
  PropertyType,
  RxDBConstraintDriftError,
  RxDBExclusionViolationError,
  toExclusionViolationError,
  transitionMetadata,
  WorktreeTableSet,
  type CompiledExclusionConstraint,
  type EntityMetadata,
  type EntityMetadataOptions,
  type ExclusionBounds
} from '@aiao/rxdb';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../../RxDBAdapterSqliteBase.js';
import type { SQLiteCompatibleType, SqliteResult } from '../../sqlite-core.interface.js';
import { quote_sql_identifier } from '../../sqlite-core.utils.js';
import { get_table_name_by_metadata } from '../../table-name-resolver.js';
import { check_entity_constraints_sqlite } from '../../table/check-entity-constraints.js';
import { create_table_sql } from '../../table/create_table_sql.js';
import { exclusion_trigger_sql } from '../../table/exclusion_trigger_sql.js';
import { createRealSqliteDatabase, type RealSqliteDatabase } from '../fixtures/real-sqlite.js';

const MAX = 9223372036854775807n;
const MIN = -9223372036854775808n;

/** 一维区间的两个端点，`null` 即该侧无界。 */
type Span = readonly [bigint | null, bigint | null];

const adapterStub = {
  rxdb: { schemaManager: { getEntityMetadata: () => undefined } }
} as unknown as RxDBAdapterSqliteBase;

const databases = new Set<RealSqliteDatabase>();

// sqlite-wasm 初始化时绑定 console.warn，之后每条失败语句打一行告警；矩阵里有数百条预期的拒绝，
// 赶在本文件首次初始化之前接管，免得淹没测试输出
beforeAll(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterAll(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  for (const database of databases) database.close();
  databases.clear();
});

/** 相等列 `lineId` + 一维 bigint 区间 `serialFrom..serialTo`。 */
const serialMetadata = (name: string, bounds: ExclusionBounds): EntityMetadata =>
  transitionMetadata({
    name,
    properties: [
      { name: 'id', type: PropertyType.integer, primary: true },
      { name: 'lineId', type: PropertyType.string },
      { name: 'serialFrom', type: PropertyType.bigint, nullable: true },
      { name: 'serialTo', type: PropertyType.bigint, nullable: true }
    ],
    exclusions: [
      { name: 'serial_no_overlap', equal: ['lineId'], ranges: [{ from: 'serialFrom', to: 'serialTo', bounds }] }
    ]
  } as EntityMetadataOptions);

const constraintOf = (metadata: EntityMetadata): CompiledExclusionConstraint =>
  compileExclusionConstraint(metadata, [...metadata.exclusionMap.values()][0]);

const tableOf = (metadata: EntityMetadata): string =>
  quote_sql_identifier(get_table_name_by_metadata(metadata, WorktreeTableSet.MAIN));

const openTable = async (metadata: EntityMetadata): Promise<RealSqliteDatabase> => {
  const database = await createRealSqliteDatabase();
  databases.add(database);
  database.exec(create_table_sql(adapterStub, metadata, WorktreeTableSet.MAIN));
  return database;
};

const literal = (value: bigint | string | null): string => (value === null ? 'NULL' : String(value));

/** 执行一条语句，返回抛出的错误；成功为 `undefined`。 */
const attempt = (database: RealSqliteDatabase, sql: string): unknown => {
  try {
    database.exec(sql);
    return undefined;
  } catch (error) {
    return error;
  }
};

/** 执行一条写入，返回 `ok`、违约的约束名，或原始错误消息。 */
const outcomeOf = (database: RealSqliteDatabase, sql: string): string => {
  const error = attempt(database, sql);
  return error === undefined ? 'ok' : (parseExclusionViolation(error)?.constraintName ?? String(error));
};

const insertSpan = (metadata: EntityMetadata, lineId: string, [from, to]: Span): string =>
  `INSERT INTO ${tableOf(metadata)} ("lineId", "serialFrom", "serialTo") ` +
  `VALUES ('${lineId}', ${literal(from)}, ${literal(to)})`;

/** 参照语义：NULL 端点即该侧无界；`[)` 用 `<`、`[]` 用 `<=` 比端点；倒置（`[)` 含起止相等）即空区间。 */
const overlapsReference = (bounds: ExclusionBounds, a: Span, b: Span): boolean => {
  const before = (x: bigint, y: bigint): boolean => (bounds === '[)' ? x < y : x <= y);
  const lower = (value: bigint | null): bigint => value ?? MIN - 1n;
  const upper = (value: bigint | null): bigint => value ?? MAX + 1n;
  const nonEmpty = ([from, to]: Span): boolean => before(lower(from), upper(to));
  return nonEmpty(a) && nonEmpty(b) && before(lower(a[0]), upper(b[1])) && before(lower(b[0]), upper(a[1]));
};

const ENDPOINTS = [null, 0n, 10n, 11n, MAX - 1n, MAX] as const;
const SPANS: readonly Span[] = ENDPOINTS.flatMap(from => ENDPOINTS.map(to => [from, to] as const));
const SPAN_PAIRS = SPANS.flatMap(a => SPANS.map(b => [a, b] as const));

const formatSpan = ([from, to]: Span): string => `[${literal(from)}, ${literal(to)}]`;

describe('bigint 区间排他：int8 最大值端点（RV-01a1bbb3b74e）', () => {
  it('[] 维：[0, MAX] 可写，[MAX, MAX] 与它冲突；相邻放行、单点重叠被拒；UPDATE 到最大值同样可写', async () => {
    const metadata = serialMetadata('SerialSlot', '[]');
    const { name } = constraintOf(metadata);
    const database = await openTable(metadata);
    const insert = (lineId: string, span: Span) => outcomeOf(database, insertSpan(metadata, lineId, span));

    expect(insert('A', [0n, MAX])).toBe('ok');
    expect(String(attempt(database, insertSpan(metadata, 'A', [MAX, MAX])))).toContain(
      `rxdb:exclusion_violation:${name}:`
    );

    // 相邻：[0, 10] 与 [11, MAX] 不相交
    expect(insert('B', [0n, 10n])).toBe('ok');
    expect(insert('B', [11n, MAX])).toBe('ok');
    // 单点重叠：[10, 10] 落在 [0, 10]，[MAX, MAX] 与 [MAX, ∞) 落在 [11, MAX]
    expect(insert('B', [10n, 10n])).toBe(name);
    expect(insert('B', [MAX, MAX])).toBe(name);
    expect(insert('B', [MAX, null])).toBe(name);
    // 不同相等键互不影响
    expect(insert('C', [MAX, MAX])).toBe('ok');

    // UPDATE 触发器同样设防
    expect(insert('D', [0n, 5n])).toBe('ok');
    expect(outcomeOf(database, `UPDATE ${tableOf(metadata)} SET "serialTo" = ${MAX} WHERE "lineId" = 'D'`)).toBe('ok');
  });

  it('触发器名由核心的规范化定义派生：PG 表达式加了最大值分支，bigint [] 维的两个触发器随之换名', async () => {
    const metadata = serialMetadata('SerialSlot', '[]');
    const database = await openTable(metadata);
    const definition =
      `["public","SerialSlot"] EXCLUDE ("lineId" WITH =, (CASE WHEN "serialFrom" > "serialTo" THEN 'empty'::int8range` +
      ` WHEN "serialTo" = 9223372036854775807 THEN int8range("serialFrom", NULL, '[)')` +
      ` ELSE int8range("serialFrom", "serialTo", '[]') END) WITH &&)`;
    const name = `ex_SerialSlot_serial_no_overlap_${hashConstraintDefinition(definition)}`;
    const triggers = database.all(`SELECT name FROM sqlite_master WHERE type = 'trigger' ORDER BY name`);
    expect(triggers.map(([trigger]) => trigger)).toEqual([...exclusionTriggerNames(name)]);
  });

  it.each(['[]', '[)'] as const)('%s 维：端点矩阵（NULL 无界、倒置、最大值）逐对与参照语义一致', async bounds => {
    const metadata = serialMetadata(bounds === '[]' ? 'SerialMatrixClosed' : 'SerialMatrixHalfOpen', bounds);
    const { name } = constraintOf(metadata);
    const database = await openTable(metadata);
    const mismatches: string[] = [];
    for (const [index, [a, b]] of SPAN_PAIRS.entries()) {
      const first = outcomeOf(database, insertSpan(metadata, `p${index}`, a));
      const second = outcomeOf(database, insertSpan(metadata, `p${index}`, b));
      const expected = overlapsReference(bounds, a, b) ? name : 'ok';
      if (first !== 'ok' || second !== expected) {
        mismatches.push(`${formatSpan(a)} × ${formatSpan(b)}：${first} / ${second}，参照 ${expected}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it('多维组合：bigint [] 维 + 日期 [) 维全部相交才冲突，最大值端点照常参与', async () => {
    const metadata = transitionMetadata({
      name: 'SerialWindow',
      properties: [
        { name: 'id', type: PropertyType.integer, primary: true },
        { name: 'lineId', type: PropertyType.string },
        { name: 'serialFrom', type: PropertyType.bigint, nullable: true },
        { name: 'serialTo', type: PropertyType.bigint, nullable: true },
        { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
        { name: 'effectiveTo', type: PropertyType.date, nullable: true }
      ],
      exclusions: [
        {
          name: 'window_no_overlap',
          equal: ['lineId'],
          ranges: [
            { from: 'serialFrom', to: 'serialTo', bounds: '[]' },
            { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' }
          ]
        }
      ]
    } as EntityMetadataOptions);
    const { name } = constraintOf(metadata);
    const database = await openTable(metadata);
    const day = (month: number, date: number): string => `'${new Date(Date.UTC(2026, month - 1, date)).toISOString()}'`;
    const insert = ([from, to]: Span, effectiveFrom: string, effectiveTo: string) =>
      outcomeOf(
        database,
        `INSERT INTO ${tableOf(metadata)} ("lineId", "serialFrom", "serialTo", "effectiveFrom", "effectiveTo") ` +
          `VALUES ('W', ${literal(from)}, ${literal(to)}, ${effectiveFrom}, ${effectiveTo})`
      );

    expect(insert([0n, MAX], day(1, 1), day(2, 1))).toBe('ok');
    // 序列维在最大值上相交，日期 [) 维首尾相接不相交 → 放行
    expect(insert([MAX, MAX], day(2, 1), day(3, 1))).toBe('ok');
    // 两维都相交 → 拒绝
    expect(insert([MAX, MAX], day(1, 15), day(1, 20))).toBe(name);
    // 序列维与第二行不相交、日期维与第一行不相交 → 放行
    expect(insert([0n, 9n], day(2, 15), day(2, 20))).toBe('ok');
    // 日期全无界：与第一行两维都相交 → 拒绝
    expect(insert([MAX - 1n, MAX], 'NULL', 'NULL')).toBe(name);
  });
});

@Entity({
  name: 'SerialLedger',
  log: false,
  properties: [
    { name: 'lineId', type: PropertyType.string },
    { name: 'serialFrom', type: PropertyType.bigint, nullable: true },
    { name: 'serialTo', type: PropertyType.bigint, nullable: true }
  ],
  exclusions: [
    { name: 'serial_no_overlap', equal: ['lineId'], ranges: [{ from: 'serialFrom', to: 'serialTo', bounds: '[]' }] }
  ]
})
class SerialLedger extends EntityBase {
  lineId!: string;
  serialFrom!: bigint | null;
  serialTo!: bigint | null;
}

/** 0.0.28 起这条排他的规范化定义：PG 表达式还没有最大值分支。 */
const LEGACY_NAME = `ex_SerialLedger_serial_no_overlap_${hashConstraintDefinition(
  `["public","SerialLedger"] EXCLUDE ("lineId" WITH =, ` +
    `(CASE WHEN "serialFrom" > "serialTo" THEN 'empty'::int8range ELSE int8range("serialFrom", "serialTo", '[]') END) WITH &&)`
)}`;

/** 漂移检查的查询门面：在真实库上执行，按原生结果的形状交回。 */
const catalogOf = (database: RealSqliteDatabase) => ({
  execute: async (sql: string, bindings: unknown[] = []): Promise<SqliteResult> => ({
    sql,
    rowsAffected: 0,
    elapsed: 0,
    results: [{ columns: [], rows: database.all(sql, bindings) as SQLiteCompatibleType[][] }]
  })
});

/** 迁移说明的 SQLite 一步：取旧触发器原文、删掉，把原文里的旧约束名换成新名后重建。 */
const renameExclusionTriggersSqlite = (database: RealSqliteDatabase, name: string): void => {
  for (const trigger of exclusionTriggerNames(LEGACY_NAME)) {
    const [[sql]] = database.all(`SELECT sql FROM sqlite_master WHERE type = 'trigger' AND name = ?`, [trigger]);
    database.exec(`DROP TRIGGER ${quote_sql_identifier(trigger)}`);
    database.exec(String(sql).replaceAll(LEGACY_NAME, name));
  }
};

const triggerSqlOf = (database: RealSqliteDatabase): unknown[][] =>
  database.all(`SELECT name, sql FROM sqlite_master WHERE type = 'trigger' ORDER BY name`);

describe('bigint 区间排他换名的迁移（RV-01a1bbb3b74e）', () => {
  it('旧名触发器报漂移；换名重建后漂移消失、与新建库逐字相同，最大值违约照常归一', async () => {
    const metadata = getEntityMetadata(SerialLedger);
    const exclusion = compileExclusionConstraint(metadata, metadata.exclusionMap.get('serial_no_overlap')!);
    expect(exclusion.name).not.toBe(LEGACY_NAME);
    const fresh = await openTable(metadata);
    const database = await openTable(metadata);

    // 还原成 0.0.28 起建出的库：触发器生成器此后只多了表集参数（主表集逐字相同），差的只是约束名
    for (const trigger of exclusionTriggerNames(exclusion.name)) {
      database.exec(`DROP TRIGGER ${quote_sql_identifier(trigger)}`);
    }
    database.exec(exclusion_trigger_sql(metadata, { ...exclusion, name: LEGACY_NAME }, WorktreeTableSet.MAIN));

    const drift = await check_entity_constraints_sqlite(catalogOf(database), WorktreeTableSet.MAIN, [
      SerialLedger
    ]).catch((error: unknown) => error);
    expect(drift).toBeInstanceOf(RxDBConstraintDriftError);
    expect((drift as RxDBConstraintDriftError).missing).toEqual([...exclusionTriggerNames(exclusion.name)]);
    expect((drift as RxDBConstraintDriftError).extra).toEqual([...exclusionTriggerNames(LEGACY_NAME)]);

    renameExclusionTriggersSqlite(database, exclusion.name);
    await expect(
      check_entity_constraints_sqlite(catalogOf(database), WorktreeTableSet.MAIN, [SerialLedger])
    ).resolves.toBeUndefined();
    expect(triggerSqlOf(database)).toEqual(triggerSqlOf(fresh));

    const insert = ([from, to]: Span): string =>
      `INSERT INTO ${tableOf(metadata)} ("createdAt", "updatedAt", "lineId", "serialFrom", "serialTo") ` +
      `VALUES ('2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', 'L', ${literal(from)}, ${literal(to)})`;
    database.exec(insert([0n, MAX]));
    const violation = toExclusionViolationError(attempt(database, insert([MAX, MAX])), metadata);
    expect(violation).toBeInstanceOf(RxDBExclusionViolationError);
    expect((violation as RxDBExclusionViolationError).constraint).toBe(exclusion.name);
    expect((violation as RxDBExclusionViolationError).ranges).toEqual([
      { from: 'serialFrom', to: 'serialTo', bounds: '[]', incoming: [MAX, MAX], existing: [0n, MAX] }
    ]);
  });
});
