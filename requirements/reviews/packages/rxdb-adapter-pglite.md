# rxdb-adapter-pglite 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本次为公开入口和高风险路径审计，未声称逐行覆盖整个包。

统一 Nx 校验结果见 [包级索引](README.md)；源码实证与测试运行结果分别记录，未运行的宿主验证不计为通过。

## 结论与范围

🟡凑合：事务执行器、失败关闭和备份存储代次有明确边界；发现 1 条复用实例时的诊断生命周期问题（P3）。大型后端本次重点覆盖连接/事务/加密写入/变更事件，未穷举所有 SQL 组合。

| 评审重点           | 证据入口                                                                                                                                                                                                                                                                                                                                                   | 当前判断                                                                          |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| 客户端与持久化关闭 | [`PGliteClient.init` / `#releaseRuntime` / `snapshotDataDir`](../../../packages/rxdb-adapter-pglite/src/PGliteClient.ts)                                                                                                                                                                                                                                   | 初始化与关闭排同一生命周期队列；syncToFs 失败后仍关闭 runtime、Worker 和 IDB 连接 |
| 事务与提交后事件   | [`PGliteTransactionExecutor`](../../../packages/rxdb-adapter-pglite/src/transaction/PGliteTransactionExecutor.ts)、[`RxDBAdapterPGlite.#run_transaction` / `#dispatchCommittedEvents`](../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts)、[`dispatchUnloggedRemovals`](../../../packages/rxdb-adapter-pglite/src/unlogged-removal-events.ts) | executor 终态独立，删除通知随所属事务提交；不复报旧 INC-002                       |
| 加密与字段映射     | [`transformEntityValueToSql`](../../../packages/rxdb-adapter-pglite/src/pglite.utils.ts)、[`generate_entity_update_sql`](../../../packages/rxdb-adapter-pglite/src/entity/update_sql.ts)                                                                                                                                                                   | 新建记录 AAD 已兼容主键物理列；不存在 SQLite 的 Id 后缀写入捷径                   |
| 查询与切分支       | [`query_sql`](../../../packages/rxdb-adapter-pglite/src/query/query_sql.ts)、[`switch_branch`](../../../packages/rxdb-adapter-pglite/src/version/switch_branch.ts)、[`applySwitchActions` / `dispatch_switch_events`](../../../packages/rxdb-adapter-pglite/src/version/execute_switch_actions.ts)                                                         | 参数化、执行顺序、事务后更新缓存/事件路径已抽查                                   |
| 变更管线           | [`trackChangeHandler` / `flushPendingChangePipeline`](../../../packages/rxdb-adapter-pglite/src/change-pipeline.ts)                                                                                                                                                                                                                                        | 按表排队、有截止时间；发现 PGL-001                                                |

## 确定问题

### PGL-001 · P3 · 同一 adapter 实例重连后 changeErrors$ 永久失效

**证据与根因。** [`RxDBAdapterPGlite`](../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts) 创建一次 `#changeErrors = new Subject<Error>()`、一次 `readonly changeErrors$ = this.#changeErrors.asObservable()`，`#pipelineHost` 也捕获这个 Subject。`disconnect()` 无条件 `this.#changeErrors.complete()`；`connect()` 虽允许 `closed → bootstrap`，却没有重建错误流或管线宿主。

**触发步骤。** 工厂返回同一个 adapter 实例（或调用公开 adapter 的 connect/disconnect），首次连接后断开，再复用它连接并重新订阅 `changeErrors$`；随后变更处理失败，`trackChangeHandler` 调用 `changeErrors.next(error)`。预期新连接的诊断订阅能收到错误；实际订阅一开始就完成，后续 next 没有观察者。

**影响与限定。** 数据处理仍可能成功，但重连后的管线失败不再进入公开错误通道。核心 `RxDB.disconnect()` 通常删除 adapter 缓存、由工厂新建实例，因此“每次工厂都新建 adapter”的常见路径不受影响；本条只覆盖明确复用同一实例的路径，不宣称所有重连都失效。

**验证。** 源码状态追踪与 Subject 终态语义，未运行该组合的专门回归。`#pipelineHost` 固定引用使“只在 connect 里换一个 Subject”也不充分。

**修复与回归。** 明确错误流跟随 adapter 生命周期长期存活，或在重新连接时同时重建 Subject、对外 Observable 和管线引用；若选择禁止实例复用，需要在 connect 入口明确拒绝且更新契约。回归覆盖两次连接后的重新订阅和管线处理失败。

## 当前限制与不重复项

自定义主键物理列的 update/delete 与通知 SQL 仍含 `id`，这已在 [既有清理记录](../README.md) 明确保留，不冒充本次新发现；相关符号是 `generate_entity_update_sql`、单条 delete SQL、`generateNotifyFunctionSQL`。与主键列组合的建与读不能代表完整 CRUD 已支持。

## 测试与后续计划

优先补同实例重连诊断回归；既有测试入口包括 [`PGliteClient.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/PGliteClient.spec.ts)、[`RxDBAdapterPGlite.change-queue.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.change-queue.spec.ts) 与 [`change-pipeline.spec.ts`](../../../packages/rxdb-adapter-pglite/src/__tests__/change-pipeline.spec.ts)。此包 `test` 与 memory/browser 目标不同，未将普通 test 当作真实持久化/OPFS/浏览器并发验证，也未重跑所有迁移与切分支组合。

## 本次 Nx 校验

本次 `rxdb-adapter-pglite:test`：1562 passed (1562)；目标实际执行。命令及整体边界见[总索引](README.md)。
