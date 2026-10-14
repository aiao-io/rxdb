/**
 * @fileoverview 存储约束漂移比对共享核心的测试（US-030）。
 *
 * - 期望名字集合：`ck_` / `uq_` / `ex_` 三类各自由元数据确定性生成；
 * - 比对范围：只认三类前缀（AC#16）；
 * - `declaresStorageConstraints`：能力判定（AC#6）与 SQLite 版本门槛（AC#7）的共同口径；
 * - 差集与抛错：缺失 / 多余分别列出，表缺失单独点名（AC#10）。
 */

import { describe, expect, it } from 'vitest';
import { EntityMetadataOptions, PropertyType } from '../../entity/metadata-options.interface.js';
import { transitionMetadata } from '../../entity/metadata-transition.js';
import { RxDBConstraintDriftError } from '../../RxDBError.js';
import {
  assertNoEntityConstraintDrift,
  declaresStorageConstraints,
  expectedCheckConstraintNames,
  expectedConditionalUniqueIndexNames,
  expectedExclusionConstraintNames,
  inDriftScope
} from '../../system/constraint-drift.js';

const metadataOf = (overrides: Partial<EntityMetadataOptions>) =>
  transitionMetadata({
    name: 'Drift' as Capitalize<string>,
    namespace: 'public',
    properties: [
      { name: 'id', type: PropertyType.string, primary: true },
      { name: 'code', type: PropertyType.string },
      { name: 'state', type: PropertyType.string },
      { name: 'unitFrom', type: PropertyType.integer, nullable: true },
      { name: 'unitTo', type: PropertyType.integer, nullable: true }
    ],
    computedProperties: [],
    relations: [],
    indexes: [],
    ...overrides
  } as EntityMetadataOptions);

const all = metadataOf({
  checks: [
    { name: 'unit_order', rule: { combinator: 'and', rules: [{ field: 'unitFrom', operator: '<=', ref: 'unitTo' }] } }
  ],
  indexes: [
    { name: 'plain_code', properties: ['code'] },
    {
      name: 'released_code',
      properties: ['code'],
      unique: true,
      where: { combinator: 'and', rules: [{ field: 'state', operator: '=', value: 'released' }] }
    }
  ],
  exclusions: [{ name: 'no_overlap', equal: ['code'], ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[]' }] }]
});

describe('期望名字集合', () => {
  it('三类各自生成，普通 idx_ 索引不在其中', () => {
    expect(expectedCheckConstraintNames(all)).toEqual([expect.stringMatching(/^ck_Drift_unit_order_[0-9a-f]{8}$/)]);
    expect(expectedConditionalUniqueIndexNames(all)).toEqual([
      expect.stringMatching(/^uq_Drift_released_code_[0-9a-f]{8}$/)
    ]);
    expect(expectedExclusionConstraintNames(all)).toEqual([expect.stringMatching(/^ex_Drift_no_overlap_[0-9a-f]{8}$/)]);
  });
});

describe('inDriftScope', () => {
  it.each([
    ['ck_Drift_x_00000000', true],
    ['uq_Drift_x_00000000', true],
    ['ex_Drift_x_00000000_i', true],
    ['idx_Drift_code', false],
    ['Drift_insert', false],
    ['fk_parent', false]
  ])('%s → %s', (name, expected) => {
    expect(inDriftScope(name)).toBe(expected);
  });
});

describe('declaresStorageConstraints', () => {
  it('CHECK / 条件唯一 / 区间排他任一项即算；普通索引不算', () => {
    expect(declaresStorageConstraints(all)).toBe(true);
    expect(
      declaresStorageConstraints(metadataOf({ indexes: [{ name: 'plain_code', properties: ['code'], unique: true }] }))
    ).toBe(false);
    expect(
      declaresStorageConstraints(
        metadataOf({
          exclusions: [{ name: 'only_ex', equal: ['code'], ranges: [{ from: 'unitFrom', to: 'unitTo', bounds: '[)' }] }]
        })
      )
    ).toBe(true);
    expect(
      declaresStorageConstraints(
        metadataOf({
          indexes: [
            {
              name: 'only_uq',
              properties: ['code'],
              unique: true,
              where: { combinator: 'and', rules: [{ field: 'state', operator: 'notNull' }] }
            }
          ]
        })
      )
    ).toBe(true);
  });
});

describe('assertNoEntityConstraintDrift', () => {
  const report = (expected: string[], actual: string[], tableMissing = false) => ({
    entity: 'Drift',
    tableName: 'Drift',
    tableMissing,
    expected,
    actual
  });

  it('集合一致即通过', () => {
    expect(() => assertNoEntityConstraintDrift(report(['uq_a', 'ex_b_i'], ['ex_b_i', 'uq_a']))).not.toThrow();
  });

  it('缺失与多余分别排序列出（AC#10）', () => {
    try {
      assertNoEntityConstraintDrift(report(['uq_new', 'ex_b_i', 'ex_b_u'], ['ex_b_i', 'uq_old']));
      expect.unreachable('应当报漂移');
    } catch (error) {
      expect(error).toBeInstanceOf(RxDBConstraintDriftError);
      const drift = error as RxDBConstraintDriftError;
      expect(drift.missing).toEqual(['ex_b_u', 'uq_new']);
      expect(drift.extra).toEqual(['uq_old']);
    }
  });

  it('表缺失单独点名', () => {
    expect(() => assertNoEntityConstraintDrift(report(['ex_b_i'], [], true))).toThrow(
      /missing from the database catalog/
    );
  });
});
