# rxdb 深度评审

包：`@aiao/rxdb`。日期：2026-10-28。基线：`7bb16a9014095d4003bd059244722013b36867c1`。

结论：**🟡凑合**。确认 1 条 P2。连接纪元、事务队列和查询销毁已有较完整保护，但批量断连仍有提前失败出口。

## 评审范围

沿 [`RxDB.connect()` / `disconnect()` / `disconnectAll()` / `destroy()`](../../../packages/rxdb/src/RxDB.ts) 检查工厂缓存、引导纪元、插件安装和拆卸顺序；阅读 [`handleTransactionCommit()` / `handleTransactionRollback()`](../../../packages/rxdb/src/rxdb.transaction.ts)、[`trackPluginInstall()` / `destroyPlugin()`](../../../packages/rxdb/src/rxdb.plugin-lifecycle.ts)、[`QueryManager.createTask()`](../../../packages/rxdb/src/repository/QueryManager.ts)、[`QueryTask.run()` / `clean()`](../../../packages/rxdb/src/repository/QueryTask.ts)、[`RxDBTabsGateway`](../../../packages/rxdb/src/gateway/RxDBTabsGateway.ts)、[`RxDBBackupArchiveReader` / `RxDBBackupArchiveWriter`](../../../packages/rxdb/src/backup/backup-archive.ts)、[`runRxDBBackupWhenQueued()`](../../../packages/rxdb/src/backup/backup-queue.ts)、[`runMigrations()`](../../../packages/rxdb/src/system/migration-runner.ts)，并对照生命周期、查询和备份现有测试。

## RXDB-001 · P2：一个在途适配器工厂失败会跳过全部断连

**证据**：`RxDB.disconnectAll()` 在任何清理之前执行 `const adapters = await Promise.all(this.#adapter_map.values())`。工厂 Promise 拒绝时直接退出，下面保护 `#shutdown()`、`adapter.disconnect()` 和缓存清理的 `try` / `finally` 均未进入。`getAdapter()` 删掉失败工厂的缓存不能改变已经创建的 `Promise.all` 的结果。

**触发**：注册并连接健康适配器 A；再调用 `getAdapter('B')`，令 B 的异步工厂停在一个尚未结算的 Promise；此时调用 `disconnectAll()`，随后让 B 工厂拒绝。

**预期 / 实际**：应关闭 A、释放插件及连接资源，并向调用方传播 B 的原始错误；实际只返回 B 的错误，A 的 `disconnect()` 调用数为 **0**。若入口为 `destroy()`，实例已进入终态，后续 `destroy()` 会直接返回，漏关资源不能靠重试该方法回收。

**影响**：退出、热更新或失败初始化的清理流程可残留数据库句柄、文件锁与连接纪元资源。未据此推断数据已被破坏。

**验证**：对本基线 Nx 构建产物执行 Node 诊断，真实调用 `RxDB.connect()`、`getAdapter()`、`disconnectAll()`，仅适配器是可控替身。断言拒绝原因为 `factory failed`，健康适配器断连计数为 `0`；随后显式 `destroy()` 才使计数变成 `1`。诊断通过 `pnpm nx exec --projects=@aiao/source --excludeTaskDependencies -- node <诊断脚本>` 运行。

**改进**：收齐工厂结算结果，继续拆卸所有成功创建的实例；完成全局清理后再传播工厂与拆卸错误。回归覆盖「A 健康、B 工厂在途失败」的 `disconnectAll()` 与 `destroy()` 两个入口，并断言 A 只关闭一次、插件作用域已释放、错误仍可见。

## 测试与边界

本次 `rxdb:test` 通过：152 个文件，2653 个用例通过、1 个跳过；经全包 Nx 串行命令运行，非该目标的本地缓存结果。既有绿色测试未覆盖 RXDB-001 的工厂失败时序。跨适配器真实存储行为仍依赖对应集成套件；本报告不等于真实宿主、全量 e2e 或覆盖率门禁验收。
