# rxdb 深度评审

包：`@aiao/rxdb`。日期：2026-10-29。基线：`f62f77c19d55c73d8335df026778422282c2fed4`。

结论：**🟡凑合**。确认 1 条 P2。连接纪元、事务队列和查询销毁已有较完整保护，但批量断连仍有提前失败出口。本更新轮深审了跨 Tab 增量 UPDATE 门控（#167，11 个文件），未发现新的确定问题。

## 评审范围

沿 [`RxDB.connect()` / `disconnect()` / `disconnectAll()` / `destroy()`](../../../packages/rxdb/src/RxDB.ts) 检查工厂缓存、引导纪元、插件安装和拆卸顺序；阅读 [`handleTransactionCommit()` / `handleTransactionRollback()`](../../../packages/rxdb/src/rxdb.transaction.ts)、[`trackPluginInstall()` / `destroyPlugin()`](../../../packages/rxdb/src/rxdb.plugin-lifecycle.ts)、[`QueryManager.createTask()`](../../../packages/rxdb/src/repository/QueryManager.ts)、[`QueryTask.run()` / `clean()`](../../../packages/rxdb/src/repository/QueryTask.ts)、[`RxDBTabsGateway`](../../../packages/rxdb/src/gateway/RxDBTabsGateway.ts)、[`RxDBBackupArchiveReader` / `RxDBBackupArchiveWriter`](../../../packages/rxdb/src/backup/backup-archive.ts)、[`runRxDBBackupWhenQueued()`](../../../packages/rxdb/src/backup/backup-queue.ts)、[`runMigrations()`](../../../packages/rxdb/src/system/migration-runner.ts)，并对照生命周期、查询和备份现有测试。另核对 [`transactionalRepository()`](../../../packages/rxdb/src/repository/transactional-repository.ts) 的公开仓储包装：SQL 执行与回填位于同一事务；这条防线不覆盖 RXDB-001 在清理入口之前等待工厂失败的问题。

## RXDB-001 · P2：一个在途适配器工厂失败会跳过全部断连

**证据**：`RxDB.disconnectAll()` 在任何清理之前执行 `const adapters = await Promise.all(this.#adapter_map.values())`。工厂 Promise 拒绝时直接退出，下面保护 `#shutdown()`、`adapter.disconnect()` 和缓存清理的 `try` / `finally` 均未进入。`getAdapter()` 删掉失败工厂的缓存不能改变已经创建的 `Promise.all` 的结果。

**触发**：注册并连接健康适配器 A；再调用 `getAdapter('B')`，令 B 的异步工厂停在一个尚未结算的 Promise；此时调用 `disconnectAll()`，随后让 B 工厂拒绝。

**预期 / 实际**：应关闭 A、释放插件及连接资源，并向调用方传播 B 的原始错误；实际只返回 B 的错误，A 的 `disconnect()` 调用数为 **0**。若入口为 `destroy()`，实例已进入终态，后续 `destroy()` 会直接返回，漏关资源不能靠重试该方法回收。

**影响**：退出、热更新或失败初始化的清理流程可残留数据库句柄、文件锁与连接纪元资源。未据此推断数据已被破坏。

**验证**：对本基线 Nx 构建产物执行 Node 诊断，真实调用 `RxDB.connect()`、`getAdapter()`、`disconnectAll()`，仅适配器是可控替身。断言拒绝原因为 `factory failed`，健康适配器断连计数为 `0`；随后显式 `destroy()` 才使计数变成 `1`。诊断通过 `pnpm nx exec --projects=@aiao/source --excludeTaskDependencies -- node <诊断脚本>` 运行。

**改进**：收齐工厂结算结果，继续拆卸所有成功创建的实例；完成全局清理后再传播工厂与拆卸错误。回归覆盖「A 健康、B 工厂在途失败」的 `disconnectAll()` 与 `destroy()` 两个入口，并断言 A 只关闭一次、插件作用域已释放、错误仍可见。

**2026-10-29 复核：仍有效。** `RxDB.ts` 不在 `7bb16a9..f62f77c1` 的变更清单里，`disconnectAll()` 仍在任何 try / finally 之前 `await Promise.all(this.#adapter_map.values())`；`getAdapter()` 仍把工厂 Promise 原样缓存进 `#adapter_map`，其 catch 只删 map 条目、不影响已取出的 `Promise.all` 结果。

## 2026-10-29 更新轮：跨 Tab 增量 UPDATE 门控（#167）深审

变更 11 个文件：merge/need_refresh 门控与匹配语义重写，`merge_update.spec.ts` 新增 634 行用例。重点核对（证据均为可跳转符号）：

- [`foldUpdate()`](../../../packages/rxdb/src/query/merge-update.utils.ts)：同批同 id 多条 UPDATE 合成一条，patch 后写覆盖、inversePatch 先写为准，合成后确为「本批前 → 本批后」整段变化；`UpdateDataCache` 构造时按 id 折叠，`classifyUpdates` / 门控看到同一份合成事件。
- [`query_need_refresh_update()`](../../../packages/rxdb/src/query/need_refresh_update.ts) 门控四判据逐一核对：`touchesProperties`（只认值真变了的读取属性，缺失键按「变了」保守处理）→ `isStaleEventPayload`（缓存比事件新拼不出前态即回 SQL）→ `hasFields` 前后态补全检查 → `isIncompleteNewRow`（findAll 追加新行需带齐全部持久列）。判据方向均为「证不明就回 SQL」，未发现会产生错误增量结果的假阴性路径；脏实体经 `persistedState` 按基线判定，与 SQL 活查询口径一致。
- [`query-matching.utils.ts`](../../../packages/rxdb/src/query/query-matching.utils.ts) `=` / `!=` 对 `null` 规则值改为 IS NULL / IS NOT NULL 语义，与 sqlite-core / PGlite 的 SQL 翻译及 `null` / `notNull` 操作符同口径；日期等值遇到实体侧空值判不命中而不再误抛。大写 `'AND'` 组合子抛带原文的 `RxDBError`，由 `QueryManager` 按任务兜住退回整查——是注释与用例共同钉住的已接受设计，不计新增缺陷。
- [`merge_update.ts`](../../../packages/rxdb/src/query/merge_update.ts)：`get` 只认同类型事件并折叠；`_recalculate` 只收 `current_entities`，外类型（同 id）事件不再被序列化成本类型实例追加进结果。
- [`QueryManager.ts`](../../../packages/rxdb/src/repository/QueryManager.ts) 变更仅注释：无活跃任务时身份缓存停在旧值的已知限制已在代码与 roadmap 登记，不计新增缺陷。
- [`SKILL.md`](../../../packages/rxdb/skills/aiao-rxdb/SKILL.md)：样例符号（`RxDB` / `Entity` / `EntityBase` / `PropertyType` / `SyncType` / `instantiate` / `adapter` / `use` / `connect` / `disconnectAll` / 事务执行器 `getRepository`）与装饰器选项（`name` / `namespace` / `tableName` / `log` / `properties`）均与当前源码一致；插件时序描述与 `#register_system_contribution` 的 init 后抛错、`installOnePlugin` 的纪元守卫一致。
- 公开面契约：`getSerializedBefore` 收窄为单参数，[`incremental-merge-surface.spec.ts`](../../../packages/rxdb/src/__tests__/contracts/incremental-merge-surface.spec.ts) 已钉新签名；消费方 rxdb-plugin-tree 在同提交（`ade2da5f`）内随迁，无跨包脱节。
- 634 行新用例经 [`query-task-harness.ts`](../../../packages/rxdb/src/testing/query-task-harness.ts) 走真实 `QueryManager.createTask()` 与生产 `#serialize`，替身仅实体缓存一层；覆盖冷缓存跨界、同批折叠、外类型隔离、脏实体基线、迟到事件、关系路径外键、新行整列回 SQL 与空 inversePatch 回退。抽查未发现与实现不一致的用例假设。

本更新轮未发现新的确定问题。

## 测试与边界

首轮（2026-10-28）`rxdb:test` 通过：152 个文件，2653 个用例通过、1 个跳过；经全包 Nx 串行命令运行，非该目标的本地缓存结果。既有绿色测试未覆盖 RXDB-001 的工厂失败时序。跨适配器真实存储行为仍依赖对应集成套件；本报告不等于真实宿主、全量 e2e 或覆盖率门禁验收。
