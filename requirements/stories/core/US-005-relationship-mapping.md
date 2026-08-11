---
id: US-005
title: 关系映射
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, relationship, orm]
---

# 用户故事：关系映射

## 作为/我想要/以便

**作为** 开发者
**我想要** 定义实体之间的关系（一对一、一对多、多对多）
**以便** 对复杂的关系数据结构进行建模

## 验收标准

| #   | 前置条件                    | 操作                          | 预期结果                               | 状态 |
| --- | --------------------------- | ----------------------------- | -------------------------------------- | ---- |
| 1   | `RelationKind.ONE_TO_ONE`   | 定义关系                      | 支持一对一关联                         | ✅   |
| 2   | `RelationKind.ONE_TO_MANY`  | 定义关系                      | 支持一对多关联                         | ✅   |
| 3   | `RelationKind.MANY_TO_ONE`  | 定义关系                      | 支持多对一关联                         | ✅   |
| 4   | `RelationKind.MANY_TO_MANY` | 定义关系                      | 自动生成中间表实体                     | ✅   |
| 5   | 关系定义完成                | 访问关系属性                  | 通过 `RelationEntityObservable` 懒加载 | ✅   |
| 6   | Eager loading 配置          | 查询时包含 relations          | 通过 JOIN 一次性加载关联数据           | ✅   |
| 7   | 实体代理已创建              | `relation_helper.ts` 注入关系 | 关系属性在代理上自动可用               | ✅   |

## 技术笔记

- 关系类型：`RelationKind` 枚举定义 4 种关系
- M:N 处理：`SchemaManager.init()` 阶段自动生成中间表实体
- 懒加载：通过 `RelationEntityObservable`（单个）/ `RelationEntitiesObservable`（集合）实现
- 关系注入：`relation_helper.ts` 在实体 ES Proxy 上注入关系访问器

## 实现文件

- `packages/rxdb/src/entity/` — 实体和关系定义
- `packages/rxdb/src/schema/SchemaManager.ts` — M:N 中间表生成

## 参考

- [文档: 关系](../../../website/docs/model-definition/relations.md)
