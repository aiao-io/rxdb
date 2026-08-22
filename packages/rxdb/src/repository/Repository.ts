import { combineLatest, firstValueFrom, map, Observable, shareReplay, switchMap, tap } from 'rxjs';
import { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import { SyncOptions, SyncType } from '../entity/metadata-options.interface.js';
import { selectPrimaryAdapterKind } from '../entity/primary-adapter.js';
import type { RawQueryResult } from '../rxdb-adapter.js';
import { getEntityMetadata, getEntityStatus } from '../rxdb-utils.js';
import { RxDB } from '../RxDB.js';
import { RxDBError } from '../RxDBError.js';
import { getFingerprintByEntities, getFingerprintByEntity, getFingerprintPrimitive } from './fingerprint.utils.js';

import {
  CountOptions,
  FindAllOptions,
  FindByCursorOptions,
  FindOneOptions,
  FindOneOrFailOptions,
  FindOptions,
  OrderBy
} from './query-options.interface.js';
import { createQueryCachePrimary, QueryCachePrimaryLocalAdapter } from './query-cache-primary.js';
import { QueryCacheSyncMemo } from './query-cache-sync-memo.js';
import { Rule, RuleGroup } from './query.interface.js';
import type { QueryCacheRemoteAdapter } from './QueryCacheRepository.js';
import { QueryManager } from './QueryManager.js';
import { IRepository } from './repository.interface.js';
import { RepositoryBase } from './RepositoryBase.js';

/**
 * 校验分页参数为非负安全整数。
 *
 * @remarks
 * RAN-003：`limit: 0` 是**合法**的「返回空集」（见 {@link Repository.find} 的归一化注释），
 * 但除此之外一直没有契约。负数在 SQLite 里就是 `LIMIT -1` —— 语义是**不限**，
 * 于是「只读一页」被静默翻译成全表读取，自动触底的无限滚动会一次拉完整张表；
 * 小数 / `NaN` / `Infinity` 在各适配器间行为不一致。
 *
 * 三个框架绑定层（`rxdb-angular` / `rxdb-react` / `rxdb-vue`）都只做 `?? 100`，
 * 各自补校验必然漂移，因此收在核心公开入口一次做完：非法值 fail-fast，
 * 而不是让它继续往适配器走。
 */
const assertPageBound = (field: 'limit' | 'offset', value: number | undefined): void => {
  if (value === undefined) return;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RxDBError(`${field} must be a non-negative safe integer, received: ${value}`);
  }
};

/**
 * 实体仓库
 * 根据配置决策实体的具体操作
 */
export class Repository<T extends EntityType, RT extends IRepository<T> = IRepository<T>> extends RepositoryBase<T> {
  protected static override _STATIC_METHODS = [
    ...super._STATIC_METHODS,
    'get',
    'findOneOrFail',
    'find',
    'findOne',
    'findByCursor',
    'findAll',
    'count'
  ];

  /**
   * 本地仓库
   */
  protected readonly local$!: Observable<RT>;

  /**
   * 远程仓库
   */
  protected readonly remote$!: Observable<IRepository<T>>;

  /**
   * 主仓库（根据 SyncOptions 选择 local 或 remote）
   * - SyncType.None + 只有 remote：使用 remote$
   * - 其他情况：使用 local$
   */
  protected readonly primary$!: Observable<RT>;

  /**
   * 查询缓存管理器
   */
  protected readonly queryManager!: QueryManager<T>;

  /**
   * 同步配置
   */
  readonly sync!: SyncOptions;

  constructor(rxdb: RxDB, EntityType: T) {
    super(rxdb, EntityType);
    // 初始化 local$ 和 remote$（必须在 super() 之后，因为需要 this.rxdb）
    // 带引用计数的缓存：订阅归零即释放，否则这层缓存会把 `rxdb.localAdapter$` 的引用计数
    // 永久钉在 1 以上，使上游的适配器缓存永远不会释放 —— 断连重连后仓储仍打向已断开的旧适配器。
    // 适配器侧的 `getRepository()` 按 EntityType 缓存，重新求值不会新建仓储实例。
    this.local$ = this.rxdb.localAdapter$.pipe(
      map(adapter => adapter.getRepository<T, RT>(this.EntityType)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    this.remote$ = this.rxdb.remoteAdapter$.pipe(
      map(adapter => adapter.getRepository(this.EntityType)),
      shareReplay({ bufferSize: 1, refCount: true })
    );
    const metadata = getEntityMetadata(EntityType);
    this.sync = metadata.sync || rxdb.config.sync;
    // QueryCache 不是「选 local 还是 remote 一侧」的问题：它的读是 metadata-diff + 增量 pull，
    // 写是 remote-then-local，两者都跨两侧。因此在 `selectPrimaryAdapterKind` 之前分流，
    // 而不是给那个枚举加第三种 kind —— 适配器模型仍然只有两侧。
    // 判据只有一份，批量入口（EntityManager.mutations）走的是同一个函数
    this.primary$ =
      this.sync?.type === SyncType.QueryCache ?
        (this.#createQueryCachePrimary(
          metadata.name,
          this.sync.local.localCacheFirst === true,
          // 记忆归 `Repository` 持有：主仓储随适配器流每次发射重建，放在它身上等于没有记忆
          new QueryCacheSyncMemo(this.sync.local.syncStaleTime)
        ) as Observable<RT>)
      : selectPrimaryAdapterKind(this.sync) === 'remote' ? (this.remote$ as Observable<RT>)
      : (this.local$ as Observable<RT>);
    this.queryManager = new QueryManager<T>(rxdb, EntityType, this);
  }

  destroy() {
    this.queryManager.destroy();
  }


  /**
   * 根据 id 获取实体
   * @param id 实体的唯一标识符
   */
  get(id: EntityStaticType<T, 'idType'>): Observable<InstanceType<T>> {
    const options: FindOptions<T> = {
      where: {
        combinator: 'and',
        rules: [
          {
            field: 'id',
            operator: '=',
            value: id
          }
        ]
      },
      limit: 1
    };
    const runner = () =>
      this.primary$.pipe(
        switchMap(repo => repo.find({ ...options, limit: 1 })),
        map(d => {
          if (d.length === 0) throw new RxDBError(`Entity with id ${id} not found`);
          return d[0];
        }),
        tap(entity => this._setLocal(entity))
      );
    return this.queryManager.createTask({
      options: { type: 'get', options: id },
      runner,
      getFingerprint: getFingerprintByEntity
    }).result$;
  }

  /**
   * 查找一个实体
   * @param options 查询选项，包含 where 条件
   */
  findOne(options: FindOneOptions<T>): Observable<InstanceType<T> | null> {
    const runner = () =>
      this.primary$.pipe(
        switchMap(repo => repo.find({ ...options, limit: 1 })),
        map(d => d[0] || null),
        tap(entity => entity && this._setLocal(entity))
      );
    return this.queryManager.createTask({
      options: { type: 'findOne', options },
      runner,
      getFingerprint: getFingerprintByEntity
    }).result$;
  }

  /**
   * 查找一个实体，查不到就抛出错误
   * @param options 查询选项，包含 where 条件
   */
  findOneOrFail(options: FindOneOrFailOptions<T>): Observable<InstanceType<T>> {
    const runner = () =>
      this.primary$.pipe(
        switchMap(repo => repo.find({ ...options, limit: 1 })),
        map(d => {
          if (d.length === 0) throw new RxDBError(`Entity not found for query: ${JSON.stringify(options.where)}`);
          return d[0];
        }),
        tap(entity => this._setLocal(entity))
      );
    return this.queryManager.createTask({
      options: { type: 'findOneOrFail', options },
      runner,
      getFingerprint: getFingerprintByEntity
    }).result$;
  }

  /**
   * 查询多个实体
   * @param options 查询选项，包含 where 条件、limit、offset 等
   */
  find(options: FindOptions<T>): Observable<InstanceType<T>[]> {
    assertPageBound('limit', options.limit);
    assertPageBound('offset', options.offset);
    // 缓存键与增量合并都用归一化后的 options：缺省与显式传默认值下发适配器的参数逐字相同，
    // 就必须命中同一个任务（`QueryManager.createTask` 的 key 正是这个对象的确定性序列化）。
    // 归一化只作用于本地副本，不写回调用方的 options（ ，与 `findByCursor` 一致）。
    //
    // `?? 100` 而非 `|| 100`：`limit: 0` 的语义是「返回空集」，是合法值不是「没传」。
    // 适配器层已支持（sqlite-core 生成 `LIMIT 0`），框架绑定层也保留 0
    // （`rxdb-react` 的 useInfiniteScroll），核心层不能在中间把它改写成 100
    const normalized: FindOptions<T> = { ...options, limit: options.limit ?? 100, offset: options.offset ?? 0 };
    const runner = () =>
      this.primary$.pipe(
        switchMap(repo => repo.find(normalized)),
        tap(this._setLocals)
      );
    // `onSyncStats` 不进缓存键：`deterministicStringify` 明确拒绝函数值（同源闭包捕获不同值也会
    // 得到同一个 key，等于把碰撞藏起来）。观测回调本来也不构成查询身份 —— 置 `undefined` 而不是
    // 删键，序列化会跳过 `undefined` 值，于是「传了回调」与「没传」得到逐字相同的 key。
    // 代价是同一 `where` 的并发查询共用任务时，只有先到的那次回调会被触发（已写进 TSDoc）。
    const keyOptions: FindOptions<T> = { ...normalized, onSyncStats: undefined };
    return this.queryManager.createTask({
      options: { type: 'find', options: keyOptions },
      runner,
      getFingerprint: getFingerprintByEntities
    }).result$;
  }

  /**
   * 查询所有实体
   * @param options 查询选项，包含 where 条件和排序（不限制数量）

   */
  findAll(options: FindAllOptions<T>): Observable<InstanceType<T>[]> {
    const runner = () =>
      this.primary$.pipe(
        switchMap(repo => repo.find(options)),
        tap(this._setLocals)
      );
    return this.queryManager.createTask({
      options: { type: 'findAll', options },
      runner,
      getFingerprint: getFingerprintByEntities
    }).result$;
  }

  /**
   * 通过游标进行分页查询
   * @param options 游标分页选项，包含 orderBy、before/after 游标
   *
   * @remarks
   * `before`（反向翻页）需要**反转排序后再查**：`limit` 在 SQL 里永远从结果集开头截取，
   * 保持调用方的正向排序就只会拿到整个集合最靠前的那一页，而不是紧挨游标之前的一页。
   * 因此下发适配器时反转 `orderBy`，返回调用方之前再把数组还原成调用方要求的顺序 ——
   * 增量合并（`merge_create.ts` 的 findByCursor 分支）也按 `options.orderBy` 排序后切片，
   * 两侧必须同序。
   */
  findByCursor(options: FindByCursorOptions<T>): Observable<InstanceType<T>[]> {
    // 验证必需的参数
    if (!options.orderBy?.length) {
      throw new RxDBError('orderBy is required for cursor-based pagination');
    }
    const lastOrderBy = options.orderBy[options.orderBy.length - 1];
    if (lastOrderBy.field !== 'id') {
      throw new RxDBError('orderBy must end with id field for cursor-based pagination');
    }
    if (options.before && options.after) {
      throw new RxDBError('before and after cannot be used together in cursor-based pagination');
    }
    assertPageBound('limit', options.limit);
    // limit 归一化只作用于本地副本，且必须在游标判定**之前**：原实现写在
    // `_generate_cursor_rule_group` 里、位于 `if (!cursor) return null` 之后 ——
    // 首页因此不带 limit 落到适配器（整表读），而调用方的 options 被就地写上了 100。
    // `?? 100`：同 find，`limit: 0` 是合法的「返回空集」而非「没传」
    const normalized: FindByCursorOptions<T> = { ...options, limit: options.limit ?? 100 };
    let new_where = structuredClone(options.where);
    const cursorRuleGroup = _generate_cursor_rule_group(normalized);
    if (cursorRuleGroup) {
      new_where = _merge_cursor_rule_group(new_where, cursorRuleGroup);
    }
    // 反向翻页：反转下发的排序（不改调用方数组），结果按原序还原
    const isBefore = !!options.before;
    const orderBy = isBefore ? _invert_order_by(normalized.orderBy) : normalized.orderBy;
    const runner = () =>
      this.primary$.pipe(
        switchMap(repo => repo.find({ ...normalized, where: new_where, orderBy })),
        map(entities => (isBefore ? [...entities].reverse() : entities)),
        tap(this._setLocals)
      );
    // 缓存键与增量合并都用归一化后的 options：limit 缺省与显式传 100 应命中同一个任务，
    // 且 orderBy 保持调用方的方向（合并逻辑据此排序）
    return this.queryManager.createTask({
      options: { type: 'findByCursor', options: normalized },
      runner,
      getFingerprint: getFingerprintByEntities
    }).result$;
  }

  /**
   * 查询实体数量
   * @param options 查询选项，包含 where 条件
   */
  count(options: CountOptions<T>): Observable<number> {
    const runner = () => this.primary$.pipe(switchMap(repo => repo.count(options)));
    return this.queryManager.createTask({
      options: { type: 'count', options },
      runner,
      getFingerprint: getFingerprintPrimitive
    }).result$;
  }

  /**
   * 创建实体
   * @param entity 要创建的实体实例
   */
  create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const observer = this.primary$.pipe(
      switchMap(repo => repo.create(entity)),
      tap(this._setLocal)
    );
    return firstValueFrom(observer);
  }

  /**
   * 更新实体
   * @param entity 要更新的实体实例
   * @param patch 部分更新数据
   */
  update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const observer = this.primary$.pipe(
      switchMap(repo => repo.update(entity, patch)),
      tap(this._setLocal)
    );
    return firstValueFrom(observer);
  }

  /**
   * 删除实体
   * @param entity 要删除的实体实例
   */
  remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const observer = this.primary$.pipe(switchMap(repo => repo.remove(entity)));
    return firstValueFrom(observer);
  }

  /**
   * 执行原始 SQL 查询
   * 用于条件 UPDATE 等需要绕过 ORM 的场景
   * @param sql SQL 语句
   * @param params 绑定参数
   */
  protected async rawQuery(sql: string, params?: unknown[]): Promise<RawQueryResult> {
    const adapter = await firstValueFrom(this.rxdb.localAdapter$);
    if (!adapter.rawQuery) {
      throw new RxDBError('rawQuery is not supported by the current adapter');
    }
    return adapter.rawQuery(sql, params);
  }

  /**
   * 设置状态 local
   */
  protected _setLocal = (entity: InstanceType<T>) => {
    const status = getEntityStatus(entity);
    status.local = true;
    status.modified = false;
  };
  protected _setLocals = (entities: InstanceType<T>[]) => entities.forEach(this._setLocal);

  /**
   * 构造 QueryCache 主仓储流。
   *
   * @param entityName - 元数据里的实体名（打包压缩后 `EntityType.name` 不可靠）
   * @param localCacheFirst - `sync.local.localCacheFirst`，由调用点在联合类型已收窄处取出
   * @param syncMemo - 「刚同步过」的记忆（US-020 D13），生命周期跟着本 `Repository`
   *
   * @remarks
   * 两侧适配器都从流里取、每次发射重建仓储，理由与 `local$` / `remote$` 相同：
   * 在构造期 `firstValueFrom` 固化实例，会把上游适配器缓存的引用计数永久钉住，
   * 断连重连后仍打向已断开的旧适配器。适配器能力校验放在 `map` 里，
   * 于是「缺 duck」在**首次真正用到它的调用**上抛出，而不是在配置期误伤。
   *
   * 正因为「每次发射重建」，同步记忆不能放在主仓储里 —— 订阅归零再订阅也会重建，
   * 那样记忆活不过一次 `find`。这里把它交给主仓储、并在每次发射时对表：适配器实例
   * 换了（断连重连，AC#22）即清空，没换则继续沿用。
   */
  #createQueryCachePrimary(
    entityName: string,
    localCacheFirst: boolean,
    syncMemo: QueryCacheSyncMemo
  ): Observable<IRepository<T>> {
    return combineLatest([this.rxdb.localAdapter$, this.rxdb.remoteAdapter$]).pipe(
      map(([localAdapter, remoteAdapter]) => {
        syncMemo.bindAdapters(localAdapter, remoteAdapter);
        return createQueryCachePrimary<T>(
          entityName,
          this.EntityType,
          localAdapter as unknown as QueryCachePrimaryLocalAdapter<T>,
          remoteAdapter as unknown as QueryCacheRemoteAdapter,
          localCacheFirst,
          syncMemo
        );
      }),
      shareReplay({ bufferSize: 1, refCount: true })
    );
  }
}

/**
 * 反转排序方向
 *
 * @param orderBy - 调用方声明的排序
 * @returns 逐项反转 `sort` 的新数组，入参不被修改
 *
 * @remarks
 * 只服务反向翻页（`before`）：`limit` 只会从结果集开头截取，要拿到「紧挨游标之前的一页」
 * 就得让那一页排在开头。入参数组同时是缓存键与增量合并的排序依据，因此必须返回新数组
 * 而不是就地 `reverse()`。
 */
const _invert_order_by = <W extends string>(orderBy: OrderBy<W>[]): OrderBy<W>[] =>
  orderBy.map(order => ({ ...order, sort: order.sort === 'asc' ? 'desc' : 'asc' }) as OrderBy<W>);

/**
 * 生成 findByCursor 查询的游标规则组
 * @param options 游标查询选项（只读，比较符按**调用方声明的**排序方向推导）
 * @returns 游标规则组或 null
 *
 * 对于多字段排序，生成正确的 OR 条件：
 * (field1 > val1) OR (field1 = val1 AND field2 > val2) OR (field1 = val1 AND field2 = val2 AND field3 > val3)
 */
const _generate_cursor_rule_group = <T extends EntityType>(
  options: FindByCursorOptions<T>
): RuleGroup<InstanceType<T>> | null => {
  const cursor = options.after || options.before;
  if (!cursor) return null;

  const isAfter = !!options.after;

  // 对于单字段排序，使用简单的比较
  if (options.orderBy.length === 1) {
    const { field, sort } = options.orderBy[0];
    const isAscending = sort === 'asc';
    const useGreater = isAscending === isAfter;
    const operator = useGreater ? '>' : '<';

    return {
      combinator: 'and',
      rules: [{ field, operator, value: cursor[field] }]
    };
  }

  // 对于多字段排序，生成 OR 条件
  const orRules: RuleGroup<InstanceType<T>>[] = [];

  for (let i = 0; i < options.orderBy.length; i++) {
    const { field, sort } = options.orderBy[i];
    const isAscending = sort === 'asc';
    const useGreater = isAscending === isAfter;

    const andRules: Rule<InstanceType<T>>[] = [];

    // 前面的字段都用 = 比较
    for (let j = 0; j < i; j++) {
      const prevField = options.orderBy[j].field;
      andRules.push({ field: prevField, operator: '=', value: cursor[prevField] });
    }

    // 当前字段用 > 或 < 比较
    const operator = useGreater ? '>' : '<';
    andRules.push({ field, operator, value: cursor[field] });

    orRules.push({ combinator: 'and', rules: andRules });
  }

  return { combinator: 'or', rules: orRules };
};

/**
 * 合并游标规则组到主查询条件
 */
const _merge_cursor_rule_group = <T>(where: RuleGroup<T>, cursorRuleGroup: RuleGroup<T>): RuleGroup<T> => {
  if (where.combinator === 'and') {
    return { ...where, rules: [...where.rules, cursorRuleGroup] };
  }
  return { combinator: 'and', rules: [where, cursorRuleGroup] };
};
