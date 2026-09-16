/**
 * @fileoverview 策略轴的查询出站队列接缝
 *
 * 核心与 `@aiao/rxdb-plugin-sync` 之间关于「待提交写」的唯一约定面（US-025 阶段 D）。
 *
 * 出站队列（`flushQueryCacheOutbox` / `countQueryCacheOutbox` /
 * `pendingQueryCacheWriteIds`）本身是 **changelog 的第二个消费者**：它读 `rxdb_change`
 * 挑出还没回远端的行、推过去、推进 `RxDBSync.lastPushedChangeId` —— 与 push 共用同一条
 * 水位线。按本故事自己的规则「搬走的是消费者，不是原语」，整个队列随阶段 D 搬进 sync
 * 插件，核心只留下这里的接口与一处调用点。
 *
 * 核心侧唯一还要问队列的问题是 {@link QueryCacheOutboxProvider.pendingWriteIds}：
 * `Repository` 建 QueryCache 会话时要把它交给读引擎。这条**不能兜底为空集** ——
 * 读引擎的对账（`planReconcile`）拿它把「远端没返回」和「本地离线写过」区分开，
 * 空集会让每一条离线写都被当成孤儿删掉。因此槽位为空时抛
 * {@link missingQueryCacheOutboxError}，与 `missingQueryCacheEngineError` 同一形状。
 *
 * 连带的结论是：`SyncType.QueryCache` 实体要 querycache **和** sync 两个插件。
 * 前者提供读引擎，后者提供出站队列，两者都没有安全的缺席形态。
 */

import { RxDBMissingPluginError } from '../RxDBError.js';

/**
 * 查询出站队列提供者 —— 插件在 `install(scope)` 里经 `RxDB.queryCacheOutbox()` 登记。
 *
 * @remarks
 * 只暴露核心真正要问的那一个问题。`flushQueryCacheOutbox` / `countQueryCacheOutbox`
 * 不在这里：它们的调用者（同步监听器、DevTools 面板）都已在插件侧，核心不必认识它们。
 */
export interface QueryCacheOutboxProvider {
  /**
   * 取某个 QueryCache 仓库当前**被出站队列占着**的实体 id。
   *
   * @param namespace - 命名空间
   * @param entity - 元数据里的实体名
   * @returns 队列里还没推回远端的那些实体 id；队列为空时是空集
   */
  pendingWriteIds(namespace: string, entity: string): Promise<ReadonlySet<string>>;
}

/** 缺查询出站队列时要装的包 */
const SYNC_PLUGIN_PACKAGE = '@aiao/rxdb-plugin-sync';

/**
 * 造一条「声明了 QueryCache 却没装出站队列」的错误。
 *
 * @param entityName - 元数据里的实体名
 *
 * @remarks
 * 调用点与 `missingQueryCacheEngineError` 逐一对齐：`RxDB.connect()` 的启动护栏，
 * 与 `Repository` 构造里的兜底（仓储是惰性建的，`use()` 在连上之后卸掉插件仍会走到那里）。
 * 本函数**不导出到公开面** —— 它是核心内部的接缝细节，不是给插件作者的 API。
 */
export const missingQueryCacheOutboxError = (entityName: string): RxDBMissingPluginError =>
  new RxDBMissingPluginError(
    entityName,
    'SyncType.QueryCache',
    SYNC_PLUGIN_PACKAGE,
    'rxdb.use(rxDBPluginSync)',
    'outbox queue'
  );
