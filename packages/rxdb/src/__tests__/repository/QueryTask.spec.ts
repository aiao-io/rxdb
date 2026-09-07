/**
 * @fileoverview QueryTask 单元测试
 *
 * 覆盖：
 * - 实体依赖计数的生命周期：run() 时按 relationEntityTypes 累加计数，clean() 时递减
 *   计数，归零后删除 key（QueryManager 的事件过滤只用 has() 判断）
 * - 过滤早于本地增量结果的运行器旧结果（stale runner emission guard）
 * - 运行器抛错只终结这一轮，不终结整个任务
 */

import { of, Subject, throwError, type Observer } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { SyncType } from '../../entity/metadata-options.interface.js';
import { QueryTask, QueryTaskOptions } from '../../repository/QueryTask.js';
import type { RxDB } from '../../RxDB.js';
import { METADATA } from '../../rxdb.private.js';

class TestEntity {
  static entityName = 'TestEntity';
  id!: string;
  name!: string;
  rules!: string[];
}

class EdgeEntity {
  static entityName = 'EdgeEntity';
  id!: string;
}

(TestEntity as unknown as Record<symbol, unknown>)[METADATA] = {
  name: 'TestEntity',
  namespace: 'public',
  relationMap: new Map(),
  sync: {
    type: SyncType.None,
    local: { adapter: 'local' }
  }
};

const TestEntityType = TestEntity as unknown as EntityType;
const EdgeEntityType = EdgeEntity as unknown as EntityType;

interface CreateTaskOverrides {
  where?: unknown;
  relationEntityTypes?: Iterable<EntityType>;
}

const createTask = (
  depEntityTypeMap: Map<EntityType, number>,
  cacheKey = 'key',
  onClean: QueryTaskOptions<EntityType, unknown>['onClean'] = vi.fn(),
  overrides: CreateTaskOverrides = {}
) =>
  new QueryTask<EntityType>({
    options: {
      type: 'find',
      options: {
        where: overrides.where ?? {
          combinator: 'and',
          rules: [{ field: 'name', operator: '=', value: 'x' }]
        }
      }
    },
    runner: () => of([]),
    cacheKey,
    entityType: TestEntityType,
    relationEntityTypes: overrides.relationEntityTypes,
    rxdb: {} as RxDB,
    depEntityTypeMap,
    serialize: (v: unknown) => v,
    onClean,
    getFingerprint: () => []
  } as unknown as QueryTaskOptions<EntityType, unknown>);

describe('QueryTask - 实体依赖计数', () => {
  it('run() 应该为依赖实体累加计数', () => {
    const depEntityTypeMap = new Map<EntityType, number>();
    const task = createTask(depEntityTypeMap);

    task.run();

    expect(depEntityTypeMap.get(TestEntityType)).toBe(1);
  });

  it('Graph 普通对象 where 不应进入 RuleGroup 依赖分析', () => {
    const depEntityTypeMap = new Map<EntityType, number>();
    const task = createTask(depEntityTypeMap, 'graph-query', vi.fn(), {
      where: { rules: ['important'] },
      relationEntityTypes: [EdgeEntityType]
    });

    expect(() => task.run()).not.toThrow();
    expect(depEntityTypeMap.get(TestEntityType)).toBe(1);
    expect(depEntityTypeMap.get(EdgeEntityType)).toBe(1);
  });

  it('clean() 计数归零时应该删除 key，而不是保留 0', () => {
    const depEntityTypeMap = new Map<EntityType, number>();
    const task = createTask(depEntityTypeMap);

    task.run();
    task.clean();

    expect(depEntityTypeMap.has(TestEntityType)).toBe(false);
  });

  it('clean() 仍有其他任务依赖时应该保留递减后的计数', () => {
    const depEntityTypeMap = new Map<EntityType, number>();
    const task1 = createTask(depEntityTypeMap, 'key1');
    const task2 = createTask(depEntityTypeMap, 'key2');

    task1.run();
    task2.run();
    expect(depEntityTypeMap.get(TestEntityType)).toBe(2);

    task1.clean();
    expect(depEntityTypeMap.get(TestEntityType)).toBe(1);

    task2.clean();
    expect(depEntityTypeMap.has(TestEntityType)).toBe(false);
  });

  it('重复 clean() 不应继续递减其他任务的依赖计数', () => {
    const depEntityTypeMap = new Map<EntityType, number>();
    const task1 = createTask(depEntityTypeMap, 'key1');
    const task2 = createTask(depEntityTypeMap, 'key2');

    task1.run();
    task2.run();
    task1.clean();
    task1.clean();

    expect(depEntityTypeMap.get(TestEntityType)).toBe(1);
  });

  it('重复 clean() 只应清理一次缓存条目', () => {
    const onClean = vi.fn<(cacheKey: string) => void>();
    const task = createTask(new Map(), 'same-key', onClean);

    task.run();
    task.clean();
    task.clean();

    expect(onClean).toHaveBeenCalledOnce();
    expect(onClean).toHaveBeenCalledWith('same-key');
  });

  it('clean() 未 run() 时不应该改动计数', () => {
    const depEntityTypeMap = new Map<EntityType, number>([[TestEntityType, 1]]);
    const task = createTask(depEntityTypeMap);

    task.clean();

    expect(depEntityTypeMap.get(TestEntityType)).toBe(1);
  });
});

const getFingerprint = (result: TestEntity[]) => result.map(entity => entity.id);

describe('QueryTask', () => {
  it('应忽略早于本地增量结果的运行器旧结果', () => {
    const runner$ = new Subject<TestEntity[]>();
    const results: TestEntity[][] = [];
    const observer: Observer<TestEntity[]> = {
      next: value => results.push(value),
      error: vi.fn(),
      complete: vi.fn()
    };
    const task = new QueryTask<typeof TestEntity, TestEntity[]>({
      cacheKey: 'find-all',
      options: {
        type: 'findAll',
        options: {
          where: {
            combinator: 'and',
            rules: []
          }
        }
      },
      runner: () => runner$,
      getFingerprint,
      entityType: TestEntity,
      rxdb: {
        schemaManager: {
          getEntityType: () => TestEntity
        }
      } as unknown as RxDB,
      depEntityTypeMap: new Map(),
      serialize: data => (data as { patch: TestEntity }).patch,
      onClean: vi.fn()
    });

    task.observers.add(observer);
    task.observerCount = 1;
    task.run();

    task.next([{ id: 'new-1', name: 'New Entity' } as TestEntity]);
    runner$.next([]);

    expect(results).toEqual([[{ id: 'new-1', name: 'New Entity' }]]);
  });
});

describe('QueryTask - 运行器失败', () => {
  /** 造一个「第一轮抛错、之后正常」的任务，并把观察者收到的东西记下来 */
  const createFailingTask = () => {
    let runnerCalls = 0;
    const values: unknown[] = [];
    const errors: unknown[] = [];
    const onClean = vi.fn();

    const task = new QueryTask<EntityType>({
      options: { type: 'find', options: { where: { combinator: 'and', rules: [] } } },
      runner: () => {
        runnerCalls++;
        return runnerCalls === 1 ? throwError(() => new Error('运行器炸了')) : of([{ id: 'a' }]);
      },
      cacheKey: 'failing',
      entityType: TestEntityType,
      rxdb: {} as RxDB,
      depEntityTypeMap: new Map(),
      serialize: (v: unknown) => v,
      onClean,
      getFingerprint: () => []
    } as unknown as QueryTaskOptions<EntityType, unknown>);

    task.observers.add({
      next: (v: unknown) => values.push(v),
      error: (e: unknown) => errors.push(e),
      complete: () => undefined
    } as Observer<unknown>);

    return { task, values, errors, onClean, runnerCalls: () => runnerCalls };
  };

  it('运行器抛错照常送达观察者', () => {
    const { task, errors } = createFailingTask();

    task.run();

    expect(errors).toHaveLength(1);
    expect((errors[0] as Error).message).toBe('运行器炸了');
  });

  it('运行器抛错后 refresh() 仍能重新执行查询', () => {
    const { task, runnerCalls } = createFailingTask();

    task.run();
    expect(runnerCalls()).toBe(1);

    task.refresh();

    // 关键断言：错误顺着 switchMap 冒到外层会终结整条 refresh$ 管道，
    // 此后 refresh() 静默空转 —— 运行器调用数会停在 1，查询永久冻结。
    expect(runnerCalls()).toBe(2);
  });

  it('失败一轮后的下一轮结果照常写进 result', () => {
    const { task } = createFailingTask();

    task.run();
    task.refresh();

    expect(task.result).toEqual([{ id: 'a' }]);
  });
});
