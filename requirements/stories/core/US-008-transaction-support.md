---
id: US-008
title: 事务支持
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-28
tags: [core, transaction, acid]
---

# 用户故事：事务支持

## 作为/我想要/以便

**作为** 开发者
**我想要** 在事务中执行多个操作
**以便** 确保数据完整性（要么全部成功，要么全部回滚）

## 验收标准

| #   | 前置条件       | 操作               | 预期结果                                      | 状态 |
| --- | -------------- | ------------------ | --------------------------------------------- | ---- |
| 1   | 开始事务       | 执行多个 CRUD 操作 | 所有操作作为原子操作执行                      | ✅   |
| 2   | 事务中发生错误 | 触发回滚           | 所有变更撤销                                  | ✅   |
| 3   | 事务进行中     | 事件产生           | 事件入队列缓冲，不立即派发                    | ✅   |
| 4   | 事务 COMMIT    | 成功               | 批量派发所有缓冲事件                          | ✅   |
| 5   | 事务 ROLLBACK  | 执行               | 丢弃所有缓冲事件                              | ✅   |
| 6   | 事务事件类型   | 生命周期变化       | 派发 TRANSACTION_BEGIN, COMMIT, ROLLBACK 事件 | ✅   |

## 技术笔记

- 事务缓冲机制：事务期间事件入队列，COMMIT 批量派发，ROLLBACK 丢弃
- 适配器事务支持：SQLite 和 PGlite 均支持完整 ACID 语义
- PGlite 特有：`SET CONSTRAINTS ALL DEFERRED` 支持延迟约束检查
- 事务锁机制：防止嵌套事务，支持 `transactionLock` 参数控制
- 事务 ID 追踪：每个事务生成唯一 UUID，记录到 RxDBChange 表用于审计
- 触发器动态注入：通过 `switch_transaction_id` 动态更新触发器中的事务 ID
- **事务执行器（C2）**：`TransactionExecutor` 是「本事务内」这条判据的唯一落点 —— `transaction(tx => tx.getRepository(X).create(...))`。直接 `entity.save()` 会落回适配器队列并永久挂起
- **mergeChanges 契约**：放在 **executor** 上而非 `adapter.mergeChanges()` 加 executor 形参 —— 「持有 executor 才算在本事务内」必须只有一处判据；同步链路里 4 个事务体（`merge-branch` / `cleanup-expired` / `pull-batch` / `pull-repository`）的主力写都是它
- **迁移形参**：`MigrationType.up(executor)` —— `up()` 是唯一能在事务体内运行的用户代码，必须把 executor 交给用户，否则迁移里的写无路可走

## 实现文件

- `packages/rxdb/src/transaction/transaction-executor.interface.ts` — `TransactionExecutor` 接口 + `mergeChanges` / `run` 契约
- `packages/rxdb/src/rxdb-adapter.ts` — `TransactionFun` 类型 + 适配器 `transaction()` 接口
- `packages/rxdb/src/rxdb.interface.ts` — `MigrationType.up(executor)` 签名
- `packages/rxdb/src/RxDB.ts` — migrations 现在通过 executor 仓库执行，外部 migration 也收 executor
- `packages/rxdb/src/rxdb-events.ts` — 事务事件类定义
- `packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts` — SQLite executor 实现（门面 Proxy 模式）
- `packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts` — `#run_transaction` 接入 executor；`createUncachedRepository` 避免污染 `repository_cache`；`runInTransaction` 复用 `#current_executor`
- `packages/rxdb-adapter-sqlite-core/src/version/execute-sql-statements.ts` — `SqlStatementSink` 形参放宽，使 executor 与 client 都能传
- `packages/rxdb-adapter-pglite/src/transaction/PGliteTransactionExecutor.ts` — PGlite executor 实现（状态自持，不从 `tx.closed` 派生）
- `packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts` — 与 sqlite-core 同口径的 executor 接入
- `packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts` — wa-sqlite 事务实现 (~350 LOC)
- `packages/rxdb-adapter-wa-sqlite/src/transaction_sqlite_result.ts` — SQLite 事务结果处理（`forcedUpdate` 时 `structuredClone` 写入 origin，防止 entity 与 origin 共享 `Uint8Array`）
- `packages/rxdb-adapter-pglite/src/transaction_pglite_result.ts` — PGlite 事务结果处理（同上）
- `packages/rxdb-adapter-wa-sqlite/src/version/switch_transaction_id.ts` — SQLite 事务 ID 切换
- `packages/rxdb-adapter-pglite/src/version/switch_transaction_id.ts` — PGlite 事务 ID 切换

## 测试文件

- `packages/rxdb-adapter-sqlite-wasm/src/__tests__/transaction-executor.spec.ts` — 隔离契约套件：executor 仓库写入回滚后消失 / 提交后留存；`run()` 复用同一 id；逃逸 executor 抛错
- `packages/rxdb-adapter-pglite/src/__tests__/transaction-executor.spec.ts` — PGlite 同构用例（含驱动缺陷专门用例：失败路径上 `tx.closed` 不翻转，executor 必须自己 settle）
- `packages/rxdb-adapter-sqlite-core/src/__tests__/transaction_sqlite_result.spec.ts` — forcedUpdate 时 binary origin 与实体引用隔离
- `packages/rxdb-adapter-pglite/src/__tests__/transaction_pglite_result.spec.ts` — 同上
- `packages/rxdb-adapter-sqlite-core/src/__tests__/RxDBAdapterSqliteBase.spec.ts` — 回调参数断言改为 executor 身份而非 client 同一性
- `packages/rxdb/src/__tests__/RxDB.migration-watermark.spec.ts` — `up(executor)` 形参适配
- `packages/rxdb-adapter-wa-sqlite/src/__tests__/RxDBAdapterSqlite.spec.ts` — 事务基本功能 + 错误回滚
- `packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.spec.ts` — 事务处理 + 主键冲突检测

## 参考

- [文档: 事务](../../../website/docs/model-mutation/README.md)
