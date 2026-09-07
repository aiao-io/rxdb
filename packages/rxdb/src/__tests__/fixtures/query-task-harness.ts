/**
 * @fileoverview `merge_*` 系列 spec 共用的查询任务测试台。
 *
 * 七份 spec 曾各自复制约 90 行 `createMockQueryTask`，其中最要命的一段是**手写 `result$`**：
 * 副本自己 `observerCount++` / `run()` / `clean()`，于是近万行用例验证的是测试作者写的流，
 * 而不是 `QueryManager` 装配的那条。`share` / 热启动重放 / 退订清理的语义怎么改都绿。
 * 副本也已经开始分叉 —— 有的补了 `addEventListener`、有的补了 `createEntityRef`、
 * 有的自带 `serialize` 覆盖，同一件事在七个地方长成了七个样子。
 *
 * 这里只留一份，并且**经真正的 `QueryManager.createTask()`** 拿任务：
 * `result$`、`serialize`、`onClean`、依赖计数全部来自生产代码，
 * `QueryManager` 一改，这些 spec 就会红。
 */

import { emptyFunction } from '@aiao/utils';
import type { Observable } from 'rxjs';
import { vi } from 'vitest';
import type { EntityType } from '../../entity/entity.interface.js';
import { getFingerprintPrimitive, type Fingerprint } from '../../repository/fingerprint.utils.js';
import type { QueryOptions } from '../../repository/QueryManager.interface.js';
import { QueryManager } from '../../repository/QueryManager.js';
import type { QueryTask } from '../../repository/QueryTask.js';
import type { RxDB } from '../../RxDB.js';
import { STATUS } from '../../rxdb.private.js';

/** 按查询类型选取指纹算法，与 `Repository` 里的分派保持一致。 */
const pickFingerprint = (type: QueryOptions<EntityType>['type']): ((result: never) => Fingerprint[]) => {
  switch (type) {
    case 'count':
    case 'countDescendants':
    case 'countAncestors':
      return (value: unknown) => getFingerprintPrimitive(value as Fingerprint | Fingerprint[]);
    case 'findOne':
    case 'findOneOrFail':
    case 'get':
      return (entity: unknown) => [JSON.stringify({ ...(entity as object) })];
    default:
      return (entities: unknown) =>
        Array.isArray(entities) ? entities.map(e => JSON.stringify({ ...(e as object) })) : [];
  }
};

/**
 * 实体缓存替身：键是实体 id，值是「已在缓存里的那个实例」。
 *
 * 只收字符串与数值主键 —— `RxDBEntityId` 允许 `bigint`，但它不能当对象键，
 * 需要覆盖 bigint 主键时改用 `Map` 而不是在这里放宽类型。
 */
export type EntityCache = Record<string | number, unknown>;

/**
 * `schemaManager` 覆盖：只有验「关系 / EXISTS 依赖抽取」的用例需要。
 *
 * 默认的 schema 替身声明「无关系」，依赖抽取因此只认查询自身的实体类型 —— 绝大多数
 * `merge_*` 用例要的正是这个。要验关系依赖，就把 `getEntityMetadata` /
 * `getFieldRelations` / `findMappedRelation` 按需覆盖成真元数据。
 *
 * 覆盖是逐键替换，不是深合并：给了哪个键就整个换掉哪个键。
 */
export type HarnessSchemaOverrides = Record<string, unknown>;

/**
 * 挂上最小 `EntityStatus` 槽位，只实现 `#serialize` 用到的 `markContentChanged`。
 *
 * 必须是**不可枚举**的：这是内部槽位而不是数据字段，真实体也一样。
 * 可枚举的话 `toEqual` 会把它当成多出来的一个属性，全部结果断言当场变红。
 */
const attachStatus = <T extends object>(entity: T): T => {
  if (STATUS in entity) return entity;
  Object.defineProperty(entity, STATUS, {
    value: { markContentChanged: emptyFunction },
    enumerable: false,
    configurable: true
  });
  return entity;
};

/**
 * 造一个只够 `QueryManager` 跑起来的 RxDB 替身。
 *
 * `QueryManager` 只碰三样东西：构造期注册事件监听、`schemaManager` 解实体类型与关系、
 * `entityManager` 读写实体缓存。这里如实提供这三样，其余一概不给 —— 用到了就该报错，
 * 而不是让替身悄悄兜住。
 *
 * `createEntityRef` 按 `EntityStatus.replace` 的语义**合并进缓存里那个实例**并原样返回它，
 * 这正是生产 `QueryManager#serialize` 把「只含被改字段的增量 patch」补全成完整实体的路径；
 * 缓存未命中时直接返回入参（新实体）。
 *
 * 返回前挂一个最小 `EntityStatus` 槽位：真 `entityManager.createEntityRef` 保证「出去的
 * 一定是已挂载实体」，而生产 `#serialize` 正是靠这条保证在内容变化时调
 * `getEntityStatus(entity).markContentChanged()`。不挂就会 fail-fast 抛错。
 *
 * @remarks
 * 这里保留唯一一处 `as unknown as RxDB`：真 `RxDB` 要拖进适配器、连接与整套引导链，
 * 而 `merge_*` 是纯函数级用例。七份副本各有一处同样的转换，收敛成一处已是净收益。
 */
const createHarnessRxDB = (
  entityType: EntityType,
  cachedById: EntityCache,
  schemaOverrides: HarnessSchemaOverrides
): RxDB =>
  ({
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    schemaManager: {
      getFieldRelations: vi.fn(() => ({ relations: [], isForeignKey: false, property: {}, propertyName: '' })),
      getEntityType: vi.fn(() => entityType),
      getEntityMetadata: vi.fn(),
      findMappedRelation: vi.fn(),
      ...schemaOverrides
    },
    entityManager: {
      getEntityRef: vi.fn((_entityType: unknown, id: string | number) => cachedById[id]),
      createEntityRef: vi.fn((_entityType: unknown, entity: { id: string | number }) => {
        const cached = cachedById[entity.id];
        if (!cached) return attachStatus(entity);
        Object.assign(cached, entity);
        return attachStatus(cached);
      })
    }
  }) as unknown as RxDB;

/**
 * 订阅任务并按序收集每一次发射。
 *
 * 合并路径**全程同步**：`of()` 运行器 + `BehaviorSubject` 驱动的 `refresh$`，
 * `QueryTask.run()` 的管道里没有任何调度器，`#next()` 直接 `observers.forEach(o => o.next())`。
 * 所以 `query_merge_*_cache()` 一返回，本轮该发的就已经发完了 —— 直接比对整个发射序列即可。
 *
 * 这取代了原先「`setTimeout(..., 100)` 后再看 `emitCount`」的写法，两处都是净收益：
 * 不吃墙钟（六份 spec 合计 5.1 s），也不再留一个让迟到的第二次发射蒙混过关的窗口。
 * 哪天合并路径真的引入了异步，这些用例会立刻变红 —— 那正是该被看见的行为变更。
 *
 * @param task - 目标查询任务
 * @returns 发射序列，随订阅持续追加；同步触发结束后即可断言
 *
 * @remarks
 * 不挂 `error` 处理器：`merge_*` 用例的运行器一律是 `of()`，不会出错。真出错时
 * 序列会短一截让断言失败，同时 RxJS 会报一次未处理错误，两个信号都在。
 */
export const collectEmissions = <T extends EntityType, RT>(task: QueryTask<T, RT>): RT[] => {
  const emissions: RT[] = [];
  task.result$.subscribe({ next: value => emissions.push(value) });
  return emissions;
};

/** {@link createHarnessQueryTask} 的入参：查询选项本身，加上跑查询用的 runner。 */
export type HarnessTaskOptions<T extends EntityType, RT> = QueryOptions<T> & {
  /** 查询执行函数，每次 `run()` 调一次。 */
  runner: () => Observable<RT>;
  /** 预置的实体缓存，用于模拟乱序 / 陈旧事件（P0-004、RXD-018）。默认为空 = 全部 cache miss。 */
  cachedById?: EntityCache;
  /** `schemaManager` 覆盖，只有验 EXISTS / 关系依赖抽取的用例需要。 */
  schemaManager?: HarnessSchemaOverrides;
};

/**
 * 经真正的 `QueryManager` 造一个查询任务。
 *
 * @param entityType - 被查询的实体类型
 * @param taskOptions - 查询选项 + `runner`（+ 可选的实体缓存）
 * @returns 生产路径产出的 {@link QueryTask}，其 `result$` 由 `QueryManager` 装配
 */
export const createHarnessQueryTask = <T extends EntityType, RT>(
  entityType: T,
  taskOptions: HarnessTaskOptions<T, RT>
): QueryTask<T, RT> => {
  const { runner, cachedById = {}, schemaManager = {}, ...queryOptions } = taskOptions;
  const rxdb = createHarnessRxDB(entityType, cachedById, schemaManager);
  const queryManager = new QueryManager<T>(rxdb, entityType);
  return queryManager.createTask<RT>({
    options: queryOptions as QueryOptions<T>,
    runner,
    getFingerprint: pickFingerprint(queryOptions.type) as (result: RT) => Fingerprint[]
  });
};
