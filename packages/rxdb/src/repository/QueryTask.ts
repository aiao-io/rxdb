import {
  BehaviorSubject,
  catchError,
  distinctUntilChanged,
  EMPTY,
  Observable,
  Observer,
  ReplaySubject,
  switchMap,
  takeUntil,
  tap
} from 'rxjs';
import type { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import query_entity_type_dependencies from '../query/entity_type_dependencies.js';
import type { RxDBEntityLocalEventData } from '../rxdb-events.js';
import { RxDB } from '../RxDB.js';
import { Fingerprint } from './fingerprint.utils.js';
import type { RuleGroup } from './query.interface.js';
import { QueryOptions } from './QueryManager.interface.js';

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const isRule = (value: unknown): boolean =>
  isRecord(value) && typeof value['field'] === 'string' && typeof value['operator'] === 'string';

const isRuleGroup = <T extends object>(value: unknown): value is RuleGroup<T> => {
  if (!isRecord(value)) return false;

  const combinator = value['combinator'];
  const rules = value['rules'];
  return (
    (combinator === 'and' || combinator === 'or') &&
    Array.isArray(rules) &&
    rules.every(rule => isRule(rule) || isRuleGroup<T>(rule))
  );
};

/**
 * 查询任务选项接口
 */
export interface QueryTaskOptions<T extends EntityType, RT> {
  /**
   * 缓存键
   */
  cacheKey: string;
  /**
   * 查询选项
   */
  options: QueryOptions<T>;

  /**
   * 查询执行函数
   */
  runner: () => Observable<RT>;

  /**
   * 实体类型
   */
  entityType: T;

  /**
   * RxDB 实例
   */
  rxdb: RxDB;

  /**
   * 依赖的实体类型映射
   */
  depEntityTypeMap: Map<EntityType, number>;

  /**
   * 查询额外依赖的实体类型
   */
  relationEntityTypes?: Iterable<EntityType>;

  /**
   * 是否把查询结果按实体数组自动缓存
   */
  autoCache?: boolean;

  /**
   * 序列化函数
   */
  serialize: (data: RxDBEntityLocalEventData<T>) => InstanceType<T>;

  /**
   * 清理函数
   */
  onClean: (cacheKey: string) => void;

  /**
   * 结果指纹计算方法
   */
  getFingerprint: (result: RT) => Fingerprint[];
}

/**
 * 查询任务实现
 *
 * 封装查询任务的创建和生命周期管理
 * - 管理任务的刷新和销毁信号
 * - 处理观察者的订阅和取消订阅
 * - 维护实体类型依赖关系
 * - 提供任务的首次运行和清理机制
 */
export class QueryTask<T extends EntityType, RT = unknown> {
  /**
   * 刷新
   * 重新执行 SQL 查询
   */
  readonly #refresh_sub = new BehaviorSubject<number>(0);

  /**
   * 销毁
   */
  readonly #destroy_sub = new ReplaySubject<void>(1);

  /**
   * 是否首次运行
   * 标识查询是否为第一次执行
   */
  #is_first_run?: boolean;

  /**
   * 是否已累加依赖计数
   * 仅当 run() 真正执行过依赖累加后才允许在 clean() 中递减，保证增减对称
   */
  #deps_counted = false;

  #cleaned = false;

  /**
   * 查询结果指纹
   * 初始化为空数组，避免与实际结果误匹配
   */
  #result_fingerprint: Fingerprint[] = [];

  #local_result_version = 0;

  private readonly runner: () => Observable<RT>;
  private readonly onClean!: (cacheKey: string) => void;
  /**
   * 观察者集合
   * 存储所有订阅此查询结果的观察者
   */
  readonly observers = new Set<Observer<RT>>();

  // 输入。
  readonly serialize!: (data: RxDBEntityLocalEventData<T>) => InstanceType<T>;
  readonly cacheKey!: string;
  readonly entityType!: T;
  readonly rxdb!: RxDB;
  readonly depEntityTypeMap!: Map<EntityType, number>;

  /**
   * 是否把查询结果按实体或实体数组自动缓存
   */
  readonly autoCache: boolean;

  /**
   * 刷新触发流
   * 每次刷新时发送刷新次数，用于触发查询重新执行
   */
  readonly refresh$ = this.#refresh_sub.asObservable();

  /**
   * 查询销毁流
   * 当查询任务被销毁时触发
   */
  readonly destroy$ = this.#destroy_sub.asObservable();

  /**
   * 关联实体类型集合
   * 存储查询中涉及到的所有关联实体类型
   */
  readonly relationEntityTypes = new Set<EntityType>();

  /**
   * 查询的实体 ID 集合
   */
  readonly resultEntityIds = new Set<EntityStaticType<T, 'idType'>>();

  /**
   * 查询的实体集合
   * 存储查询结果中包含的所有实体实例
   */
  readonly resultEntitySet = new Set<InstanceType<T>>();

  /**
   * 查询类型
   */
  readonly type:
    | 'get'
    | 'findOne'
    | 'findOneOrFail'
    | 'find'
    | 'findAll'
    | 'findByCursor'
    | 'count'
    | 'findDescendants'
    | 'findAncestors'
    | 'countDescendants'
    | 'countAncestors'
    | 'findNeighbors'
    | 'countNeighbors'
    | 'findPaths';

  /**
   * 查询选项
   */
  readonly options: QueryOptions<T>['options'];

  /**
   * 观察者数量
   * 记录当前有多少个订阅者正在监听此查询结果
   */
  observerCount = 0;
  /**
   * 刷新次数
   * 记录查询被刷新执行的总次数
   */
  refreshCount = 0;
  /**
   * 查询结果
   * 缓存的最新查询结果数据
   */
  result?: RT;

  /**
   * 结果指纹计算方法
   */
  getFingerprint: (result: RT) => Fingerprint[];

  /**
   * 查询结果流
   * 通过 Observable 发送查询结果的响应式流
   */
  result$!: Observable<RT>;

  constructor(opt: QueryTaskOptions<T, RT>) {
    this.type = opt.options.type;
    this.options = opt.options.options;
    this.runner = opt.runner;
    this.cacheKey = opt.cacheKey;
    this.entityType = opt.entityType;
    this.rxdb = opt.rxdb;
    this.depEntityTypeMap = opt.depEntityTypeMap;
    this.serialize = opt.serialize;
    this.onClean = opt.onClean;
    this.getFingerprint = opt.getFingerprint;
    this.autoCache = opt.autoCache ?? true;
    this.relationEntityTypes.add(opt.entityType);
    for (const EntityType of opt.relationEntityTypes ?? []) {
      this.relationEntityTypes.add(EntityType);
    }
  }

  /**
   * 清理任务资源
   *
   * @remarks
   * 先完成观察者再拆管道：正常退订路径走到这里时 `observers` 已经空了，但
   * `QueryManager.destroy()` 会在仍有订阅者时清理任务 —— 不 `complete()` 的话
   * 这些订阅者既收不到新数据也永远不会结束，`toArray()` / `lastValueFrom()` 之类
   * 等终止信号的算子会永久挂起。
   */
  clean = (): void => {
    if (this.#cleaned) return;
    this.#cleaned = true;
    this.observers.forEach(observer => observer.complete());
    this.observers.clear();
    this.#destroy_sub.next();
    this.#destroy_sub.complete();
    // 清理实体依赖计数（仅当 run() 中累加过才递减，避免无 where 查询导致计数为负）
    if (this.#deps_counted) {
      this.#deps_counted = false;
      this.relationEntityTypes.forEach(EntityType => {
        const count = this.depEntityTypeMap.get(EntityType);
        if (count !== undefined) {
          const nextCount = count - 1;
          // 计数归零时删除 key：QueryManager 的事件过滤只用 has() 判断，
          // 保留 0 会让已释放的依赖继续通过第一层过滤
          if (nextCount > 0) {
            this.depEntityTypeMap.set(EntityType, nextCount);
          } else {
            this.depEntityTypeMap.delete(EntityType);
          }
        }
      });
    }
    this.onClean(this.cacheKey);
  };

  /**
   * 首次运行查询任务
   */
  run = (): void => {
    if (this.#is_first_run === true) return;
    this.#is_first_run = true;

    const where =
      this.options && typeof this.options === 'object' && 'where' in this.options ? this.options.where : undefined;

    // 分析查询依赖的实体类型
    if (isRuleGroup<InstanceType<T>>(where)) {
      query_entity_type_dependencies(this.rxdb, where, this.entityType, this.relationEntityTypes);
    }
    // 插件可在首次订阅前追加不来自 where 的物理依赖（例如图边表）。无 where 时也必须计数。
    this.relationEntityTypes.forEach(EntityType => {
      const count = this.depEntityTypeMap.get(EntityType) || 0;
      this.depEntityTypeMap.set(EntityType, count + 1);
    });
    this.#deps_counted = true;
    // 建立响应式查询流
    this.refresh$
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged(),
        tap(() => this.refreshCount++),
        switchMap(() => {
          const startedAtVersion = this.#local_result_version;
          return this.runner().pipe(
            tap(data => this.#next_from_runner(data, startedAtVersion)),
            // 一轮查询失败只终结这一轮。错误照常送达观察者（RxJS 契约要求，
            // 观察者由此关闭并触发退订清理），但**不能**顺着 switchMap 冒到外层：
            // 冒上去整条 `refresh$` 管道就被终结，此后 `refresh()` 静默空转 ——
            // 实体变更事件、手动刷新一律无效，而任务仍留在 QueryManager 的缓存表里，
            // 后来的订阅者热启动拿到冻结的陈旧结果、且永远等不到下一次更新。
            // 适配器抖动、远端超时这类瞬时失败不该让一个活查询永久死掉。
            catchError(error => {
              this.error(error);
              return EMPTY;
            })
          );
        })
      )
      .subscribe({
        // catchError 之后这里只剩上游操作符自身的异常。留着是因为没有 error 处理器时
        // RxJS 会把它抛成全局未处理错误，而不是因为它还兜着运行器的失败。
        error: error => {
          this.error(error);
        }
      });
  };

  /**
   * 发送结果给所有观察者
   * @param result 查询结果
   * @param autoCache 是否自动缓存结果实体
   */
  next = (result: RT, autoCache = true): void => {
    this.#local_result_version++;
    this.#next(result, autoCache);
  };

  /**
   * 发送错误给所有观察者
   */
  error = (err: unknown): void => {
    this.observers.forEach(observer => observer.error(err));
  };

  /**
   * 手动刷新查询
   */
  refresh = (): void => {
    this.#refresh_sub.next(this.refreshCount + 1);
  };

  #next_from_runner = (result: RT, startedAtVersion: number): void => {
    if (startedAtVersion !== this.#local_result_version) return;
    this.#next(result, this.autoCache);
  };

  #next = (result: RT, autoCache: boolean): void => {
    // 计算结果指纹，判断结果是否变化
    const fingerprint = this.getFingerprint(result);

    // 特殊处理：首次结果必须通知（即使是空数组）
    const isFirstResult = this.result === undefined;

    if (
      !isFirstResult &&
      this.#result_fingerprint.length === fingerprint.length &&
      this.#result_fingerprint.every((v, i) => v === fingerprint[i])
    ) {
      // 结果未变化，跳过通知
      return;
    }
    this.#result_fingerprint = fingerprint;
    this.result = result;
    if (autoCache) {
      this.resultEntitySet.clear();
      this.resultEntityIds.clear();
      if (Array.isArray(result)) {
        result.forEach(entity => {
          const e = entity as InstanceType<T>;
          this.resultEntitySet.add(e);
          this.resultEntityIds.add(e.id);
        });
      } else if (result && typeof result === 'object' && 'id' in result) {
        const e = result as InstanceType<T>;
        this.resultEntitySet.add(e);
        this.resultEntityIds.add(e.id);
      }
    }
    // 通知所有观察者
    this.observers.forEach(observer => observer.next(result));
  };
}
