/**
 * @fileoverview bigint 区间排他在 int8 最大值端点上的真实 SQL 回归（RV-01a1bbb3b74e）。
 *
 * 建表 DDL 由 `create_table_sql` 生成，在真实内存 PGlite（装载 `btree_gist`）上执行：
 * - `[]` 维上端点取 int8 最大值的行可写，不再在范围规范化（上界加一）时抛 `22003`；与它相交的行照常报
 *   `23P01`，相邻区间放行；
 * - 端点矩阵（NULL 无界、倒置区间、最大值）逐对与参照语义比对，`[]` 与 `[)` 两种边界；SQLite family 的
 *   同名用例（sqlite-core `create_table_exclusion_bigint.spec.ts`）比的是同一份参照；
 * - 多维组合：bigint `[]` 维 + 日期 `[)` 维全部相交才冲突；
 * - 换名迁移：0.0.28 起按旧表达式建过的库漂移检查报换名；删旧约束、按新名重建后通过，违约照常归一。
 */

import {
  compileExclusionConstraint,
  Entity,
  EntityBase,
  exclusionRangeExpressionPG,
  getEntityMetadata,
  hashConstraintDefinition,
  PropertyType,
  RxDB,
  RxDBConstraintDriftError,
  RxDBExclusionViolationError,
  SyncType,
  transitionMetadata,
  WorktreeTableSet,
  type EntityMetadata,
  type EntityMetadataOptions,
  type ExclusionBounds,
  type TransactionExecutor
} from '@aiao/rxdb';
import { afterEach, describe, expect, it } from 'vitest';
import { PGliteClient } from '../../PGliteClient.js';
import { RxDBAdapterPGlite } from '../../RxDBAdapterPGlite.js';
import create_table_sql from '../../table/create_table_sql.js';

const MAX = 9223372036854775807n;
const MIN = -9223372036854775808n;

/** 一维区间的两个端点，`null` 即该侧无界。 */
type Span = readonly [bigint | null, bigint | null];

const adapterStub = {
  rxdb: { schemaManager: { getEntityMetadata: () => undefined } }
} as unknown as RxDBAdapterPGlite;

const clients = new Set<PGliteClient>();

afterEach(async () => {
  const pending = Array.from(clients);
  clients.clear();
  await Promise.all(pending.map(client => client.disconnect()));
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

const constraintNameOf = (metadata: EntityMetadata): string =>
  compileExclusionConstraint(metadata, [...metadata.exclusionMap.values()][0]).name;

const openTable = async (metadata: EntityMetadata): Promise<PGliteClient> => {
  const client = new PGliteClient({ btreeGist: true });
  await client.init(`pgl-exclusion-bigint-${Date.now()}-${clients.size}`, { store: 'memory' });
  clients.add(client);
  await client.exec('CREATE EXTENSION IF NOT EXISTS btree_gist');
  await client.exec(create_table_sql(adapterStub, metadata, WorktreeTableSet.MAIN));
  return client;
};

const literal = (value: bigint | string | null): string => (value === null ? 'NULL' : String(value));

/** 执行一条写入，返回 `ok` 或 SQLSTATE。 */
const outcomeOf = (client: PGliteClient, sql: string): Promise<string> =>
  client.query(sql).then(
    () => 'ok',
    (error: { code?: string }) => error.code ?? String(error)
  );

const insertSpan = (metadata: EntityMetadata, lineId: string, [from, to]: Span): string =>
  `INSERT INTO "public"."${metadata.tableName}" ("lineId", "serialFrom", "serialTo") ` +
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
  it('[] 维：[0, MAX] 可写，[MAX, MAX] 与它冲突报 23P01；相邻放行、单点重叠被拒；UPDATE 到最大值同样可写', async () => {
    const metadata = serialMetadata('SerialSlot', '[]');
    const client = await openTable(metadata);
    const insert = (lineId: string, span: Span) => outcomeOf(client, insertSpan(metadata, lineId, span));

    expect(await insert('A', [0n, MAX])).toBe('ok');
    await expect(client.query(insertSpan(metadata, 'A', [MAX, MAX]))).rejects.toMatchObject({
      code: '23P01',
      constraint: constraintNameOf(metadata)
    });

    // 相邻：[0, 10] 与 [11, MAX] 不相交
    expect(await insert('B', [0n, 10n])).toBe('ok');
    expect(await insert('B', [11n, MAX])).toBe('ok');
    // 单点重叠：[10, 10] 落在 [0, 10]，[MAX, MAX] 与 [MAX, ∞) 落在 [11, MAX]
    expect(await insert('B', [10n, 10n])).toBe('23P01');
    expect(await insert('B', [MAX, MAX])).toBe('23P01');
    expect(await insert('B', [MAX, null])).toBe('23P01');
    // 不同相等键互不影响
    expect(await insert('C', [MAX, MAX])).toBe('ok');

    // UPDATE 路径同样经过区间表达式
    expect(await insert('D', [0n, 5n])).toBe('ok');
    expect(await outcomeOf(client, `UPDATE "public"."SerialSlot" SET "serialTo" = ${MAX} WHERE "lineId" = 'D'`)).toBe(
      'ok'
    );
  });

  it.each(['[]', '[)'] as const)(
    '%s 维：端点矩阵（NULL 无界、倒置、最大值）逐对与参照语义一致',
    async bounds => {
      const metadata = serialMetadata(bounds === '[]' ? 'SerialMatrixClosed' : 'SerialMatrixHalfOpen', bounds);
      const client = await openTable(metadata);
      const mismatches: string[] = [];
      for (const [index, [a, b]] of SPAN_PAIRS.entries()) {
        const first = await outcomeOf(client, insertSpan(metadata, `p${index}`, a));
        const second = await outcomeOf(client, insertSpan(metadata, `p${index}`, b));
        const expected = overlapsReference(bounds, a, b) ? '23P01' : 'ok';
        if (first !== 'ok' || second !== expected) {
          mismatches.push(`${formatSpan(a)} × ${formatSpan(b)}：${first} / ${second}，参照 ${expected}`);
        }
      }
      expect(mismatches).toEqual([]);
    },
    60_000
  );

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
    const client = await openTable(metadata);
    const day = (month: number, date: number): string => `'${new Date(Date.UTC(2026, month - 1, date)).toISOString()}'`;
    const insert = ([from, to]: Span, effectiveFrom: string, effectiveTo: string) =>
      outcomeOf(
        client,
        `INSERT INTO "public"."SerialWindow" ("lineId", "serialFrom", "serialTo", "effectiveFrom", "effectiveTo") ` +
          `VALUES ('W', ${literal(from)}, ${literal(to)}, ${effectiveFrom}, ${effectiveTo})`
      );

    expect(await insert([0n, MAX], day(1, 1), day(2, 1))).toBe('ok');
    // 序列维在最大值上相交，日期 [) 维首尾相接不相交 → 放行
    expect(await insert([MAX, MAX], day(2, 1), day(3, 1))).toBe('ok');
    // 两维都相交 → 拒绝
    expect(await insert([MAX, MAX], day(1, 15), day(1, 20))).toBe('23P01');
    // 序列维与第二行不相交、日期维与第一行不相交 → 放行
    expect(await insert([0n, 9n], day(2, 15), day(2, 20))).toBe('ok');
    // 日期全无界：与第一行两维都相交 → 拒绝
    expect(await insert([MAX - 1n, MAX], 'NULL', 'NULL')).toBe('23P01');
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

/** 0.0.28 起的建表语句里这条排他的元素：PG 表达式还没有最大值分支。 */
const LEGACY_ELEMENTS =
  `"lineId" WITH =, ` +
  `(CASE WHEN "serialFrom" > "serialTo" THEN 'empty'::int8range ELSE int8range("serialFrom", "serialTo", '[]') END) WITH &&`;

const LEGACY_NAME = `ex_SerialLedger_serial_no_overlap_${hashConstraintDefinition(
  `["public","SerialLedger"] EXCLUDE (${LEGACY_ELEMENTS})`
)}`;

/** 迁移说明的 PG 一步：删掉旧名的 `EXCLUDE` 约束，按新名与新表达式重建（元素顺序与建表一致）。 */
const rebuildExclusionPG = async (executor: TransactionExecutor): Promise<void> => {
  const metadata = getEntityMetadata(SerialLedger);
  const { name, equal, ranges } = compileExclusionConstraint(metadata, metadata.exclusionMap.get('serial_no_overlap')!);
  const elements = [
    ...equal.map(column => `"${column.column}" WITH =`),
    ...ranges.map(range => `${exclusionRangeExpressionPG(range)} WITH &&`)
  ];
  const table = executor.tableRef(SerialLedger);
  await executor.query(`ALTER TABLE ${table} DROP CONSTRAINT "${LEGACY_NAME}"`);
  await executor.query(`ALTER TABLE ${table} ADD CONSTRAINT "${name}" EXCLUDE USING gist (${elements.join(', ')})`);
};

describe('bigint 区间排他换名的迁移（RV-01a1bbb3b74e）', () => {
  it('旧名约束报漂移；删旧约束、按新名重建后漂移消失，最大值可写，违约照常归一', async () => {
    let adapter: RxDBAdapterPGlite | undefined;
    const rxdb = new RxDB({
      dbName: `pgl-exclusion-bigint-migration-${Date.now()}`,
      context: { userId: 'userId' },
      entities: [SerialLedger],
      sync: { local: { adapter: 'pglite' }, type: SyncType.None }
    });
    rxdb.adapter('pglite', async database => {
      adapter = new RxDBAdapterPGlite(database, { store: 'memory' });
      return adapter;
    });
    await rxdb.connect('pglite');
    try {
      if (!adapter) throw new Error('adapter not created');
      const metadata = getEntityMetadata(SerialLedger);
      const { name } = compileExclusionConstraint(metadata, metadata.exclusionMap.get('serial_no_overlap')!);
      expect(name).not.toBe(LEGACY_NAME);

      // 还原成 0.0.28 起建出的库：同一条排他，旧名、旧表达式
      await adapter.query(`ALTER TABLE "public"."SerialLedger" DROP CONSTRAINT "${name}"`);
      await adapter.query(
        `ALTER TABLE "public"."SerialLedger" ADD CONSTRAINT "${LEGACY_NAME}" EXCLUDE USING gist (${LEGACY_ELEMENTS})`
      );
      // 旧表达式就是本缺陷：最大值上端点在规范化时溢出
      await expect(
        adapter.query(
          `INSERT INTO "public"."SerialLedger" ("id", "createdAt", "updatedAt", "lineId", "serialFrom", "serialTo") ` +
            `VALUES (gen_random_uuid(), now(), now(), 'legacy', 0, ${MAX})`
        )
      ).rejects.toMatchObject({ code: '22003' });

      const drift = await adapter.checkEntityConstraints([SerialLedger]).catch((error: unknown) => error);
      expect(drift).toBeInstanceOf(RxDBConstraintDriftError);
      expect((drift as RxDBConstraintDriftError).missing).toEqual([name]);
      expect((drift as RxDBConstraintDriftError).extra).toEqual([LEGACY_NAME]);

      await adapter.transaction(rebuildExclusionPG);
      await expect(adapter.checkEntityConstraints([SerialLedger])).resolves.toBeUndefined();

      await rxdb.entityManager.save(new SerialLedger({ lineId: 'L', serialFrom: 0n, serialTo: MAX }));
      const error = await rxdb.entityManager
        .save(new SerialLedger({ lineId: 'L', serialFrom: MAX, serialTo: MAX }))
        .catch((cause: unknown) => cause);
      expect(error).toBeInstanceOf(RxDBExclusionViolationError);
      expect((error as RxDBExclusionViolationError).constraint).toBe(name);
      // PG 冲突键里「上端点 = 最大值」与上方无界同形（同一组取值），这一端报 null
      expect((error as RxDBExclusionViolationError).ranges).toEqual([
        { from: 'serialFrom', to: 'serialTo', bounds: '[]', incoming: [MAX, null], existing: [0n, null] }
      ]);
    } finally {
      await rxdb.disconnectAll().catch(() => undefined);
    }
  });
});
