import { isEqual, performChunk } from '@aiao/utils';
import { Observable } from 'rxjs';
import type { EntityType, EntityUpdateData } from '../entity/entity.interface.js';
import merge_create from '../query/merge_create.js';
import merge_remove from '../query/merge_remove.js';
import merge_update from '../query/merge_update.js';
import { isStaleEventPayload } from '../query/stale-event.utils.js';
import {
  ENTITY_LOCAL_CREATE_EVENT,
  ENTITY_LOCAL_REMOVE_EVENT,
  ENTITY_LOCAL_UPDATE_EVENT,
  EntityLocalCreatedEvent,
  EntityLocalRemovedEvent,
  EntityLocalUpdatedEvent,
  RxDBEntityLocalCreatedEventData,
  RxDBEntityLocalEventData,
  RxDBEntityLocalRemovedEventData,
  RxDBEntityLocalUpdatedEventData
} from '../rxdb-events.js';
import { deterministicStringify, getEntityStatus } from '../rxdb-utils.js';
import type { RxDB } from '../RxDB.js';
import { Fingerprint } from './fingerprint.utils.js';
import { QueryOptions } from './QueryManager.interface.js';
import { QueryTask } from './QueryTask.js';
import type { Repository } from './Repository.js';

/**
 * 判断一份增量负载相对缓存实体是否改动了**可见值**。
 *
 * 只看负载里出现过的键：没出现的键这次根本不写，谈不上变化。用 `isEqual` 而不是 `!==`，
 * 与 Proxy 的 set 陷阱同口径 —— 那里也是「值真的不同才记成改动」。
 */
const hasVisibleChange = (entity: object, payload: object): boolean => {
  const current = entity as Record<string, unknown>;
  const incoming = payload as Record<string, unknown>;
  return Object.keys(incoming).some(key => !isEqual(current[key], incoming[key]));
};

export type MergeQueryTaskCreateFn<T extends EntityType = EntityType> = (
  task: QueryTask<T>,
  entities: RxDBEntityLocalCreatedEventData<T>[]
) => void;

export type MergeQueryTaskUpdateFn<T extends EntityType = EntityType> = (
  task: QueryTask<T>,
  entities: RxDBEntityLocalUpdatedEventData<T>[]
) => void;

export type MergeQueryTaskRemoveFn<T extends EntityType = EntityType> = (
  task: QueryTask<T>,
  entities: RxDBEntityLocalRemovedEventData<T>[]
) => void;

interface CreateTaskOptions<T extends EntityType, RT> {
  /**
   * 查询选项
   */
  options: QueryOptions<T>;
  /**
   * 查询执行函数
   */
  runner: (options?: QueryOptions<T>) => Observable<RT>;
  /**
   * 结果指纹计算方法
   */
  getFingerprint: (result: RT) => Fingerprint[];
  /**
   * 不由 where 表达的额外实体依赖
   */
  relationEntityTypes?: Iterable<EntityType>;
  /**
   * 是否把结果按实体或实体数组自动缓存
   * @default true
   */
  autoCache?: boolean;
}

/**
 * 查询缓存管理器
 *
 * 用于管理查询任务的缓存和执行
 * - 需要根据查询条件记录观察表的依赖关系
 * - 统一计算何时 js 计算，何时重新执行 sql，减少适配器的开发难度
 * - 未来配置 Repository 里的规则，与远程进行 pull/push
 *
 * 核心功能：
 * 1. 查询结果缓存：相同查询条件复用缓存结果
 * 2. 订阅管理：管理多个观察者的订阅和取消订阅
 * 3. 自动清理：当没有观察者时自动清理缓存
 * 4. 响应式刷新：支持手动刷新和自动刷新查询结果
 */
export class QueryManager<T extends EntityType> {
  /** 查询任务缓存 Map，key 为查询条件的 hash 值 */
  readonly #query_task_map = new Map<string, QueryTask<T>>();
  /** where 依赖计数 Map，key 为实体类型，value 为依赖该实体的查询任务数量 */
  readonly #dep_entity_type_map = new Map<EntityType, number>();

  #query_task_merge_create_map = new Map<string, MergeQueryTaskCreateFn<T>>();
  #query_task_merge_update_map = new Map<string, MergeQueryTaskUpdateFn<T>>();
  #query_task_merge_remove_map = new Map<string, MergeQueryTaskRemoveFn<T>>();

  #need_change_handler!: (event: EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent) => void;

  /**
   * 构造函数
   *
   * @param rxdb RxDB 实例，用于访问数据库和事件系统
   * @param EntityType 实体类型，用于标识当前管理的实体
   * @param repository 仓库实例，用于执行实际的查询操作
   */
  constructor(
    protected readonly rxdb: RxDB,
    protected readonly EntityType: T,
    protected readonly repository: Repository<T>
  ) {
    // 初始化数据库变更监听
    this.#init_db_changes();
    this.#dep_entity_type_map.set(this.EntityType, 1);
  }

  destroy() {
    this.rxdb.removeEventListener(ENTITY_LOCAL_CREATE_EVENT, this.#need_change_handler);
    this.rxdb.removeEventListener(ENTITY_LOCAL_UPDATE_EVENT, this.#need_change_handler);
    this.rxdb.removeEventListener(ENTITY_LOCAL_REMOVE_EVENT, this.#need_change_handler);
    // 逐个 clean 再 clear：只 clear() 的话 destroy$ 永不触发 —— 查询管道继续跑、
    // 观察者永远等不到 complete、依赖计数也不会归还。clean() 会回调 #on_clean 删表项，
    // 因此先快照再遍历。
    for (const task of Array.from(this.#query_task_map.values())) {
      task.clean();
    }
    this.#query_task_map.clear();
  }

  /**
   * 创建查询任务
   *
   * 此方法根据查询选项创建或复用缓存的查询任务
   * - 使用查询类型和选项的 hash 值作为缓存 key
   * - 如果缓存中已存在相同的查询，直接返回缓存的任务
   * - 每个查询任务管理多个观察者，当最后一个观察者取消订阅时自动清理任务
   *
   * @param taskOptions 查询任务选项
   * @returns 查询任务对象，包含 result$ 用于订阅查询结果
   */
  public createTask<RT = unknown>(taskOptions: CreateTaskOptions<T, RT>): QueryTask<T, RT> {
    // 根据查询类型和选项生成唯一的缓存键
    const cacheKey = deterministicStringify(taskOptions.options);
    const cachedTask = this.#resolve_task(cacheKey, taskOptions);
    // 创建结果流，管理观察者的生命周期
    cachedTask.result$ = this.#create_result_stream(cacheKey, taskOptions);
    return cachedTask;
  }

  /**
   * 本管理器当前是否有查询依赖该实体类型（US-023）。
   *
   * @param entityType - 待判定的实体类型
   * @returns 依赖计数表里存在该键时为 `true`
   *
   * @remarks
   * 依赖集由每个任务的 `where` 推导（见 `entity_type_dependencies`），因此「A 的查询
   * 引用了 B」在这里表现为 A 的管理器持有 B 的计数。本仓储自身的实体类型在构造期就
   * 计过一次，永远为 `true`。
   *
   * 内部接口：给 `Repository` 判断一次失效上报要不要往下走，不属于公开 API。
   */
  hasDependency(entityType: EntityType): boolean {
    return this.#dep_entity_type_map.has(entityType);
  }

  /**
   * 重跑依赖了给定实体类型之一的查询任务（US-023）。
   *
   * @param entityTypes - 被上报失效的实体类型集合
   *
   * @remarks
   * 按**任务粒度**匹配而不是一刀切全表重跑：`QueryTask.relationEntityTypes` 是该任务
   * 自己的依赖集（构造期必含自身实体类型），与入参有交集才重跑。同一个仓储上
   * `where` 各不相同的查询，只有真的引用了被上报实体的那些才回远端。
   *
   * 内部接口：给 `Repository` 的失效监听器调用，不属于公开 API。
   */
  refreshDependentTasks(entityTypes: ReadonlySet<EntityType>): void {
    for (const task of Array.from(this.#query_task_map.values())) {
      for (const dependency of task.relationEntityTypes) {
        if (entityTypes.has(dependency)) {
          task.refresh();
          break;
        }
      }
    }
  }

  registerMergeCreateFn(taskType: string, fn: MergeQueryTaskCreateFn<T>) {
    this.#query_task_merge_create_map.set(taskType, fn);
  }

  registerMergeUpdateFn(taskType: string, fn: MergeQueryTaskUpdateFn<T>) {
    this.#query_task_merge_update_map.set(taskType, fn);
  }

  registerMergeRemoveFn(taskType: string, fn: MergeQueryTaskRemoveFn<T>) {
    this.#query_task_merge_remove_map.set(taskType, fn);
  }

  /**
   * 创建新的查询任务
   *
   * @param taskOptions 查询任务选项
   * @param cacheKey 缓存键
   * @returns 新创建的查询任务
   */
  /**
   * 取回该 cacheKey 当前**存活**的任务，没有就新建并入表
   *
   * @remarks
   * 「不在表里」有两种成因：首次查询，或上一批订阅者全部退订后任务被 `clean()` 摘掉。
   * 两者都必须新建 —— 被 clean 的任务其管道已被 `takeUntil(destroy$)` 终结、
   * `#is_first_run` 永久为 `true`，复用它只会先推一个陈旧结果、然后永远不再更新。
   *
   * @param cacheKey 缓存键
   * @param taskOptions 查询任务选项
   * @returns 存活的查询任务
   */
  #resolve_task<RT>(cacheKey: string, taskOptions: CreateTaskOptions<T, RT>): QueryTask<T, RT> {
    const cached = this.#query_task_map.get(cacheKey) as unknown as QueryTask<T, RT> | undefined;
    if (cached) return cached;
    const task = this.#create_new_task(cacheKey, taskOptions);
    this.#query_task_map.set(cacheKey, task as unknown as QueryTask<T>);
    return task;
  }

  #create_new_task<RT>(cacheKey: string, options: CreateTaskOptions<T, RT>): QueryTask<T, RT> {
    // 直接创建查询任务实例
    const task = new QueryTask<T, RT>({
      cacheKey,
      ...options,
      entityType: this.EntityType,
      rxdb: this.rxdb,
      depEntityTypeMap: this.#dep_entity_type_map,
      serialize: this.#serialize,
      onClean: this.#on_clean
    });
    return task;
  }

  #on_clean = (key: string) => {
    this.#query_task_map.delete(key);
  };

  #serialize = (data: RxDBEntityLocalEventData<T>): InstanceType<T> => {
    const entityType = data.entityType || this.rxdb.schemaManager.getEntityType(data.entity, data.namespace)!;
    let entityData: EntityUpdateData<T> = { id: data.id } as EntityUpdateData<T>;
    switch (data.type) {
      case 'INSERT':
      case 'UPDATE':
        entityData = {
          ...entityData,
          ...data.patch
        };
        break;
      case 'DELETE':
        entityData = {
          ...entityData,
          ...data.inversePatch
        };
        break;
      default:
        break;
    }
    // P0-004 单调性守卫：命中缓存时 `createEntityRef` 会走 `EntityStatus.replace`，
    // 而 `replace` 的 `Object.assign(this.target, data)` **绕过 Proxy**，同时把 `_origin`
    // 重设为新 target、`_modified` 归零。事件迟到时这会把用户尚未保存的编辑连同 origin
    // 一起打回旧值；用户再编辑成同一个值会被 proxy 的 `isEqual` 判成「没变」→ patch 为空
    // → `save()` **静默 no-op**。即写丢了且全程无错误。
    const cached = this.rxdb.entityManager.getEntityRef(entityType, data.id);
    if (cached && isStaleEventPayload(cached, entityData)) return cached;

    // 外部事件的 patch 不保证带 `updatedAt`（`notifyExternalUpdate` 允许只发业务字段，
    // 上面 `_need_change` 还会专门丢掉「只有 updatedAt」的 patch），指纹的前两段（id@updatedAt）
    // 表达不了这次变化。而下面 `createEntityRef` 命中缓存时走的是 `EntityStatus.replace`——
    // 那条路径**故意不推进内容修订号**，因为它同时服务查询结果回填（含 SQL 派生列如
    // `hasChildren`/`level`），在那里推进会让树查询自激发射。
    //
    // 所以「这是外部事件」这个信息只有这里知道：在写入前比出可见值到底变没变，变了就显式补一位，
    // 否则 `QueryTask.#next` 把「值变了」判成「结果没变」，活查询订阅者永远停在旧值上。
    //
    // 本地 UPDATE 走到这里时缓存实体早已是新值（用户经 Proxy 改的），diff 为空、不会多发一次。
    const contentChanged = cached ? hasVisibleChange(cached, entityData) : false;
    const entity = this.rxdb.entityManager.createEntityRef(entityType, entityData, { modified: false, local: true })!;
    if (contentChanged) getEntityStatus(entity).markContentChanged();
    return entity;
  };

  /**
   * 创建结果流
   *
   * 该方法为每个订阅者创建一个 Observable，并管理订阅的生命周期：
   * 1. 新订阅时，如果有缓存结果，立即返回
   * 2. 首次订阅时，触发查询执行
   * 3. 取消订阅时，自动清理资源
   *
   * @remarks
   * 流绑定的是 **cacheKey**，不是某一个 `QueryTask` 实例：调用方（Angular async 管道随
   * `@if` 反复挂载、`switchMap` 重入、两次 `firstValueFrom`）随时可能在退订后再订阅同一个
   * `result$`，而退订会 `clean()` 掉任务。每次订阅重新取活任务，才不会复活一个已终结的管道。
   *
   * @param cacheKey 缓存键
   * @param taskOptions 查询任务选项，任务被清理后据此重建
   */
  #create_result_stream<RT>(cacheKey: string, taskOptions: CreateTaskOptions<T, RT>): Observable<RT> {
    return new Observable<RT>(observer => {
      const task = this.#resolve_task(cacheKey, taskOptions);
      // 增加观察者计数
      task.observerCount++;

      // 如果已有缓存结果，立即发送给新订阅者（热启动）
      if (task.result !== undefined) {
        observer.next(task.result);
      }

      // 将观察者添加到集合中
      task.observers.add(observer);
      task.run();

      // 返回清理函数（当订阅者取消订阅时调用）
      return (): void => {
        // 减少观察者计数
        task.observerCount--;
        // 从观察者集合中移除
        task.observers.delete(observer);

        // 当没有观察者时，清理整个任务以释放资源
        if (task.observerCount <= 0) {
          task.clean();
        }
      };
    });
  }

  /**
   * 把一次实体变更事件按类型合并进单个查询任务的缓存。
   *
   * @param task - 目标查询任务
   * @param event - 本次实体变更事件
   * @param entities - 已过滤到与该事件相关的实体负载
   *
   * @remarks
   * **错误在这里收口**，每个任务独立兜底：合并策略（含插件注册的自定义策略）抛错时，
   * 该任务退回一次整查 `refresh()`，其余任务不受影响。
   *
   * 用 `refresh()` 而不是就地吞掉：增量合并失败意味着这个任务的缓存**已经和库不一致**，
   * 静默返回会把脏数据一直留在订阅者手里；重跑一次查询是唯一能保证正确的收尾。
   */
  #merge_event_into_task(
    task: QueryTask<T>,
    event: EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent,
    entities: RxDBEntityLocalEventData[]
  ): void {
    try {
      switch (event.type) {
        case ENTITY_LOCAL_CREATE_EVENT: {
          const merge_create_fn = this.#query_task_merge_create_map.get(task.type) || merge_create;
          merge_create_fn(task, entities as RxDBEntityLocalCreatedEventData<T>[]);
          return;
        }
        case ENTITY_LOCAL_UPDATE_EVENT: {
          const merge_update_fn = this.#query_task_merge_update_map.get(task.type) || merge_update;
          merge_update_fn(task, entities as RxDBEntityLocalUpdatedEventData<T>[]);
          return;
        }
        case ENTITY_LOCAL_REMOVE_EVENT: {
          const merge_remove_fn = this.#query_task_merge_remove_map.get(task.type) || merge_remove;
          merge_remove_fn(task, entities as RxDBEntityLocalRemovedEventData<T>[]);
          return;
        }
      }
    } catch (error) {
      console.error('[QueryManager] 查询缓存合并失败，退回整查', error);
      task.refresh();
    }
  }

  /**
   * 初始化数据库变更监听
   *
   * 该方法监听实体的增删改事件，并使用增量更新策略优化查询缓存：
   * - 只处理与当前查询相关的实体类型变更
   * - 使用分块处理避免阻塞主线程
   * - 针对不同的事件类型调用相应的缓存合并策略
   */
  #init_db_changes() {
    /**
     * 处理实体变更事件
     *
     * @param event 实体变更事件（创建、更新、修补或删除）
     */
    const _need_change = (event: EntityLocalCreatedEvent | EntityLocalUpdatedEvent | EntityLocalRemovedEvent) => {
      // 如果没有活跃的查询任务，直接返回（性能优化）
      if (this.#query_task_map.size === 0) {
        return;
      }

      // 过滤出与当前查询任务相关的实体
      const entities = event.entities.filter(d => {
        const entityType = this.rxdb.schemaManager.getEntityType<T>(d.entity, d.namespace);
        return entityType && this.#dep_entity_type_map.has(entityType);
      });

      // 如果有相关的实体变更，执行增量缓存更新
      if (entities.length) {
        // 过滤掉只有 updatedAt 变更的 patch（避免无意义的缓存刷新）
        const need_entities = entities.filter(e => {
          if (e.patch) {
            const keys = Object.keys(e.patch);
            if (keys.length === 1 && keys[0] === 'updatedAt') {
              return false;
            }
          }
          return true;
        });
        if (need_entities.length === 0) {
          return;
        }
        // 使用分块处理，避免一次性处理大量任务导致性能问题。
        //
        // 每个 task 各自 try/catch（见 #merge_event_into_task）：consumer 一旦把错误抛给
        // performChunk，它会 reject `done` 并**停止排后续分片** —— 同一批里排在后面的
        // 查询任务一条都不会再合并，缓存停在事件之前的样子，且没有任何人去纠正它。
        // 一个查询的合并策略出问题不该让另一个查询显示脏数据。
        void performChunk(Array.from(this.#query_task_map.values()), task =>
          this.#merge_event_into_task(task, event, need_entities)
        ).done.catch((error: unknown) => {
          // 走到这里说明是分片调度自身出错（consumer 已不会抛）。不向上抛：
          // 这是事件监听器，抛出去只会变成另一条无人接管的错误。
          console.error('[QueryManager] 查询缓存分片调度失败', error);
        });
      }
    };

    this.#need_change_handler = _need_change;

    // 注册各种实体变更事件的监听器
    this.rxdb.addEventListener(ENTITY_LOCAL_CREATE_EVENT, _need_change);
    this.rxdb.addEventListener(ENTITY_LOCAL_UPDATE_EVENT, _need_change);
    this.rxdb.addEventListener(ENTITY_LOCAL_REMOVE_EVENT, _need_change);
  }
}
