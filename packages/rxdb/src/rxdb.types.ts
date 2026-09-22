import { EntityType } from './entity/entity.interface.js';
import { EntityMetadata } from './entity/metadata.interface.js';
import { SyncType } from './entity/sync-options.interface.js';
import { RepositoryConstructor, RepositoryInstance } from './rxdb-adapter.js';
import { RxDBEvent } from './rxdb-events.js';
import { RxDBOptions } from './rxdb.interface.js';

export type EventListener<T> = (event: T) => void;

export type RxDBConfig = RxDBOptions;

/**
 * 不参与深冻结的 {@link RxDBOptions} 字段 —— 它们装的是**活的行为**而非声明式数据。
 *
 * - `entities`：实体构造器数组。它既是 `SchemaManager.init()` 的注册表（还要往里 push
 *   内建实体与多对多中间表），其元素的 prototype 又要被 `EntityManager.init()` 挂上
 *   `ENTITY_MANAGER`。冻住会让 push 抛 `object is not extensible`、让 `new Entity()`
 *   抛 `need init rxdb`。
 * - `migrations`：`up` / `down` 是调用方的回调。深冻结连函数自身的属性一起冻住
 *   （闭包状态、测试替身的调用记录），首次调用即抛 `object is not extensible`。
 *
 * 其余字段（`sync` / `context` 等）是声明式数据，仍然深冻结；新增声明式字段自动受保护。
 * 契约由 `__tests__/RxDB.config-freeze.spec.ts` 锁定。
 */
export const LIVE_BEHAVIOUR_CONFIG_KEYS: ReadonlySet<string> = new Set(['entities', 'migrations']);

/**
 * 一个打开中的事务上下文
 *
 * @remarks
 * `id` 为 `undefined` 表示派发方没有提供事务身份——这些匿名事务共用同一个上下文，
 * 与引入身份之前的语义一致。
 */
export interface TransactionContext {
  id: string | undefined;
  depth: number;
  events: RxDBEvent[];
}

/**
 * IRepositoryConfig 统一注册配置
 *
 * @remarks
 * 增量 merge 实现**不在这里**：它按 task 类型注册在
 * {@link QueryManager.registerMergeCreateFn} 一族上，由各 Repository 自己在构造期登记
 * （见 `TreeRepository` / `GraphRepository`）。这里只声明「用哪个类、要不要动态造实体、
 * 哪些同步策略撑不住」。
 */
export interface IRepositoryConfig<RT extends RepositoryInstance = RepositoryInstance> {
  /**
   * 根据 {@link EntityMetadata} 动态生成 Entity 类（中间表等场景）
   */
  entityGenerator?: (metadata: EntityMetadata) => EntityType | EntityType[];

  class: RepositoryConstructor<RT>;

  /**
   * 本仓储撑不住的同步策略，键是策略、值是**不支持的理由**。
   *
   * @remarks
   * 注册期校验会把这里的声明翻成 `unsupportedRepositorySyncType` 违规，理由原样拼进消息 ——
   * 所以理由要写清「为什么坏」和「改用什么」，它是开发者唯一能看到的说明。
   *
   * 「哪种仓储在哪种策略下会坏」是仓储实现的知识，核心没有判据，因此由注册方声明而不是
   * 核心硬编码；插件注册的仓储与核心内置仓储在这条规则上走同一条路。
   *
   * @example
   * ```typescript
   * rxdb.repository('TreeRepository', {
   *   class: TreeRepository, // 来自 @aiao/rxdb-plugin-tree
   *   unsupportedSyncTypes: {
   *     [SyncType.QueryCache]: '树查询依赖本地完整的祖先链，而缓存只覆盖查过的 where 命中的行。'
   *   }
   * });
   * ```
   */
  unsupportedSyncTypes?: Partial<Record<SyncType, string>>;
}
