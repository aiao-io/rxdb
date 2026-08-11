---
id: US-004
title: 数据变更
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, mutation, crud]
---

# 用户故事：数据变更

## 作为/我想要/以便

**作为** 开发者
**我想要** 对实体执行 create/update/remove 操作
**以便** 完成数据的增删改

## 验收标准

| #   | 前置条件                         | 操作                   | 预期结果                                 | 状态 |
| --- | -------------------------------- | ---------------------- | ---------------------------------------- | ---- |
| 1   | 调用 `repository.create(entity)` | 成功创建               | 实体持久化到本地数据库并触发 CREATE 事件 | ✅   |
| 2   | 修改实体属性（Proxy 拦截）       | 调用 `save()`          | 生成 patch/inversePatch 并持久化         | ✅   |
| 3   | 调用 `repository.remove(id)`     | 成功删除               | 实体被标记删除并触发 REMOVE 事件         | ✅   |
| 4   | 操作在事务中                     | 事务 rollback          | 所有变更撤销，事件不派发                 | ✅   |
| 5   | 批量操作                         | 创建/更新/删除多条记录 | 支持批量处理                             | ✅   |
| 6   | 实体变更跟踪                     | 修改属性               | ES Proxy 自动生成 patch/inversePatch     | ✅   |

## 技术笔记

- 变更跟踪：`EntityManager.createEntityRef()` → ES Proxy 包裹 → 拦截属性赋值生成 patch/inversePatch
- 事务缓冲：事务期间事件入队列，COMMIT 批量派发，ROLLBACK 丢弃
- 关系注入：`relation_helper.ts` 在实体代理上注入 `RelationEntityObservable`/`RelationEntitiesObservable`
- 静态方法注入：EntityManager 向 EntityBase 子类注入 `get()`/`find()`/`findAll()` 等静态方法

## 实现文件

- `packages/rxdb/src/repository/Repository.ts` — 仓库核心 CRUD (348 LOC)
- `packages/rxdb/src/entity/EntityManager.ts` — 实体生命周期/缓存/代理 (455 LOC)

## 参考

- [文档: 变更](../../../website/docs/model-mutation/README.md)
