import { EntityType } from './entity/entity.interface.js';
import { EntityMetadata } from './entity/metadata.interface.js';
import { MergeQueryTaskCreateFn, MergeQueryTaskRemoveFn, MergeQueryTaskUpdateFn } from './repository/QueryManager.js';
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

export interface MergeQueryTaskOptions {
  create: MergeQueryTaskCreateFn;
  update: MergeQueryTaskUpdateFn;
  remove: MergeQueryTaskRemoveFn;
}

/**
 * IRepositoryConfig 统一注册配置
 * 合并 factory、class 和 merge operations 为单一配置对象
 */
export interface IRepositoryConfig<RT extends RepositoryInstance = RepositoryInstance> {
  /**
   * 根据 {@link EntityMetadata} 动态生成 Entity 类（中间表等场景）
   */
  entityGenerator?: (metadata: EntityMetadata) => EntityType | EntityType[];

  class: RepositoryConstructor<RT>;

  mergeOperations: MergeQueryTaskOptions;
}
