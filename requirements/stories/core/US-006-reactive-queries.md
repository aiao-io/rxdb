---
id: US-006
title: 响应式查询
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, reactive, rxjs]
---

# 用户故事：响应式查询

## 作为/我想要/以便

**作为** 前端开发者
**我想要** 执行结构化查询并自动接收数据变更通知
**以便** 无需手动刷新即可获得最新数据

## 验收标准

| #   | 前置条件                        | 操作                      | 预期结果                               | 状态 |
| --- | ------------------------------- | ------------------------- | -------------------------------------- | ---- |
| 1   | 调用 `repository.find(options)` | 返回 Observable           | 推送符合条件的数据                     | ✅   |
| 2   | 有新数据被创建                  | 符合现有查询条件          | 查询自动推送更新结果                   | ✅   |
| 3   | 实体 CRUD 事件触发              | `need_refresh_*` 判定通过 | 按需重查或 merge 更新                  | ✅   |
| 4   | 多个相同查询同时存在            | fingerprint 去重          | 复用同一个 `QueryTask`                 | ✅   |
| 5   | 查询 Observable 订阅者归零      | 触发引用计数清零          | 延迟销毁 `QueryTask`                   | ✅   |
| 6   | `QueryCacheRepository` SWR 策略 | 缓存过期                  | 增量同步（元数据 diff → 最小数据拉取） | ✅   |

## 技术笔记

- 查询管道：`Repository.find(options)` → `QueryManager.addQuery(hash, options)` → `QueryTask` (RxJS Observable)
- 自动刷新：监听 `ENTITY_LOCAL_CREATE/UPDATE/REMOVE` 事件 → `need_refresh_*` 判定 → 按需重查
- 缓存去重：对 `FindOptions` 生成 fingerprint，相同查询复用 `QueryTask`
- SWR 同步：`QueryCacheRepository` (639 LOC) 实现 Stale-While-Revalidate 增量同步

## 实现文件

- `packages/rxdb/src/repository/QueryTask.ts` — 查询任务封装 (317 LOC)
- `packages/rxdb/src/repository/QueryManager.ts` — 查询缓存管理 (295 LOC)
- `packages/rxdb/src/repository/QueryCacheRepository.ts` — SWR 同步策略 (639 LOC)

## 参考

- [文档: 响应式查询](../../../website/docs/model-query/query-realtime.md)
