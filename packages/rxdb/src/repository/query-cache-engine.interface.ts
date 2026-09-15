/**
 * @fileoverview 策略轴的 QueryCache 引擎接缝
 *
 * 核心与 `@aiao/rxdb-plugin-querycache` 之间唯一的约定面（US-025 阶段 B）。
 *
 * 改造前 {@link Repository} 的构造里直接 `new QueryCacheSyncMemo()` +
 * `createQueryCachePrimary()`，读引擎的 1,541 行因此无条件进依赖图 —— 只配
 * `SyncType.None` + local 的应用也照付。这里把那处直构造反转成**运行期工厂槽**：
 * 核心只留接口与调用点，实现随插件安装。
 *
 * 只开**运行期**槽位，不开注册表类型：策略轴的 `SyncType` / `SyncOptions` 仍然闭合
 * （US-025 明列为 Out of Scope），`SyncType.QueryCache` 这个枚举成员留在核心 ——
 * 否则 `Repository` 构造里那处分支无从判定。代价是核心保留一个指向「可能没装的插件」
 * 的枚举值，`RxDBMissingPluginError` 就是为它准备的运行期护栏。
 *
 * 与门面轴的 {@link RxDBRepositories} 注册表的区别：那一条决定 `getRepository(E)` 的
 * **公开面**、成员可由插件用 `declare module` 任意扩充；这一条不改公开面，成员恒为
 * QueryCache 一个。一个名字只属于一条轴，因此这里叫 `*Engine` 而不是 `*Repository`。
 */

import type { EntityType } from '../entity/entity.interface.js';
import type { ReachabilityMonitor } from '../network/reachability.js';
import { RxDBMissingPluginError } from '../RxDBError.js';
import type { SyncStateHub } from '../sync-state.js';
import type { QueryCachePendingWriteIds } from './query-cache.interface.js';
import type { IRepository } from './repository.interface.js';

/**
 * QueryCache 策略下的主仓储。
 *
 * @typeParam T - 实体类型
 *
 * @remarks
 * 它站在**门面轴**上（`implements IRepository`），因此仍叫 `*Repository` 的那一类；
 * 比普通主仓储多的只有 {@link QueryCachePrimary.invalidateInflight} —— 远端失效上报要在
 * 返回前把在飞查询作废（US-023 D13），而那是只有读缓存才有的概念。
 */
export interface QueryCachePrimary<T extends EntityType> extends IRepository<T> {
  /**
   * 作废此刻在飞的同步查询。
   *
   * @remarks
   * 调用之后，已经发出去、还没回来的那批同步不许把结果写回本地投影：它们问到的是
   * 失效**之前**的远端状态。
   */
  invalidateInflight(): void;
}

/**
 * 一个 QueryCache 实体一份的引擎会话。
 *
 * @typeParam T - 实体类型
 *
 * @remarks
 * 生命周期与持有它的 {@link Repository} 等长，「刚同步过」的记忆表归它持有 —— 主仓储
 * 随适配器流**每次发射重建**，记忆放在主仓储身上等于活不过一次 `find`。
 */
export interface QueryCacheSession<T extends EntityType> {
  /**
   * 建一个主仓储。
   *
   * @param localAdapter - 本次发射的本地适配器
   * @param remoteAdapter - 本次发射的远端适配器
   *
   * @remarks
   * 适配器流每次发射调一次。「实例换了就清记忆、没换就沿用」（US-020 AC#22）的对表
   * 语义在实现侧完成 —— 核心这边只负责按流重建，不知道记忆的存在。
   *
   * 形参取 `object` 而不是两个 QueryCache 适配器契约：能力校验（五个 duck 齐不齐）
   * 是实现的责任，`RxDBQueryCacheCapabilityError` 要在**首次真正用到它的调用**上抛，
   * 而不是在核心的类型签名上把不合格的适配器提前挡掉。
   */
  createPrimary(localAdapter: object, remoteAdapter: object): QueryCachePrimary<T>;

  /**
   * 清空记忆。
   *
   * @remarks
   * 两个调用点：远端失效上报（须**同步**清，否则随后的重跑会命中陈旧记忆）与
   * `Repository.destroy()`（记忆表每条都挂着 `setTimeout`，不清会把仓储连同闭包
   * 钉在事件循环上直到窗口自己走完）。
   */
  clear(): void;
}

/**
 * 建会话需要的一切，全部由核心备好后注入。
 *
 * @typeParam T - 实体类型
 */
export interface QueryCacheSessionContext<T extends EntityType> {
  /** 实体类 */
  EntityType: T;
  /** 元数据里的实体名（打包压缩后 `EntityType.name` 不可靠） */
  entityName: string;
  /** `sync.local.localCacheFirst`，由调用点在联合类型已收窄处取出 */
  localCacheFirst: boolean;
  /** `sync.local.syncStaleTime`；`undefined` 表示用实现侧的缺省窗口 */
  syncStaleTime: number | undefined;
  /** 远端可达性监视器 */
  reachability: ReachabilityMonitor;
  /** 同步状态面板 */
  syncState: SyncStateHub;
  /**
   * 查询出站队列此刻占着哪些 id。
   *
   * @remarks
   * 生产实现是核心的 `pendingQueryCacheWriteIds`，它读 `versionManager`。**由核心注入**
   * 而不是让插件自己去问，是 B5 的全部内容：读路径插件对 `version/` 保持零依赖，
   * 写回出站留在核心直到阶段 D。
   */
  pendingWriteIds: QueryCachePendingWriteIds;
}

/**
 * QueryCache 读引擎工厂 —— 插件在 `install(scope)` 里经 `RxDB.queryCacheEngine()` 登记。
 *
 * @remarks
 * 槽位为空时，声明了 `SyncType.QueryCache` 的实体在 `connect()` 阶段就被
 * `RxDBMissingPluginError` 拦下，**不静默降级为本地读**（US-025 B3）——静默降级会把
 * 「插件没装」伪装成「远端没有数据」，与 `RxDBQueryCacheCapabilityError` 拒绝降级是同一条理由。
 */
export interface QueryCacheEngineFactory {
  /**
   * 为一个 QueryCache 实体建会话。
   *
   * @param context - 核心备好的一切，见 {@link QueryCacheSessionContext}
   */
  createSession<T extends EntityType>(context: QueryCacheSessionContext<T>): QueryCacheSession<T>;
}

/** 缺 QueryCache 引擎时要装的包 */
const QUERY_CACHE_PLUGIN_PACKAGE = '@aiao/rxdb-plugin-querycache';

/**
 * 造一条「声明了 QueryCache 却没装引擎」的错误。
 *
 * @param entityName - 元数据里的实体名
 *
 * @remarks
 * 两个调用点共用一份消息：`RxDB.connect()` 的启动护栏，与 `Repository` 构造里的兜底
 * （仓储是惰性建的，`use()` 在连上之后卸掉插件仍会走到那里）。分开写两份，迟早会有一份
 * 不提包名。本函数**不导出到公开面** —— 它是核心内部的接缝细节，不是给插件作者的 API。
 */
export const missingQueryCacheEngineError = (entityName: string): RxDBMissingPluginError =>
  new RxDBMissingPluginError(
    entityName,
    'SyncType.QueryCache',
    QUERY_CACHE_PLUGIN_PACKAGE,
    'rxdb.use(rxDBPluginQueryCache)'
  );
