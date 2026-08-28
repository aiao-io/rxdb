/**
 * @packageDocumentation
 * QueryCache 的主仓储适配层 —— 把 {@link QueryCacheRepository} 的 Observable / 裸数据面
 * 转成 {@link IRepository} 的 Promise / 实体实例面。
 *
 * @remarks
 * 为什么是「适配」而不是「换实现」（US-020 D9）：`getRepository(E)` 的公开面由 `IRepository`
 * 与 `Repository._STATIC_METHODS` 定死 —— 8 个静态入口、Promise 返回、`remove(entity)`。
 * `QueryCacheRepository` 三样都不同（2 个入口、Observable、`delete(ids)`）。把它直接顶到
 * `config.class` 上会让 `await Entity.create()` 拿到 Observable、静态入口凭空少 6 个。
 * 因此 `Repository` 仍是门面，只把 `primary$` 换成本文件的实现。
 *
 * 读路径的最终出口是**本地 `IRepository`**（US-020 D8），不是 `QueryCacheLocalAdapter` 上的
 * `findAll?` / `findByIds?` 两个 optional duck。同步跑完后本地缓存对该 `where` 是完整的，
 * 于是 `limit` / `offset` / `orderBy` 可以原样下推成 SQL —— 既拿到实体实例，
 * 又不必把整表读进内存做 JS 过滤。
 */
import { firstValueFrom, map, Observable } from 'rxjs';
import type { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../entity/metadata-options.interface.js';
import type { ReachabilityMonitor } from '../network/reachability.js';
import { RxDBQueryCacheCapabilityError } from '../RxDBError.js';
import { isNetworkError } from './network-error.js';
import { queryCacheFingerprint, QueryCacheSyncMemo } from './query-cache-sync-memo.js';
import type { RuleGroup } from './query.interface.js';
import type {
  QueryCacheLocalAdapter,
  QueryCacheLocalReader,
  QueryCacheRemoteAdapter,
  SyncStats
} from './QueryCacheRepository.js';
import { QueryCacheRepository } from './QueryCacheRepository.js';
import type { IRepository } from './repository.interface.js';

/** 远端适配器必须提供的 QueryCache duck（`RxDBAdapterRemoteBase` 的 `abstract` 成员） */
const REMOTE_DUCKS = ['fetchMetadata', 'findByIds'] as const;

/** 本地适配器必须提供的 QueryCache duck（`RxDBAdapterLocalBase` 的 `abstract` 成员） */
const LOCAL_DUCKS = ['getMetadataByIds', 'upsertMany', 'deleteByIds'] as const;

/** 本地适配器：QueryCache 的三个 duck，外加取行仓储的入口 */
export type QueryCachePrimaryLocalAdapter<T extends EntityType> = QueryCacheLocalAdapter & {
  getRepository(EntityType: T): IRepository<T>;
};

/** `QueryCacheRepository.find` 的入参 */
type QueryCacheSyncOptions = Parameters<QueryCacheRepository['find']>[0];

/**
 * `FindOptions` 里 QueryCache 关心的字段。
 *
 * @remarks
 * `EntityStaticType<T, 'findOptions'>` 默认擦成 `FindOptions<T, object>`，`where` 的类型信息
 * 在那一步就丢了，因此读这三个字段时统一在这里收窄，而不是散着写 `as { where: ... }`。
 */
interface QueryCacheFindHints<T extends EntityType> {
  where: RuleGroup<InstanceType<T>>;
  localCacheFirst?: boolean;
  offlineFallback?: boolean;
  onSyncStats?: (stats: SyncStats) => void;
}

const missingMembers = (target: object, members: readonly string[]): string[] =>
  members.filter(member => typeof (target as Record<string, unknown>)[member] !== 'function');

/** 远端写动词，与 {@link QueryCacheRemoteAdapter} 上的可选方法名一一对应 */
type RemoteWriteVerb = 'create' | 'update' | 'delete';

/**
 * `#tryRemote` 的第三种结局：远端不可达，调用方应当改走本地。
 *
 * @remarks
 * 用哨兵而不是 `null` / `undefined`：远端写的结果类型由调用点决定，
 * 而 `delete` 这种本来就没有返回值的动词会让「空值」同时意味着成功和离线。
 */
const OFFLINE = Symbol('query-cache-offline');

/**
 * 校验两侧适配器具备 QueryCache 同步流程所需的全部能力。
 *
 * @param entity - 实体名，用于错误消息
 * @param localAdapter - 本地适配器
 * @param remoteAdapter - 远端适配器
 * @throws {@link RxDBQueryCacheCapabilityError} 任一侧缺任一必需 duck
 *
 * @remarks
 * 继承适配器基类时这五个成员是 `abstract`，编译期即保证存在，本函数恒通过。
 * 它真正的服务对象是不继承基类的自定义适配器对象 —— 那里没有编译期约束，
 * 而缺失的后果（缓存读不出来被当成「远端没有数据」）是静默的。
 */
export function assertQueryCacheCapabilities(entity: string, localAdapter: object, remoteAdapter: object): void {
  const missingLocal = missingMembers(localAdapter, LOCAL_DUCKS);
  if (missingLocal.length > 0) {
    throw new RxDBQueryCacheCapabilityError(entity, 'local', missingLocal);
  }
  const missingRemote = missingMembers(remoteAdapter, REMOTE_DUCKS);
  if (missingRemote.length > 0) {
    throw new RxDBQueryCacheCapabilityError(entity, 'remote', missingRemote);
  }
}

/**
 * QueryCache 策略下的主仓储。
 *
 * @typeParam T - 实体类型
 *
 * @remarks
 * 每次适配器流发射都会新建一个实例（见 `Repository` 的 `primary$`），因此本类**不缓存**
 * 适配器以外的任何状态 —— 断连重连后旧实例连同旧适配器一起被丢弃。
 */
export class QueryCachePrimaryRepository<T extends EntityType> implements IRepository<T> {
  readonly #cache: QueryCacheRepository;

  constructor(
    private readonly entityName: string,
    private readonly localRepository: IRepository<T>,
    private readonly remoteAdapter: QueryCacheRemoteAdapter,
    localAdapter: QueryCacheLocalAdapter,
    /** `sync.local.localCacheFirst`：是否走 stale-while-revalidate */
    private readonly localCacheFirst: boolean,
    /** 「刚同步过」的记忆；由 `Repository` 持有，跨本类实例存活（US-020 D13） */
    private readonly syncMemo: QueryCacheSyncMemo,
    /** 远端可达性；写路径据此决定先打远端还是先落本地，生命周期跟着 `RxDB` 实例 */
    private readonly reachability: ReachabilityMonitor
  ) {
    // 本地行仓储既是同步流程的读出口（US-020 D8），也是同步跑完后门面读结果的地方。
    // `QueryCacheRepository` 按 `entityName` 工作、填不出 `IRepository` 的类型参数，
    // 因此在这一层收窄成只有 `find` 的读端口。
    this.#cache = new QueryCacheRepository(
      entityName,
      remoteAdapter,
      localAdapter,
      localRepository as QueryCacheLocalReader<InstanceType<T>>
    );
  }

  /**
   * 查询多个实体：先跑增量同步，再从本地读。
   *
   * @param options - 查询选项；`where` 决定同步范围，`limit` / `offset` / `orderBy` 下推本地
   * @returns 实体实例数组
   *
   * @remarks
   * 同步范围是整个 `where`，与 `limit` 无关 —— `fetchMetadata` 的粒度就是 `where`。
   * 因此 QueryCache 适合用 `where` 收窄的有界结果集；靠 `limit` 收窄会拉取放大
   * （可用 `onSyncStats` 的 `remoteCount` 观测）。同一 `where` 在
   * `sync.local.syncStaleTime` 窗口内翻第二页不会再同步一次（D13）。
   */
  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    const { where, localCacheFirst, offlineFallback, onSyncStats } = options as QueryCacheFindHints<T>;
    await this.#sync({
      where,
      // 调用 > 配置 > false（US-020 AC#24）：`??` 而非 `||`，显式的 `false` 必须压过配置的 `true`
      localCacheFirst: localCacheFirst ?? this.localCacheFirst,
      // 只有调用级：离线降级是「这一次读能不能吃陈旧数据」的决定，没有配置级默认——
      // 全局打开会让所有读在断网时静默返回缓存，故障被推迟到不知道多久以后才暴露。
      offlineFallback,
      onSyncStats
    });
    return this.localRepository.find(options);
  }

  /**
   * 查询实体数量。
   *
   * @param options - 查询选项
   * @returns 远端权威的行数
   *
   * @remarks
   * 取远端元数据的基数而不是同步后再 `COUNT` 本地：元数据只有 `id` + `updatedAt`，
   * 数一个数不需要把行拉下来。
   */
  async count(options: EntityStaticType<T, 'countOptions'>): Promise<number> {
    const where = (options as { where: RuleGroup<InstanceType<T>> }).where;
    const metadata = await this.#fetchMetadata(where);
    return metadata.length;
  }

  /**
   * 创建实体：远端可达时先远端后本地缓存，不可达时直接落本地并排进出站队列。
   *
   * @param entity - 待创建的实体实例
   * @returns 合并了服务端（或本地）返回字段的同一实体实例
   * @throws 远端返回的**非网络**错误（401 / 唯一键冲突 / 字段校验……）原样上抛，本地不落盘
   */
  async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const created = await this.#tryRemote('create', () => this.#cache.create(entity));
    const settled = created === OFFLINE ? await this.localRepository.create(entity) : created;
    this.syncMemo.clear();
    return Object.assign(entity, settled);
  }

  /**
   * 更新实体：远端可达时先远端后本地缓存，不可达时直接落本地并排进出站队列。
   *
   * @param entity - 待更新的实体实例（提供 `id`）
   * @param patch - 字段级 patch
   * @returns 合并了服务端（或本地）返回字段的同一实体实例
   * @throws 远端返回的**非网络**错误原样上抛，本地不更新
   */
  async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const updated = await this.#tryRemote('update', () => this.#cache.update(entityId(entity), patch));
    const settled = updated === OFFLINE ? await this.localRepository.update(entity, patch) : updated;
    this.syncMemo.clear();
    return Object.assign(entity, settled);
  }

  /**
   * 删除实体：远端可达时先远端后本地缓存，不可达时直接删本地并排进出站队列。
   *
   * @param entity - 待删除的实体实例
   * @returns 入参实体
   * @throws 远端返回的**非网络**错误原样上抛，本地缓存不动
   */
  async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const removed = await this.#tryRemote('delete', () => this.#cache.delete(entityId(entity)).pipe(map(() => entity)));
    if (removed === OFFLINE) {
      await this.localRepository.remove(entity);
    }
    this.syncMemo.clear();
    return entity;
  }

  /**
   * 作废在飞查询，让下一次同指纹的读重新回远端（US-023 D13）。
   *
   * @remarks
   * 作废**不是**取消：已经订阅的调用方照常拿到它们那次的结果，只是这条流不再被
   * 后来者复用。远端失效上报到达时，正在飞的那次拉取问的是失效前的远端状态，
   * 让重跑复用它等于让失效原地失灵。
   */
  invalidateInflight(): void {
    this.#cache.invalidateInflight();
  }

  /**
   * 尝试一次远端写，并把结果上报给可达性监视器。
   *
   * @param verb - 远端写动词，用于能力校验与错误消息
   * @param write - 远端写流的工厂；只在确实要打远端时才求值
   * @returns 远端成功时返回其结果；判定为不可达时返回 {@link OFFLINE}，调用方改走本地
   * @throws 远端不支持该动词，或远端返回了非网络错误
   *
   * @remarks
   * 三步的顺序是有意的：
   *
   * 1. **动词缺失先于连通性**。动词缺失与网速无关 —— 远端压根没有这个入口，
   *    降级落本地只会排出一条永远重放不回去的出站行，把「配置漏了」拖成一次静默的数据丢失。
   * 2. **已知离线时跳过远端**。断网时那次调用注定失败，只是让每一次写都先卡一个超时。
   * 3. **失败按 {@link isNetworkError} 分流**，与读路径的 `#wrapWithOfflineFallback`
   *    （US-020 AC#16）逐字一致：拿到状态码就说明连接是通的，401 / 422 是远端给出的回答，
   *    把它们降级成本地写等于把一次被拒绝的写伪装成成功。拿不准的错误一律**不**算网络错误。
   *
   * 成功也要上报：那是「已恢复」的唯一证据，没有它，离线期间第一次成功的重试无法把状态翻回来。
   */
  async #tryRemote<R>(verb: RemoteWriteVerb, write: () => Observable<R>): Promise<R | typeof OFFLINE> {
    if (typeof this.remoteAdapter[verb] !== 'function') {
      throw new Error(`Remote adapter does not support ${verb} operation for ${this.entityName}`);
    }
    if (!this.reachability.online) {
      return OFFLINE;
    }
    try {
      const result = await firstValueFrom(write());
      this.reachability.report(null);
      return result;
    } catch (error) {
      this.reachability.report(error);
      if (!isNetworkError(error)) {
        throw error;
      }
      return OFFLINE;
    }
  }

  /**
   * 跑一次同步；窗口内已经同步过同一份 `where` 就直接返回（US-020 AC#23、D13）。
   *
   * @remarks
   * 命中记忆时本次确实没有发生同步，因此 `onSyncStats` 不会被调用 —— 报一份上次的统计
   * 会让「拉取放大可观测」（AC#25）失真。窗口与失效路径见 {@link QueryCacheSyncMemo}。
   *
   * 代次在 `await` **之前**取（US-023 D12）：远端失效可能正好落在这次同步的飞行窗口里，
   * 那样这份结果按定义已经过期，不许 `remember` 把刚清掉的记忆重新写回去。
   */
  async #sync(options: QueryCacheSyncOptions): Promise<void> {
    const fingerprint = queryCacheFingerprint(options);
    if (this.syncMemo.has(fingerprint)) {
      return;
    }
    const generation = this.syncMemo.generation;
    await this.#runSync(options);
    this.syncMemo.remember(fingerprint, generation);
  }

  /**
   * 真的跑一次同步，第一次发射即返回。
   *
   * @remarks
   * 不用 `firstValueFrom`：SWR 模式下第一次发射是本地缓存，`firstValueFrom` 拿到它就退订，
   * `concat` 永远走不到后台校验那一段 —— 净效果是「本地一旦有缓存就再也不同步」。
   * 这里保留订阅直到流自己结束：缓存先到就先返回，远端校验在后台跑完并落本地。
   *
   * 后台阶段的失败不上抛（Promise 已 settle）——缓存已经交付给调用方，
   * `QueryCacheRepository` 本身也在缓存发射后把远端错误吞成 `EMPTY`。
   * 缓存未发射时的失败照常 reject。失败不进记忆：下次读必须重新校验。
   */
  #runSync(options: QueryCacheSyncOptions): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      this.#cache.find(options).subscribe({
        next: () => resolve(),
        error: (error: unknown) => reject(error as Error),
        complete: () => resolve()
      });
    });
  }

  #fetchMetadata(where: RuleGroup<InstanceType<T>>): Promise<QueryCacheEntityMetadata[]> {
    return firstValueFrom(this.remoteAdapter.fetchMetadata(this.entityName, where));
  }
}

/**
 * 取实体主键。
 *
 * @remarks
 * `QueryCacheRepository` 的写入口按 id 定位（`update(id, patch)` / `delete(ids)`），
 * 而 `IRepository` 传的是实体实例，这里做那一步转换。
 */
const entityId = <T extends EntityType>(entity: InstanceType<T>): string => (entity as { id: string }).id;

/**
 * 构造 QueryCache 主仓储，并在此之前校验适配器能力。
 *
 * @param entityName - 实体名
 * @param EntityType - 实体类
 * @param localAdapter - 本地适配器
 * @param remoteAdapter - 远端适配器
 * @param localCacheFirst - `sync.local.localCacheFirst`
 * @param syncMemo - 「刚同步过」的记忆，由调用方持有以跨适配器发射存活（D13）
 * @param reachability - 远端可达性监视器，取自 `RxDB` 实例
 * @throws {@link RxDBQueryCacheCapabilityError} 适配器缺必需 duck
 */
export function createQueryCachePrimary<T extends EntityType>(
  entityName: string,
  EntityType: T,
  localAdapter: QueryCachePrimaryLocalAdapter<T>,
  remoteAdapter: QueryCacheRemoteAdapter,
  localCacheFirst: boolean,
  syncMemo: QueryCacheSyncMemo,
  reachability: ReachabilityMonitor
): QueryCachePrimaryRepository<T> {
  assertQueryCacheCapabilities(entityName, localAdapter, remoteAdapter);
  return new QueryCachePrimaryRepository<T>(
    entityName,
    localAdapter.getRepository(EntityType),
    remoteAdapter,
    localAdapter,
    localCacheFirst,
    syncMemo,
    reachability
  );
}

/** `QueryCacheRepository.find` 的返回类型在本文件只用于等待同步完成 */
export type QueryCacheSyncResult = Observable<unknown>;
