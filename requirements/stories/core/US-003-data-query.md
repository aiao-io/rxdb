---
id: US-003
title: 数据查询
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, query, dsl]
---

# 用户故事：数据查询

## 作为/我想要/以便

**作为** 开发者
**我想要** 使用结构化 DSL 查询数据（过滤、排序、分页）
**以便** 高效地检索特定记录

## 验收标准

| #   | 前置条件                                          | 操作           | 预期结果                                   | 状态 |
| --- | ------------------------------------------------- | -------------- | ------------------------------------------ | ---- |
| 1   | 调用 `repository.find({ rules, orderBy, limit })` | 传入 RuleGroup | 返回符合条件的数据                         | ✅   |
| 2   | `findOne()` / `findOneOrFail()`                   | 查询单条记录   | 返回第一条匹配或抛异常                     | ✅   |
| 3   | 查询 DSL 使用 `RuleGroup` + `Rule`                | 组合条件       | 支持 and/or 嵌套                           | ✅   |
| 4   | 20 种操作符                                       | 构建规则       | 支持 =, !=, <, >, contains, in, between 等 | ✅   |
| 5   | `OrderBy[]` 排序                                  | 指定多字段     | 按优先级排序                               | ✅   |
| 6   | offset/limit 分页                                 | 请求特定页     | 返回对应范围的数据                         | ✅   |
| 7   | `findByCursor` 游标分页                           | 请求下一页     | 返回正确的后续数据                         | ✅   |
| 8   | `findAll()` 方法                                  | 调用           | 返回实体所有记录                           | ✅   |
| 9   | `count()` 方法                                    | 调用           | 返回符合条件的记录数                       | ✅   |

## 技术笔记

- 查询 DSL：`RuleGroup` + `Rule` 组合器树，支持 20 种操作符
- 缓存：`QueryManager` 管理 `QueryTask` 池，生成 fingerprint 去重
- 分页：offset/limit + 游标分页（`findByCursor`）
- 观察者引用计数：subscribe 时 +1，unsubscribe 时 -1，归零后延迟销毁

## 实现文件

- `packages/rxdb/src/repository/Repository.ts` — 仓库核心 CRUD (348 LOC)
- `packages/rxdb/src/repository/QueryManager.ts` — 查询缓存管理 (295 LOC)
- `packages/rxdb/src/repository/QueryTask.ts` — 查询任务封装 (317 LOC)

## 参考

- [文档: 查询](../../../website/docs/model-query/README.md)
