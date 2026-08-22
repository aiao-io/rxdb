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
import { firstValueFrom, Observable } from 'rxjs';
import type { EntityStaticType, EntityType } from '../entity/entity.interface.js';
import type { QueryCacheEntityMetadata } from '../entity/metadata-options.interface.js';
import { RxDBQueryCacheCapabilityError } from '../RxDBError.js';
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
  onSyncStats?: (stats: SyncStats) => void;
}

const missingMembers = (target: object, members: readonly string[]): string[] =>
  members.filter(member => typeof (target as Record<string, unknown>)[member] !== 'function');

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
    private readonly localCacheFirst: boolean
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
   * （可用 `onSyncStats` 的 `remoteCount` 观测）。同一 `where` 翻第二页不会再同步一次。
   */
  async find(options: EntityStaticType<T, 'findOptions'>): Promise<InstanceType<T>[]> {
    const { where, localCacheFirst, onSyncStats } = options as QueryCacheFindHints<T>;
    await this.#sync({
      where,
      // 调用 > 配置 > false（US-020 AC#24）：`??` 而非 `||`，显式的 `false` 必须压过配置的 `true`
      localCacheFirst: localCacheFirst ?? this.localCacheFirst,
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
   * 创建实体：先远端后本地缓存。
   *
   * @param entity - 待创建的实体实例
   * @returns 合并了服务端返回字段的同一实体实例
   * @throws 远端写失败时上抛，本地不落缓存
   */
  async create(entity: InstanceType<T>): Promise<InstanceType<T>> {
    const created = await firstValueFrom(this.#cache.create(entity));
    return Object.assign(entity, created);
  }

  /**
   * 更新实体：先远端后本地缓存。
   *
   * @param entity - 待更新的实体实例（提供 `id`）
   * @param patch - 字段级 patch
   * @returns 合并了服务端返回字段的同一实体实例
   * @throws 远端写失败时上抛，本地不更新
   */
  async update(entity: InstanceType<T>, patch: Partial<InstanceType<T>>): Promise<InstanceType<T>> {
    const updated = await firstValueFrom(this.#cache.update(entityId(entity), patch));
    return Object.assign(entity, updated);
  }

  /**
   * 删除实体：先远端后本地缓存。
   *
   * @param entity - 待删除的实体实例
   * @returns 入参实体
   * @throws 远端删除失败时上抛，本地缓存不动
   */
  async remove(entity: InstanceType<T>): Promise<InstanceType<T>> {
    await firstValueFrom(this.#cache.delete(entityId(entity)));
    return entity;
  }

  /**
   * 跑一次同步，第一次发射即返回。
   *
   * @remarks
   * 不用 `firstValueFrom`：SWR 模式下第一次发射是本地缓存，`firstValueFrom` 拿到它就退订，
   * `concat` 永远走不到后台校验那一段 —— 净效果是「本地一旦有缓存就再也不同步」。
   * 这里保留订阅直到流自己结束：缓存先到就先返回，远端校验在后台跑完并落本地。
   *
   * 后台阶段的失败不上抛（Promise 已 settle）——缓存已经交付给调用方，
   * `QueryCacheRepository` 本身也在缓存发射后把远端错误吞成 `EMPTY`。
   * 缓存未发射时的失败照常 reject。
   */
  #sync(options: QueryCacheSyncOptions): Promise<void> {
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
 * @throws {@link RxDBQueryCacheCapabilityError} 适配器缺必需 duck
 */
export function createQueryCachePrimary<T extends EntityType>(
  entityName: string,
  EntityType: T,
  localAdapter: QueryCachePrimaryLocalAdapter<T>,
  remoteAdapter: QueryCacheRemoteAdapter,
  localCacheFirst: boolean
): QueryCachePrimaryRepository<T> {
  assertQueryCacheCapabilities(entityName, localAdapter, remoteAdapter);
  return new QueryCachePrimaryRepository<T>(
    entityName,
    localAdapter.getRepository(EntityType),
    remoteAdapter,
    localAdapter,
    localCacheFirst
  );
}

/** `QueryCacheRepository.find` 的返回类型在本文件只用于等待同步完成 */
export type QueryCacheSyncResult = Observable<unknown>;
