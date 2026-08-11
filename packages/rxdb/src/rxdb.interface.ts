import { EntityType } from './entity/entity.interface.js';
import { SyncOptions } from './entity/metadata-options.interface.js';
import type { TransactionExecutor } from './transaction/transaction-executor.interface.js';

/**
 * @fileoverview RxDB 配置层公共契约
 *
 * 本文件只放**类型层**的形状 —— 实现细节（连接、迁移、插件等）由对应
 * 子模块负责。`RxDB` 单例（见 `./RxDB.ts`）在 `init()` 时消费这些类型；
 * 业务方修改 `context` 也会沿用同样的字段语义。
 */

/**
 * 升级脚本
 *
 * 同一个 `name` 在历史里只能被记录一次；重复执行同名迁移会被跳过。
 * `name` 用作 `RxDBMigration` 表的主键，所以**不可改名**。
 */
export interface MigrationType {
  /**
   * 迁移名，全库唯一
   */
  name: string;
  /**
   * 向前迁移。
   *
   * @param executor - 本次迁移所在事务的执行器
   *
   * @remarks
   * `up()` 是**唯一**能在事务体内运行的用户代码。迁移里的所有数据写入必须经
   * `executor.getRepository(X)` / `executor.query()` 发出 —— 直接 `entity.save()` 或
   * `adapter.query()` 会落回适配器队列，而队列的唯一槽位正被本次迁移所在的事务占着，
   * 于是永久挂起（设计见 `code-reviews/transaction-executor-design.md` 裁决④）。
   *
   * 形参可以省略（TS 允许形参更少的实现），不写数据的迁移无需关心它。
   */
  up(executor: TransactionExecutor): Promise<void>;
  /**
   * 向后回滚
   *
   * @remarks
   * 当前 RxDB 暂不主动触发 `down()`；保留它是为未来的"反向迁移"做准备，
   * 业务方应当实现幂等的回滚路径，便于分支合并时撤销未完成的变更。
   */
  down(): Promise<void>;
}

/**
 * RxDB 环境上下文
 *
 * 用于把"全局环境变量"在 RxDB 单例内共享；字段都是**可选**的——
 * 没填的字段同步代码会以 `undefined` 跳过（典型场景：未登录状态下没有 `userId`）。
 */
export interface RxDBContext {
  /**
   * 当前登录用户 ID
   *
   * 用于：
   * - 在变更日志里写入 `createdBy` / `updatedBy`；
   * - 在 pull / push 时按 `userId` 做行级过滤（依赖具体适配器实现）。
   */
  userId?: string;

  /**
   * 客户端唯一 ID
   *
   * @remarks
   * **强烈不建议业务方手动写入**：`RxDB.init()` 在 `clientId` 缺省时
   * 自动生成 UUID 并固化为单例生命周期的一部分。手动赋值的字符串若与他
   * tab 冲突，pull/push 的"自己消息过滤"会失效，导致本 tab 把自己刚推送
   * 的变更误判成他人变更再拉回来。
   */
  clientId?: string;
}

/**
 * RxDB 顶层配置
 *
 * `RxDB` 构造器消费的形状。**dbName + entities** 是初始化前置条件，
 * 其余字段缺省时走合理兜底：没有 `migrations` 等同于空数组；
 * `sync` 必填是因为不同步的 RxDB 几乎无业务价值。
 */
export interface RxDBOptions {
  /**
   * 数据库名称
   *
   * @remarks
   * 同一物理 SQLite 文件的命名空间。RxDB 会自动追加 `@<RXDB_DB_NAME_SUFFIX>`
   * 后缀以避免版本演进时与旧库冲突 —— 业务方传进来的就是用户可读的"逻辑名"。
   */
  dbName: string;

  /**
   * 所有实体
   *
   * 列表里**同一类型只能出现一次**；装饰器会去重但不保证顺序。
   * 多对多中间表（见 `./entity/many-to-many-entity.ts`）不需要出现在这里，
   * `SchemaManager.init()` 会在解析关系时自动追加。
   */
  entities: EntityType[];

  /**
   * 是否启用多个 JavaScript realm 之间的数据库事件协调。
   *
   * @remarks
   * 默认 `true`，通过 `BroadcastChannel` 与 Web Locks 协调多个浏览器 tab。
   * 微信小程序逻辑层只有单 realm 且没有这些 Web API，必须显式设为 `false`。
   */
  multiInstance?: boolean;

  /**
   * 升级脚本
   *
   * 按 `name.localeCompare` 顺序执行，已存在的会被跳过；
   * 与 `RxDBMigration` 表的记录做幂等控制。
   */
  migrations?: MigrationType[];

  /**
   * 默认的同步配置
   *
   * 各仓库的 {@link SyncType} 会从这里继承，未声明的字段落到全局兜底。
   */
  sync: SyncOptions;

  /**
   * 环境上下文
   *
   * 用于写入 `createdBy` 等审计字段、以及行级过滤时的环境变量。
   * 运行时可通过 `RxDB.context` setter 整体替换（`clientId` 会被合并保留）。
   */
  context?: RxDBContext;
}
