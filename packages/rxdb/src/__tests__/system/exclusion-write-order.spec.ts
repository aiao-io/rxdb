/**
 * @fileoverview 声明了区间排他的实体在批量写入与切换重放里的执行顺序（US-030 AC#14）。
 *
 * - 收窄判定：相等列不变、每一维只缩不扩（NULL 端点即无界），没碰排他列的更新不算收窄；
 * - 更新排序：收窄类在前，其余保持原相对顺序；没有区间排他的实体顺序不变；
 * - 批量写入计划：排他实体的删除与更新提到全部插入之前，同一批既被创建又被更新 / 删除的实例不提前。
 */

import { describe, expect, it } from 'vitest';
import { Entity, EntityBase, PropertyType, SyncType, type EntityType, type RxDBMutationsMap } from '../../index.js';
import { getEntityMetadata } from '../../rxdb-utils.js';
import { RxDB } from '../../RxDB.js';
import {
  isExclusionNarrowingUpdate,
  orderExclusionUpdates,
  ordersWritesForExclusion,
  planMutationWrites
} from '../../system/exclusion-write-order.js';

@Entity({
  name: 'WriteOrderOccurrence',
  namespace: 'write-order',
  log: false,
  properties: [
    { name: 'lineId', type: PropertyType.string },
    { name: 'note', type: PropertyType.string, nullable: true },
    { name: 'effectiveFrom', type: PropertyType.date, nullable: true },
    { name: 'effectiveTo', type: PropertyType.date, nullable: true }
  ],
  exclusions: [
    { name: 'no_overlap', equal: ['lineId'], ranges: [{ from: 'effectiveFrom', to: 'effectiveTo', bounds: '[)' }] }
  ]
})
class WriteOrderOccurrence extends EntityBase {
  lineId!: string;
  note!: string | null;
  effectiveFrom!: Date | null;
  effectiveTo!: Date | null;
}

@Entity({
  name: 'WriteOrderPlain',
  namespace: 'write-order',
  log: false,
  properties: [{ name: 'title', type: PropertyType.string }]
})
class WriteOrderPlain extends EntityBase {
  title!: string;
}

const occurrence = getEntityMetadata(WriteOrderOccurrence);
const plain = getEntityMetadata(WriteOrderPlain);

// 只借它的 entityManager 造带状态的实体，不连接
const rxdb = new RxDB({
  dbName: 'exclusion-write-order',
  entities: [WriteOrderOccurrence, WriteOrderPlain],
  sync: { local: { adapter: 'local' }, type: SyncType.None }
});
rxdb.init();
const makeOccurrence = (): WriteOrderOccurrence => rxdb.entityManager.instantiate(WriteOrderOccurrence);
const makePlain = (): WriteOrderPlain => rxdb.entityManager.instantiate(WriteOrderPlain);
const day = (n: number): Date => new Date(Date.UTC(2026, 0, n));

describe('isExclusionNarrowingUpdate', () => {
  it.each([
    ['终点前移（截止旧行）', { effectiveTo: day(10) }, { effectiveTo: null }, true],
    ['起点后移', { effectiveFrom: day(5) }, { effectiveFrom: day(1) }, true],
    ['终点后移是扩张', { effectiveTo: day(20) }, { effectiveTo: day(10) }, false],
    ['终点改成 NULL（+∞）是扩张', { effectiveTo: null }, { effectiveTo: day(10) }, false],
    ['起点改成 NULL（−∞）是扩张', { effectiveFrom: null }, { effectiveFrom: day(1) }, false],
    ['换相等列不是收窄', { lineId: 'L2' }, { lineId: 'L1' }, false],
    ['相等列值不变照样算收窄', { lineId: 'L1', effectiveTo: day(3) }, { lineId: 'L1', effectiveTo: day(9) }, true],
    ['没碰排他列不算收窄', { note: 'x' }, { note: null }, false],
    ['旧值缺失无从判断', { effectiveTo: day(3) }, {}, false]
  ])('%s', (_label, patch, inversePatch, expected) => {
    expect(isExclusionNarrowingUpdate(occurrence, { patch, inversePatch })).toBe(expected);
  });
});

describe('orderExclusionUpdates', () => {
  it('收窄类在前，其余保持原相对顺序', () => {
    const items = [
      { id: 'widen', patch: { effectiveTo: day(20) }, inversePatch: { effectiveTo: day(10) } },
      { id: 'note', patch: { note: 'x' }, inversePatch: { note: null } },
      { id: 'narrow-a', patch: { effectiveTo: day(5) }, inversePatch: { effectiveTo: day(10) } },
      { id: 'narrow-b', patch: { effectiveFrom: day(3) }, inversePatch: { effectiveFrom: day(1) } }
    ];
    expect(orderExclusionUpdates(occurrence, items, item => item).map(item => item.id)).toEqual([
      'narrow-a',
      'narrow-b',
      'widen',
      'note'
    ]);
  });

  it('没有区间排他的实体原样返回', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(ordersWritesForExclusion(plain)).toBe(false);
    expect(orderExclusionUpdates(plain, items, () => undefined)).toEqual(items);
  });
});

describe('planMutationWrites', () => {
  const mutationsOf = (entries: Partial<Record<keyof RxDBMutationsMap, [EntityType, object[]][]>>) =>
    ({
      create: new Map((entries.create ?? []).map(([type, list]) => [type, new Set(list)])),
      update: new Map((entries.update ?? []).map(([type, list]) => [type, new Set(list)])),
      remove: new Map((entries.remove ?? []).map(([type, list]) => [type, new Set(list)]))
    }) as unknown as RxDBMutationsMap;

  const describeSteps = (mutations: RxDBMutationsMap) =>
    planMutationWrites(mutations).map(step => `${step.kind}:${getEntityMetadata(step.EntityType).name}`);

  it('没有区间排他的实体：插入 → 更新 → 删除（原顺序）', () => {
    const [a, b, c] = [makePlain(), makePlain(), makePlain()];
    expect(
      describeSteps(
        mutationsOf({
          create: [[WriteOrderPlain, [a]]],
          update: [[WriteOrderPlain, [b]]],
          remove: [[WriteOrderPlain, [c]]]
        })
      )
    ).toEqual(['create:WriteOrderPlain', 'update:WriteOrderPlain', 'remove:WriteOrderPlain']);
  });

  it('排他实体的删除与更新提到全部插入之前，其余实体不动', () => {
    const [created, updated, removed] = [makeOccurrence(), makeOccurrence(), makeOccurrence()];
    const [plainCreated, plainUpdated] = [makePlain(), makePlain()];
    expect(
      describeSteps(
        mutationsOf({
          create: [
            [WriteOrderPlain, [plainCreated]],
            [WriteOrderOccurrence, [created]]
          ],
          update: [
            [WriteOrderPlain, [plainUpdated]],
            [WriteOrderOccurrence, [updated]]
          ],
          remove: [[WriteOrderOccurrence, [removed]]]
        })
      )
    ).toEqual([
      'remove:WriteOrderOccurrence',
      'update:WriteOrderOccurrence',
      'create:WriteOrderPlain',
      'create:WriteOrderOccurrence',
      'update:WriteOrderPlain'
    ]);
  });

  it('同一批既被创建又被更新 / 删除的实例不提前（提前会改写它的语义）', () => {
    const fresh = makeOccurrence();
    const other = makeOccurrence();
    const steps = planMutationWrites(
      mutationsOf({
        create: [[WriteOrderOccurrence, [fresh]]],
        update: [[WriteOrderOccurrence, [fresh, other]]],
        remove: [[WriteOrderOccurrence, [fresh]]]
      })
    );
    expect(steps.map(step => [step.kind, step.entities])).toEqual([
      ['update', [other]],
      ['create', [fresh]],
      ['update', [fresh]],
      ['remove', [fresh]]
    ]);
  });
});
