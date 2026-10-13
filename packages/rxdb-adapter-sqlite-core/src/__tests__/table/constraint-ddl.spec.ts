/**
 * @fileoverview 区间排他触发器与漂移检查的纯函数单测（sqlite-core 自身覆盖率）。
 */

import { Entity, EntityBase, getEntityMetadata, PropertyType, RxDBConstraintDriftError } from '@aiao/rxdb';
import { describe, expect, it } from 'vitest';
import { buildExclusionTriggersSql } from '../../table/build-exclusion-triggers.js';
import { checkSqliteConstraintDrift, type SqliteDriftQueryExecutor } from '../../table/constraint-drift.js';

@Entity({
  name: 'CkRangeUnit',
  namespace: 'bom',
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
})
class CkRangeUnit extends EntityBase {}

@Entity({
  name: 'CkDriftUnit',
  namespace: 'bom',
  properties: [{ name: 'qty', type: PropertyType.string, nullable: true, check: { operator: 'notNull' } }]
})
class CkDriftUnit extends EntityBase {}

describe('buildExclusionTriggersSql', () => {
  it('每条排他生成 _i / _u 双触发器，UPDATE 排除自身', () => {
    const sql = buildExclusionTriggersSql(getEntityMetadata(CkRangeUnit));
    expect(sql).toContain('CREATE TRIGGER IF NOT EXISTS');
    expect(sql).toContain('_occurrence_no_overlap_');
    expect(sql).toContain('_i"');
    expect(sql).toContain('_u"');
    expect(sql).toContain('BEFORE INSERT');
    expect(sql).toContain('BEFORE UPDATE');
    expect(sql).toContain('existing."id" <> NEW."id"');
    expect(sql).toContain("'rxdb:exclusion_violation:'");
  });

  it('半开区间相邻用严格大于、全闭区间用 >=', () => {
    const sql = buildExclusionTriggersSql(getEntityMetadata(CkRangeUnit));
    expect(sql).toContain('existing."effectiveTo" > NEW."effectiveFrom"');
    expect(sql).toContain('existing."unitTo" >= NEW."unitFrom"');
  });

  it('无排他声明返回空串', () => {
    expect(buildExclusionTriggersSql(getEntityMetadata(CkDriftUnit))).toBe('');
  });
});

/** 应答式的漂移检查替身：按查询文本返回 sqlite_master 形状。 */
const driftExecutor = (overrides: Partial<Record<string, unknown[][]>> = {}): SqliteDriftQueryExecutor => ({
  query: async sql => ({
    columns: String(sql).includes('SELECT sql') ? ['sql'] : ['name'],
    rows: overrides[String(sql)] ?? []
  })
});

describe('checkSqliteConstraintDrift', () => {
  it('库里什么都没有时上报缺失的 ck_ / ex_ 对象', async () => {
    const executor = driftExecutor();
    const cause = await checkSqliteConstraintDrift(executor, [CkRangeUnit, CkDriftUnit]).then(
      () => null,
      (error: unknown) => error
    );
    expect(cause).toBeInstanceOf(RxDBConstraintDriftError);
    const drift = cause as RxDBConstraintDriftError;
    expect(drift.missing.some(name => name.startsWith('ck_bom$CkDriftUnit_qty_'))).toBe(true);
    expect(drift.missing.some(name => name.includes('occurrence_no_overlap'))).toBe(true);
    expect(drift.extra).toEqual([]);
  });

  it('多余对象（uq_/ex_ 前缀）被点名', async () => {
    const executor = driftExecutor({
      [`SELECT name FROM sqlite_master WHERE type = 'index' AND substr(name, 1, 3) = 'uq_'`]: [['uq_bom$ghost_stale_ab12cd34']],
      [`SELECT name FROM sqlite_master WHERE type = 'trigger' AND substr(name, 1, 3) = 'ex_'`]: [['ex_bom$ghost_stale_ab12cd34_i']]
    });
    const cause = await checkSqliteConstraintDrift(executor, [CkDriftUnit]).then(
      () => null,
      (error: unknown) => error
    );
    expect(cause).toBeInstanceOf(RxDBConstraintDriftError);
    expect((cause as RxDBConstraintDriftError).extra).toContain('uq_bom$ghost_stale_ab12cd34');
    expect((cause as RxDBConstraintDriftError).extra).toContain('ex_bom$ghost_stale_ab12cd34_i');
  });
});
