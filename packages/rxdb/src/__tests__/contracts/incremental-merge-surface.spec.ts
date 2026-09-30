/**
 * 增量合并原语在核心公开面上的切线（US-025 阶段 E）。
 *
 * 阶段 E 把树的增量 merge 整体搬进 `@aiao/rxdb-plugin-tree`。树的合并是**真增量**
 * （不像图查询一律 `refresh()`），插件要自己算「更新前/后各自匹不匹配 where」，
 * 就必须用到核心 merge 引擎里那套判定。核心因此得把这套原语公开出来。
 *
 * 这里钉两件事，方向相反、缺一不可：
 *
 * - **够用**：插件实现一条增量 merge 所需的东西，全都能从 `index.js` 拿到。少一样，
 *   插件就只能照抄一份核心的判定逻辑，而「各写一份就是漂移」——复合 where 下漏算
 *   `newlyUnmatchedIds` 这类偏差不会报错，只会让 count 静默偏一点。
 * - **不过量**：接线细节不许跟着漏出去。`classifyUpdates` 的第 3、4 参
 *   （where 判定器、缓存实例）是纯内部装配，一旦进了基线就等于把「核心怎么判 where」
 *   焊死成公开契约。它们由 {@link prepareIncrementalUpdate} 吞掉。
 */
import { of } from 'rxjs';
import { describe, expect, expectTypeOf, it } from 'vitest';
import { ENTITY_STATIC_TYPES } from '../../entity/entity.interface.js';
import type { UpdateClassification, UpdateDataCache } from '../../index.js';
import * as api from '../../index.js';
import type { RuleGroup } from '../../repository/query.interface.js';
import type { RxDBEntityLocalUpdatedEventData } from '../../rxdb-events.js';
import { createHarnessQueryTask } from '../../testing/query-task-harness.js';

/** 插件实现增量 merge 必须够得着的那批符号。 */
const REQUIRED_VALUE_EXPORTS = [
  'prepareIncrementalUpdate',
  'applyExternalEntityUpdate',
  'getEntityId',
  'isStaleEntityEvent',
  'isStaleEntityRemoveEvent'
] as const;

/** 只该留在核心内部的装配细节。 */
const INTERNAL_ONLY_EXPORTS = [
  'classifyUpdates',
  'isStaleEventPayload',
  'readUpdatedAtTime',
  'invalidateEntityFingerprint'
] as const;

class TestEntity {
  [key: string]: unknown;
  static [ENTITY_STATIC_TYPES] = { idType: '' as string };
  id = '';
  status?: string;
  priority?: string;
}

type TestEntityType = typeof TestEntity;
type UpdateEvent = RxDBEntityLocalUpdatedEventData<TestEntityType>;

const updateEvent = (id: string, patch: Partial<TestEntity>, inversePatch: Partial<TestEntity>): UpdateEvent =>
  ({
    type: 'UPDATE',
    namespace: 'test',
    entity: 'TestEntity',
    id,
    entityType: TestEntity,
    recordAt: new Date(0),
    patch,
    inversePatch
  }) as unknown as UpdateEvent;

describe('US-025 E：增量合并原语的公开面', () => {
  it('插件需要的值导出全部在 index 上', () => {
    const surface = new Set(Object.keys(api));

    expect(REQUIRED_VALUE_EXPORTS.filter(name => !surface.has(name))).toEqual([]);
  });

  it('内部装配细节一个都不在 index 上', () => {
    const surface = new Set(Object.keys(api));

    expect(INTERNAL_ONLY_EXPORTS.filter(name => surface.has(name))).toEqual([]);
  });

  it('两个分类型导得出：插件 handler 的形参靠它们命名', () => {
    // 真正的门禁是 `pnpm nx typecheck rxdb`：类型没导出时本文件顶部的 import 就编译不过
    expectTypeOf<UpdateClassification>().toHaveProperty('newlyUnmatchedIds');
    expectTypeOf<UpdateDataCache<TestEntityType>>().toHaveProperty('getSerializedBefore');
  });

  it('prepareIncrementalUpdate 按完整实体判定 where，而不是拿裸 patch 判', () => {
    // 复合 where：status 与 priority 同时成立才算匹配。
    // e1 只改 status，patch 里没有 priority——拿裸 patch 判会因字段缺失恒判 false，
    // 从而把「更新前后都匹配」误算成 newlyMatched，count 静默偏一个。
    const where = {
      combinator: 'and',
      rules: [
        { field: 'status', operator: '=', value: 'active' },
        { field: 'priority', operator: '=', value: 'high' }
      ]
    } as unknown as RuleGroup<TestEntity>;

    const task = createHarnessQueryTask<TestEntityType, TestEntity[]>(TestEntity, {
      type: 'findAll',
      options: { where },
      runner: () => of([]),
      cachedById: {
        e1: { id: 'e1', status: 'active', priority: 'high' },
        e2: { id: 'e2', status: 'active', priority: 'low' }
      }
    });

    const data = [
      // e1：priority 一直是 high，仅 status 在更新前是 draft —— 前不匹配、后匹配
      updateEvent('e1', { status: 'active' }, { status: 'draft' }),
      // e2：priority 从 high 降到 low —— 前匹配、后不匹配
      updateEvent('e2', { priority: 'low' }, { priority: 'high' })
    ];

    const { cache, classification } = api.prepareIncrementalUpdate(task, data);

    expect([...classification.newlyMatchedIds]).toEqual(['e1']);
    expect([...classification.newlyUnmatchedIds]).toEqual(['e2']);
    expect([...classification.stillMatchedIds]).toEqual([]);
    expect(cache.getSerializedUpdate('e1')).toMatchObject({ id: 'e1', status: 'active', priority: 'high' });
    expect(cache.getSerializedBefore('e1', data[0].inversePatch)).toMatchObject({ status: 'draft', priority: 'high' });
  });
});
