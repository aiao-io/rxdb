---
id: US-202
title: PGlite 适配器
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-28
tags: [adapter, postgres]
---

# 用户故事：PGlite 适配器

## 作为/我想要/以便

**作为** 开发者
**我想要** 使用 PGlite (WASM 版 PostgreSQL) 作为存储引擎
**以便** 我可以在浏览器中使用高级 SQL 功能

## 验收标准

| #   | 前置条件                       | 操作                        | 预期结果                                   | 状态 |
| --- | ------------------------------ | --------------------------- | ------------------------------------------ | ---- |
| 1   | 配置 PGlite 适配器             | 连接                        | 在浏览器中启动 WASM PostgreSQL             | ✅   |
| 2   | 实体注册                       | 建表                        | 自动生成 `notify_change()` PL/pgSQL 触发器 | ✅   |
| 3   | 执行事务                       | 使用 PGlite Transaction API | 支持完整 ACID 语义                         | ✅   |
| 4   | `LISTEN/NOTIFY` 机制           | 数据变更                    | 通过 PG 原生通知触发事件                   | ✅   |
| 5   | `SET CONSTRAINTS ALL DEFERRED` | 事务中有外键依赖            | 支持延迟约束检查                           | ✅   |
| 6   | 分支切换                       | `disableTriggers` 操作      | 删除 triggers → 执行 SQL → 重建 triggers   | ✅   |
| 7   | 标准测试套件（20+ specs）      | 运行适配器测试              | 全部通过                                   | ✅   |

## 技术笔记

- PGlite 客户端：`PGliteClient.ts` 封装 pglite WASM 实例
- 事务支持：完整 ACID 语义，事务锁机制防止嵌套，UUID 事务 ID 追踪
- 触发器：`generate_trigger_sql.ts` 动态生成 PL/pgSQL 变更通知触发器
- LISTEN/NOTIFY：通过 PG 原生通知机制实现实时事件派发
- 分支切换：`switch_transaction_id.ts` 动态更新触发器事务 ID

## 实现文件

- `packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts` — PGlite 适配器核心 (~670 LOC)
- `packages/rxdb-adapter-pglite/src/PGliteClient.ts` — PGlite WASM 封装
- `packages/rxdb-adapter-pglite/src/transaction_pglite_result.ts` — 事务结果处理
- `packages/rxdb-adapter-pglite/src/version/switch_transaction_id.ts` — 事务 ID 切换
- `packages/rxdb-adapter-pglite/src/version/switch_branch.ts` — 分支切换实现

## 测试文件

- `packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.spec.ts` — 核心功能测试
- `packages/rxdb-adapter-pglite/src/__tests__/transaction_pglite_result.spec.ts` — 事务测试

## 参考

- [文档: PGlite 适配器](../../../website/docs/adapters/pglite.md)
