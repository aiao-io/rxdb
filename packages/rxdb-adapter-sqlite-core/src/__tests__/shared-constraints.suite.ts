/**
 * @fileoverview 声明式存储约束的共享套件（US-030 阶段 A / B / C）
 *
 * 由各 SQLite 宿主（wa-sqlite / sqlite / sqliteai 等）经 `AdapterFactory` 参数化执行，
 * 断言只依赖适配器契约，不依赖具体宿主。覆盖：属性级与实体级 CHECK（AC#1/#2/#8）、
 * 条件唯一索引（AC#3）、区间排他（AC#4/#12/#13）、漂移检查（AC#10/#11/#16）。
 */

import {
  compileCheckConstraint,
  Entity,
  EntityBase,
  EntityMetadataOptions,
  expectedStorageConstraintObjects,
  getEntityMetadata,
  MigrationType,
  PropertyType,
  RxDBConstraintDriftError,
  RxDBCheckViolationError,
  RxDBExclusionViolationError,
  SwitchVersionActions
} from '@aiao/rxdb';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { RxDBAdapterSqliteBase } from '../RxDBAdapterSqliteBase.js';
import { execute_switch_actions } from '../version/execute_switch_actions.js';
import { convertSwitchResultToSql } from '../version/switch-result.utils.js';
import type { AdapterFactory } from './adapter-factory.js';

// -- 测试实体 --

@Entity({
  name: 'CkItem',
  properties: [
    { name: 'qty', type: PropertyType.string, nullable: true, check: { operator: 'notNull' } },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  checks: [{ name: 'unit_range', rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] } }]
})
class CkItem extends EntityBase {
  qty!: string | null;
  unitFrom!: number | null;
  unitTo!: number | null;
}

@Entity({
  name: 'CkReleased',
  properties: [
    { name: 'state', type: PropertyType.enum, enum: ['released', 'draft'] },
    { name: 'itemId', type: PropertyType.string },
    { name: 'effectiveFrom', type: PropertyType.date }
  ],
  indexes: [
    {
      name: 'released_effective_from',
      properties: ['itemId', 'effectiveFrom'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ]
})
class CkReleased extends EntityBase {
  state!: 'released' | 'draft';
  itemId!: string;
  effectiveFrom!: Date;
}

const ckRangeOptions: EntityMetadataOptions = {
  name: 'CkRange',
  properties: [
    { name: 'groupId', type: PropertyType.string },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true },
    { name: 'unitFrom', type: PropertyType.integer, nullable: true },
    { name: 'unitTo', type: PropertyType.integer, nullable: true }
  ],
  exclusions: [
    {
      name: 'occurrence_no_overlap',
      equal: ['groupId'],
      ranges: [
        { from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' },
        { from: 'unitFrom', to: 'unitTo', bounds: '[]' }
      ]
    }
  ]
};

@Entity(ckRangeOptions)
class CkRange extends EntityBase {
  groupId!: string;
  effectiveFrom!: Date | null;
  effectiveTo!: Date | null;
  unitFrom!: number | null;
  unitTo!: number | null;
}

const day = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/** SQLite 版本数值比较（major.minor.patch）。 */
const compareSqliteVersions = (actual: string, required: string): number => {
  const parse = (version: string): number[] =>
    version
      .split(/[^0-9]+/)
      .filter(part => part.length > 0)
      .map(Number)
      .concat([0, 0, 0])
      .slice(0, 3);
  const a = parse(actual);
  const b = parse(required);
  for (let index = 0; index < 3; index++) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
};

/** 声明式存储约束集成测试：CHECK / 条件唯一 / 区间排他 / 漂移。 */
export function constraintSuite(factory: AdapterFactory) {
  describe(`声明式存储约束 [${factory.name}]`, () => {
    let adapter: RxDBAdapterSqliteBase;

    beforeAll(async () => {
      adapter = await factory.createAdapter<RxDBAdapterSqliteBase>({ entities: [CkItem, CkReleased, CkRange] });
    });

    afterAll(async () => {
      if (adapter) {
        await adapter.rxdb.disconnectAll();
      }
    });

    describe('CHECK（AC#1 / #2 / #8）', () => {
      it('属性级 check：写入越界值被拒，归一为 RxDBCheckViolationError 且点名约束', async () => {
        const item = new CkItem();
        item.qty = null;
        const error = await item.save().then(
          () => null,
          (cause: unknown) => cause
        );
        expect(error).toBeInstanceOf(RxDBCheckViolationError);
        expect((error as RxDBCheckViolationError).constraintName).toMatch(/^ck_.*_qty_[0-9a-f]{8}$/);
      });

      it('实体级 ref 比较：unitFrom > unitTo 被拒', async () => {
        const item = new CkItem();
        item.qty = '1';
        item.unitFrom = 5;
        item.unitTo = 3;
        const error = await item.save().then(
          () => null,
          (cause: unknown) => cause
        );
        expect(error).toBeInstanceOf(RxDBCheckViolationError);
        expect((error as RxDBCheckViolationError).constraintName).toContain('unit_range');
      });

      it('SQL 三值逻辑：unitFrom 为 NULL 时放行（AC#8）', async () => {
        const item = new CkItem();
        item.qty = '1';
        item.unitFrom = null;
        item.unitTo = 3;
        await expect(item.save()).resolves.toBeDefined();
      });
    });

    describe('条件唯一索引（AC#3）', () => {
      it('不满足 where 的重复行不被唯一约束误拒', async () => {
        const first = new CkReleased();
        first.state = 'draft';
        first.itemId = 'same';
        first.effectiveFrom = day('2026-01-01');
        await first.save();
        const second = new CkReleased();
        second.state = 'draft';
        second.itemId = 'same';
        second.effectiveFrom = day('2026-01-01');
        await expect(second.save()).resolves.toBeDefined();
      });

      it('满足 where 的重复行被拒', async () => {
        const first = new CkReleased();
        first.state = 'released';
        first.itemId = 'same-released';
        first.effectiveFrom = day('2026-02-01');
        await first.save();
        const second = new CkReleased();
        second.state = 'released';
        second.itemId = 'same-released';
        second.effectiveFrom = day('2026-02-01');
        await expect(second.save()).rejects.toThrow();
      });
    });

    describe('区间排他（AC#4 / #12 / #13）', () => {
      const makeRange = (groupId: string) => {
        const range = new CkRange();
        range.groupId = groupId;
        return range;
      };

      it('重叠区间插入被拒，归一为 RxDBExclusionViolationError', async () => {
        const first = makeRange('g-overlap');
        first.effectiveFrom = day('2026-01-01');
        first.effectiveTo = day('2026-03-01');
        await first.save();

        const second = makeRange('g-overlap');
        second.effectiveFrom = day('2026-02-01');
        second.effectiveTo = null;
        const error = await second.save().then(
          () => null,
          (cause: unknown) => cause
        );
        expect(error).toBeInstanceOf(RxDBExclusionViolationError);
        expect((error as RxDBExclusionViolationError).constraintName).toContain('occurrence_no_overlap');
      });

      it('半开区间相邻不冲突', async () => {
        const first = makeRange('g-adjacent');
        first.effectiveFrom = day('2026-01-01');
        first.effectiveTo = day('2026-03-01');
        await first.save();

        const second = makeRange('g-adjacent');
        second.effectiveFrom = day('2026-03-01');
        second.effectiveTo = null;
        await expect(second.save()).resolves.toBeDefined();
      });

      it('端点 NULL 即无界：起点为 NULL 与已有行冲突', async () => {
        const first = makeRange('g-null-bound');
        first.effectiveFrom = day('2026-01-01');
        first.effectiveTo = day('2026-03-01');
        await first.save();

        const second = makeRange('g-null-bound');
        second.effectiveFrom = null;
        second.effectiveTo = day('2026-02-01');
        await expect(second.save()).rejects.toBeInstanceOf(RxDBExclusionViolationError);
      });

      it('两维同时相交才冲突：日期相交但整数维不相交时放行（AC#13）', async () => {
        const first = makeRange('g-two-dims');
        first.effectiveFrom = day('2026-01-01');
        first.effectiveTo = day('2026-06-01');
        first.unitFrom = 100;
        first.unitTo = 200;
        await first.save();

        const disjointInteger = makeRange('g-two-dims');
        disjointInteger.effectiveFrom = day('2026-02-01');
        disjointInteger.effectiveTo = day('2026-07-01');
        disjointInteger.unitFrom = 201;
        disjointInteger.unitTo = 300;
        await expect(disjointInteger.save()).resolves.toBeDefined();

        const bothIntersect = makeRange('g-two-dims');
        bothIntersect.effectiveFrom = day('2026-02-01');
        bothIntersect.effectiveTo = day('2026-07-01');
        bothIntersect.unitFrom = 150;
        bothIntersect.unitTo = 300;
        await expect(bothIntersect.save()).rejects.toBeInstanceOf(RxDBExclusionViolationError);
      });

      it('全闭整数维相邻（136 / 137）放行', async () => {
        const first = makeRange('g-int-adjacent');
        first.unitFrom = 0;
        first.unitTo = 136;
        await first.save();

        const second = makeRange('g-int-adjacent');
        second.unitFrom = 137;
        second.unitTo = 200;
        await expect(second.save()).resolves.toBeDefined();
      });

      it('UPDATE 扩成重叠被拒、自身范围内扩区间放行（AC#12）', async () => {
        const first = makeRange('g-update');
        first.effectiveFrom = day('2026-01-01');
        first.effectiveTo = day('2026-03-01');
        await first.save();
        const second = makeRange('g-update');
        second.effectiveFrom = day('2026-05-01');
        second.effectiveTo = day('2026-06-01');
        await second.save();

        // 自身范围内扩区间：不与自身旧值比，放行
        second.effectiveFrom = day('2026-05-10');
        await expect(second.save()).resolves.toBeDefined();

        // 扩成与 first 重叠：拒绝
        second.effectiveFrom = day('2026-02-01');
        await expect(second.save()).rejects.toBeInstanceOf(RxDBExclusionViolationError);
      });

      it('「截止旧行 + 新开一行」的切换重放不被排他误拒（AC#14）', async () => {
        const old = makeRange('g-replay');
        old.effectiveFrom = day('2026-01-01');
        old.effectiveTo = null;
        await old.save();

        // 同一逻辑行的「截止旧行 + 新开一行」重放：旧行截到 10-01，新行自 10-01 起
        const newId = `replay-new-${Math.random().toString(36).slice(2, 10)}`;
        const actions: SwitchVersionActions = {
          deletes: new Map(),
          updates: new Map([
            [
              `public:CkRange:${old.id}`,
              { patch: { effectiveTo: day('2026-10-01') }, inversePatch: { effectiveTo: null } }
            ]
          ]),
          inserts: new Map([
            [
              `public:CkRange:${newId}`,
              {
                patch: {
                  groupId: 'g-replay',
                  effectiveFrom: day('2026-10-01'),
                  effectiveTo: null,
                  unitFrom: null,
                  unitTo: null
                },
                inversePatch: null
              }
            ]
          ])
        };
        const sqlResult = await convertSwitchResultToSql(adapter, actions);
        await expect(execute_switch_actions(adapter, sqlResult)).resolves.toBeUndefined();

        // 最终态与直接写入一致：两行相邻、无重叠、无空窗
        const rows = (await adapter.rawQuery(
          `SELECT effectiveFrom, effectiveTo FROM "public$CkRange" WHERE groupId = 'g-replay' ORDER BY effectiveFrom`
        )) as unknown as { rows: [string, string | null][] };
        expect(rows.rows).toEqual([
          ['2026-01-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z'],
          ['2026-10-01T00:00:00.000Z', null]
        ]);
      });
    });

    describe('漂移检查（AC#10 / #16）', () => {
      @Entity({
        name: 'CkDrift',
        properties: [{ name: 'qty', type: PropertyType.string, nullable: true }]
      })
      class CkDriftOld extends EntityBase {
        qty!: string | null;
      }

      @Entity({
        name: 'CkDrift',
        properties: [{ name: 'qty', type: PropertyType.string, nullable: true, check: { operator: 'notNull' } }]
      })
      class CkDriftNew extends EntityBase {
        qty!: string | null;
      }

      const driftDbName = `ck-drift-${Math.random().toString(36).slice(2, 10)}`;

      it('既有表与声明不一致时抛 RxDBConstraintDriftError，列出缺失名、不自动补建', async () => {
        // 「老库」：无约束声明建表。persistent=true 让重连同名库命中同一份 IndexedDB 存储
        const oldAdapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
          entities: [CkDriftOld],
          dbName: driftDbName,
          persistent: true
        });
        await oldAdapter.rxdb.disconnectAll();

        // 「升级声明」后重连同一库：漂移检查必须在 init() 报错
        const newAdapter = await factory
          .createAdapter<RxDBAdapterSqliteBase>({ entities: [CkDriftNew], dbName: driftDbName, persistent: true })
          .then(() => null, (cause: unknown) => cause);
        expect(newAdapter).toBeInstanceOf(RxDBConstraintDriftError);
        const drift = newAdapter as RxDBConstraintDriftError;
        const expected = expectedStorageConstraintObjects(getEntityMetadata(CkDriftNew)).constraints;
        expect(drift.missing).toEqual(expect.arrayContaining(expected));
        expect(drift.extra).toEqual([]);
      });

      it('用户迁移补上约束后再 init() 通过（AC#10 的修复路径）', async () => {
        // 原生 `ALTER TABLE ADD CONSTRAINT` 需要 SQLite ≥ 3.53（US-030 技术笔记）：
        // 低版本宿主的补建走官方「12 步」重建表，本套件只在支持原生 ALTER 的宿主上验证
        if (compareSqliteVersions(await adapter.version(), '3.53.0') < 0) return;
        const metadata = getEntityMetadata(CkDriftNew);
        const { name, sql } = compileCheckConstraint(metadata, Array.from(metadata.checkMap.values())[0]);
        const migration: MigrationType = {
          name: 'ck-drift-add-check',
          up: async executor => {
            await executor.query(`ALTER TABLE "public$CkDrift" ADD CONSTRAINT "${name}" CHECK ${sql}`);
          }
        };
        const fixedAdapter = await factory.createAdapter<RxDBAdapterSqliteBase>({
          entities: [CkDriftNew],
          dbName: driftDbName,
          persistent: true,
          migrations: [migration]
        });
        expect(fixedAdapter).toBeDefined();
        await fixedAdapter.rxdb.disconnectAll();
      });

      it('外键、idx_ 普通索引与系统触发器不进比对（AC#16）', async () => {
        // 同一份声明重连不报漂移：库里除声明内的约束对象外只有 FK / idx_ / 系统触发器，
        // 它们不在比对范围。独立库名——本用例的实体清单与漂移库不同，避免把「另一张表
        // 上的 ck_」误判成多余对象
        const again = await factory.createAdapter<RxDBAdapterSqliteBase>({
          entities: [CkItem, CkReleased, CkRange],
          dbName: `ck-clean-${Math.random().toString(36).slice(2, 10)}`
        });
        expect(again).toBeDefined();
        await again.rxdb.disconnectAll();
      });
    });
  });
}
