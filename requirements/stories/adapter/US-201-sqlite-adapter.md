---
id: US-201
title: SQLite 适配器
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-10-06
tags: [adapter, sqlite]
---

# 用户故事：SQLite 适配器

## 作为/我想要/以便

**作为** 开发者
**我想要** 使用 SQLite 作为存储引擎
**以便** 我可以在浏览器 (通过 WASM) 或原生应用中可靠地持久化数据

## 验收标准

| #   | 前置条件                  | 操作           | 预期结果                                  | 状态 |
| --- | ------------------------- | -------------- | ----------------------------------------- | ---- |
| 1   | 配置 SQLite 适配器        | 连接数据库     | 通过 Web Worker 运行 SQLite，不阻塞主线程 | ✅   |
| 2   | 应用选择 OPFS VFS         | 初始化         | 使用 OPFS VFS 持久化存储                  | ✅   |
| 3   | 应用选择 IDB VFS          | 初始化         | 使用 IDB VFS，可配 SharedWorker 跨标签页  | ✅   |
| 4   | 执行复杂查询              | SQL 生成       | 正确处理 RuleGroup → SQL 转换             | ✅   |
| 5   | 事务操作                  | 执行           | 支持完整的事务语义                        | ✅   |
| 6   | 分支切换                  | 执行切换操作   | 正确处理数据迁移                          | ✅   |
| 7   | `sqlite_update_hook`      | 数据变更       | 通过回调通知变更                          | ✅   |
| 8   | `AsyncQueueExecutor`      | 并发操作       | 串行化 SQL 执行避免冲突                   | ✅   |
| 9   | 标准测试套件（25+ specs） | 运行适配器测试 | 全部通过                                  | ✅   |

## 技术笔记

- 执行器：`AsyncQueueExecutor` 串行化 SQL 执行，避免并发冲突
- VFS 机制：由应用经 `vfs` 选项选择，默认 `IDBBatchAtomicVFS`；OPFS 系 VFS 与 IDB 系 VFS 的能力矩阵见 `WA_SQLITE_VFS_LIST`。不自动降级，OPFS 是否可用由应用用 `checkOPFSAvailable()`（`@aiao/utils`）判断后选择
- 事务支持：完整 ACID 语义，支持事务锁防止嵌套
- 触发器：`generate_table_trigger_sql()`（sqlite-core）动态生成变更记录触发器
- 分支切换：`switch_transaction_id.ts` 动态更新事务 ID

## 实现文件

- `packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts` — SQLite 适配器核心（SQLite 系适配器共享）
- `packages/rxdb-adapter-wa-sqlite/src/RxDBAdapterSqlite.ts` — wa-sqlite 后端绑定
- `packages/rxdb-adapter-sqlite-core/src/transaction_sqlite_result.ts` — 事务结果处理
- `packages/rxdb-adapter-sqlite-core/src/version/switch_transaction_id.ts` — 事务 ID 切换
- `packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts` — 分支切换实现
- `packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts` — SQL 执行辅助

## 测试文件

- `packages/rxdb-adapter-sqlite-wasm/src/__tests__/RxDBAdapterSqlite.spec.ts` — 核心功能测试
- `packages/rxdb-adapter-sqlite-core/src/__tests__/transaction_sqlite_result.spec.ts` — 事务测试

## 参考

- [文档: SQLite 适配器](../../../website/docs/adapters/sqlite.md)
