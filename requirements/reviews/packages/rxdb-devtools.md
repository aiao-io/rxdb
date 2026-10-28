# rxdb-devtools 深度评审

包：`@aiao/rxdb-devtools`。日期：2026-10-28。基线：`7bb16a9014095d4003bd059244722013b36867c1`。

结论：**🟡凑合**。确认 1 条 P2。协议的预算、传输时限和快照隔离已有保护，但动态实例切换后事件订阅没有同步换绑。

## 评审范围

阅读 [`createDevToolsRxdbDatabaseProvider()`](../../../packages/rxdb-devtools/src/rxdb/database-provider.ts)、[`subscribeOnce()`](../../../packages/rxdb-devtools/src/connector-subscribe-once.ts)、[`createWindowConnectorTransport()`](../../../packages/rxdb-devtools/src/connector-transport.ts)、[`createDevToolsNativeSnapshotSource()`](../../../packages/rxdb-devtools/src/native/native-snapshot-source.ts)、[`DevToolsSnapshotStoreImpl`](../../../packages/rxdb-devtools/src/provider/snapshot.ts)，并检查 v2 panel endpoint 的请求、上传、断连与 dispose 路径，以及 authorization、逻辑路径和文件 provider 的入口合同。对照数据库 provider、传输、snapshot 与 OPFS 上传现有测试。

## DEVTOOLS-001 · P2：切换被检查实例后，旧库事件仍被转发，新库没有订阅

**证据**：`createDevToolsRxdbDatabaseProvider()` 的 `ports.getRxDB()` 明确允许运行时更换实例。`registryFor()` 随实例重建元数据索引；但 `subscribedTo` 的比较、`unsubscribe()` 和新监听器登记只在 `events` handler 内进行，`inspect` / `query` 等其他操作不会触发换绑。旧监听器调用 `onRxDBEvent(rxdb, event)`，不检查它捕获的实例是否仍等于 `ports.getRxDB()`。

**触发**：对实例 A 调用 `invoke('events', {})`；把 `getRxDB()` 的当前值切换为 B；调用 `invoke('inspect', {})`，确认返回 B 的库名；随后让 A 发出实体事件，B 也发出同类事件。

**预期 / 实际**：当前检查对象应一致，旧监听器应移除并换绑 B。实际 A 仍有 **26** 个监听器，B 有 **0** 个；A 的事件继续进入 `emitEvent`，B 的事件不会被推送，直到调用方重新执行 `events` 或手动 `dispose()`。

**影响**：同一 provider 生命周期内更换实例时，事件面板混入旧库事件且漏掉新库事件，并保留旧实例的监听引用。没有据此推断跨来源权限绕过。

**验证**：Node 对本基线构建产物调用真实 provider；仅用两个可计数的 RxDB 事件端口替身控制实例切换。输出为 `inspected.result.dbName = 'new-db'`、`oldListeners = 26`、`newListeners = 0`、旧库事件 `forwarded = 1`。`dispose()` 可移除这些监听器，但切换实例本身不会。

**改进**：把实例切换与订阅所有权统一到一个换绑入口；在操作和事件转发边界校验当前实例，并明确切换通知合同。回归覆盖开启事件后切换实例、执行 inspect / query、旧实例再发事件，以及新实例事件与最终 dispose 的计数。

## 测试与边界

本次 `rxdb-devtools:test` 通过：44 个文件、1008 个用例；目标实际执行。既有单元测试通过不能证明 DEVTOOLS-001 不存在。原生文件上传覆盖策略是已声明的行为，本次不重新登记为缺陷；未在 Electron / Tauri 真宿主和浏览器扩展完整链路上实测。
