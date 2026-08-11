/**
 * @fileoverview RxDB 内部使用的 Symbol 与私有谓词
 *
 * 实体/状态/元数据之间用 `Symbol.for('@aiao/rxdb/...')` 在**进程内唯一**
 * 的槽位通信。集中放在这里是为了：
 *
 * 1. 跨模块共享同一个 Symbol 引用（避免 `Symbol('aiao/rxdb/proxy')` 在不同
 *    文件生成多个不相等的 Symbol）；
 * 2. 把"私有入口"显式收拢，让公开 API（`./entity/*` 等）只用 `getEntityStatus`
 *    / `getEntityMetadata` 这类安全 getter；
 * 3. 编译期用 `unique symbol` 把这些槽位和外部业务键隔离开来 —— 业务实体
 *    永远拿不到这些 Symbol 的引用，无法误改内部状态。
 */

import { EntityManager } from './entity/entity-manager.js';
import { RxDBAdapterName } from './rxdb-adapter.js';
import { RxDBEvent, TRANSACTION_BEGIN, TRANSACTION_COMMIT, TRANSACTION_ROLLBACK } from './rxdb-events.js';
import { RxDBOptions } from './rxdb.interface.js';

const rxdbSymbol = (name: string) => Symbol.for(`@aiao/rxdb/${name}`);

/**
 * 实体代理
 *
 * 挂在 `EntityManager` 上的"代理工厂"槽位，键为该 Symbol。{@link Entity}
 * 装饰器在 `EntityManager.init()` 后调用此工厂，把裸实例包成 Proxy，
 * 拦截 `set` 触发 dirty tracking 与 patch 计算。
 */
export const PROXY: unique symbol = rxdbSymbol('ɵProxy') as never;

/**
 * 实体元数据
 *
 * 挂在实体**类构造器**上的元数据（{@link EntityMetadata}）。`tryGetEntityMetadata`
 * 沿原型链查找，命中即终止 —— 这就是子类继承父类元数据的实现方式。
 */
export const METADATA: unique symbol = rxdbSymbol('ɵMetadata') as never;

/**
 * 实体状态
 *
 * 挂在实体**实例**上的 {@link EntityStatus} 槽位。dirty tracking、change 合并、
 * 关系缓存、undo/redo 历史都挂在它上面。
 */
export const STATUS: unique symbol = rxdbSymbol('ɵStatus') as never;

/**
 * 实体管理器
 *
 * 挂在实体**类构造器**上的 {@link EntityManager} 反向引用，让装饰器
 * 增强的构造函数里能拿到当前 RxDB 实例（否则装饰器闭包里无法访问单例）。
 */
export const ENTITY_MANAGER: unique symbol = rxdbSymbol('ɵEntityManager') as never;

/**
 * 实体类型
 *
 * 挂在 {@link EntityMetadata} 上的"实体类反向引用"槽位 —— 仅一份，
 * 写一次（`entity-manager.ts` 初始化时）；其它地方都用
 * {@link getEntityMetadata} 取出后再回查类型。
 */
export const ENTITY_TYPE: unique symbol = rxdbSymbol('ɵEntityType') as never;

/**
 * 是否是本地数据库适配器
 *
 * @param adapterName - 适配器名称
 * @param options - RxDB 配置选项
 * @returns 如果是本地适配器则返回 true，否则返回 false
 *
 * @remarks
 * 仅按"配置里声明的 `sync.local.adapter`"判定 —— 不去查适配器是否已实例化，
 * 避免在 `RxDB.connect()` 之前误判。当前只有 `RxDB.connect` 一处调用，
 * 调用前适配器必然已经准备好。
 */
export const isLocalAdapter = (adapterName: RxDBAdapterName, options: RxDBOptions) =>
  options.sync.local?.adapter === adapterName;

/**
 * 事务事件类型集合
 */
const TRANSACTION_EVENT_TYPES: ReadonlySet<string> = new Set([
  TRANSACTION_BEGIN,
  TRANSACTION_COMMIT,
  TRANSACTION_ROLLBACK
]);

/**
 * 是否是事务事件
 *
 * @param event - RxDB 事件对象
 * @returns 如果是事务事件则返回 true，否则返回 false
 *
 * @remarks
 * 谓词的语义是"是不是 BEGIN / COMMIT / ROLLBACK 这三个**事务事件类型**"，
 * 而不是"是不是在事务期间发生"。后者要看 `RxDB` 单例上的 `#transaction_event_pending`。
 */
export const isTransactionEvent = (event: RxDBEvent) => TRANSACTION_EVENT_TYPES.has(event.type);

/**
 * 实体管理（私有方法）
 *
 * 给需要直接拿到 `EntityManager[PROXY]` 的内部代码（{@link Entity} 装饰器）
 * 用的"窄类型" —— 在公开 {@link EntityManager} 之外额外声明 `[PROXY]` 槽位，
 * 让装饰器代码读 `em[PROXY]` 不会触发 TS 错误。
 */
export type EntityManagerPrivate = {
  /**
   * 设置实体代理创建函数
   * 用于创建新的实体代理对象，并初始化其状态
   *
   * @param entity - 要代理的实体
   * @returns 代理后的实体实例
   */
  [PROXY]: <T extends object>(entity: T) => T;
} & EntityManager;
