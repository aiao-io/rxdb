# rxdb-test 深度评审

包：`@aiao/rxdb-test`。日期：2026-10-28。基线：`7bb16a9014095d4003bd059244722013b36867c1`。

结论：**🟢好**。本次已检查范围内未发现新的确定缺陷；这不代表所有后端契约已完成验收。

## 评审范围与判断

| 检查路径            | 源码证据与结论                                                                                                                                                                                                                                                            |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Observable 序列断言 | [`expectObservableSequence()`](../../../packages/rxdb-test/src/testing/observable-sequence.ts) 串行等待异步 validate / run，处理额外发射与提前 complete；`finish()` 在 teardown 失败时拒绝，并保留原始序列错误，避免无结果挂起与假绿。                                    |
| SQLite 清库隔离     | [`cleanupSqliteTestAdapter()`](../../../packages/rxdb-test/src/testing/sqlite.ts) 在事务内清理，精确跳过虚表影子表；清分支表前要求 reset SQL，初始贡献行在触发器恢复前补回，finally 清缓存。对照相关清理回归。                                                            |
| 同步 seed           | [`withSeedLock()` / `createLockedSeeder()`](../../../packages/rxdb-test/src/testing/seed-lock.ts) 以数据库实例为 WeakMap 键，前次失败不会阻断后续 seed；同一锁内再次调用的死锁限制已有明确说明，不作为新缺陷。                                                            |
| 事务就绪与清理      | [`runReadinessSuite()`](../../../packages/rxdb-test/src/transaction/readiness.suite.ts) 覆盖首装、并发 connect 和引导期写入；[`disposeOpened()`](../../../packages/rxdb-test/src/transaction/dispose-opened.ts) 收集异步 dispose 失败并传播，不能把资源释放失败当作通过。 |
| 并发用例辨别力      | [`withTransactionBarrier()`](../../../packages/rxdb-test/src/sortable/transaction-barrier.ts) 让两次事务请求到齐后才放行，结束恢复原 transaction，能够把串行化责任落回适配器。                                                                                            |
| 发布入口            | [`src/index.ts`](../../../packages/rxdb-test/src/index.ts) 主要导出测试工具和跨框架 fixtures；套件按子路径消费，不能以根入口未导出套件判定能力缺失。                                                                                                                      |

## 测试证据

本次 `rxdb-test:test` 实际执行并通过：24 个文件、249 个用例。验证命令为总索引记录的全包 Nx 串行命令；该结果证明测试辅助库自身现有用例通过。

## 未验证边界

- 未把适配器的 `test`、`test-memory`、`test-browser` 或真宿主 conformance 混成同一结果；共享套件只有被具体后端注册并运行后，才构成该后端的证据。
- 本次重点阅读断言、清理、事务就绪和并发屏障，不宣称逐条验证所有领域 fixture 的业务完备性。
- 没有运行覆盖率验收专用目标或完整跨框架 e2e；现有测试通过不能替代这些门禁。
