---
id: US-001
title: 定义数据模型
status: Done
priority: High
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, model, entity, decorator]
---

# 用户故事：定义数据模型

## 作为/我想要/以便

**作为** 开发者
**我想要** 使用 TypeScript 类和装饰器定义数据模型（属性类型、关系、索引、默认值）
**以便** 用面向对象的方式描述数据结构，自动生成数据库 schema

## 验收标准

| #   | 前置条件                     | 操作                 | 预期结果                                                    | 状态 |
| --- | ---------------------------- | -------------------- | ----------------------------------------------------------- | ---- |
| 1   | 带 `@Entity()` 装饰器的类    | 注册到 RxDB          | 自动识别所有属性和关系元数据                                | ✅   |
| 2   | 实体包含 MANY_TO_MANY 关系   | 注册到 SchemaManager | 自动生成中间表实体                                          | ✅   |
| 3   | 使用 `@TreeEntity()` 装饰器  | 注册                 | 自动添加 parentId 自引用关系                                | ✅   |
| 4   | 使用 `@GraphEntity()` 装饰器 | 注册                 | 通过插件自动生成 edges 表                                   | ✅   |
| 5   | 属性设置了 `unique: true`    | 建表                 | 包含唯一约束                                                | ✅   |
| 6   | 实体继承 `EntityBase`        | 创建实例             | 自动包含 id, createdAt, updatedAt, createdBy, updatedBy     | ✅   |
| 7   | `PropertyType` 枚举          | 定义属性             | 支持 uuid, string, number, boolean, date, json, enum, array | ✅   |
| 8   | `RelationKind` 枚举          | 定义关系             | 支持 ONE_TO_ONE, ONE_TO_MANY, MANY_TO_ONE, MANY_TO_MANY     | ✅   |

## 技术笔记

- 装饰器体系：`@Entity()` / `@TreeEntity()` / `@GraphEntity()` + 元数据描述
- 基类：`EntityBase` 提供 5 个标准字段（id, createdAt, updatedAt, createdBy, updatedBy）
- 元数据选项：`metadata-options.interface.ts` (921 LOC) 定义完整的属性/关系/索引配置
- Schema 初始化链：`RxDB.init()` → `SchemaManager.init()` → 解析元数据 + 生成 M:N 中间表 → 适配器 `createTables()`

## 实现文件

- `packages/rxdb/src/entity/@Entity.ts` — 实体装饰器
- `packages/rxdb/src/entity/EntityManager.ts` — 实体生命周期/缓存/代理 (455 LOC)
- `packages/rxdb/src/entity/metadata-options.interface.ts` — 元数据选项定义 (921 LOC)
- `packages/rxdb/src/schema/SchemaManager.ts` — Schema 管理

## 参考

- [文档: 模型定义](../../../website/docs/model-definition/README.md)
