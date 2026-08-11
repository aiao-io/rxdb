---
id: US-010
title: 树形数据结构
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [core, tree, entity]
---

# 用户故事：树形数据结构

## 作为/我想要/以便

**作为** 需要管理层级数据的开发者
**我想要** 对树形结构（文件管理器、菜单、分类目录）进行 CRUD 和拖拽操作
**以便** 高效管理父子层级数据

## 验收标准

| #   | 前置条件                       | 操作                      | 预期结果                       | 状态 |
| --- | ------------------------------ | ------------------------- | ------------------------------ | ---- |
| 1   | 使用 `@TreeEntity()` 装饰器    | 注册到 RxDB               | 自动添加 `parentId` 自引用关系 | ✅   |
| 2   | 树形实体（文件/菜单）          | 创建子节点                | 正确设置 `parentId` 和排序     | ✅   |
| 3   | 拖拽节点到新父节点             | 执行移动操作              | 更新 `parentId` 和排序字段     | ✅   |
| 4   | 文件管理器中创建同路径文件     | 保存                      | 阻止并提示冲突                 | ✅   |
| 5   | 执行了拖拽操作                 | undo                      | 节点恢复到原始位置             | ✅   |
| 6   | 调用 `findDescendants(nodeId)` | 查询                      | 返回所有后代节点               | ✅   |
| 7   | 调用 `findAncestors(nodeId)`   | 查询                      | 返回所有祖先节点               | ✅   |
| 8   | 三端 Tree hooks                | 使用 `useTreeFind` 等 API | 跨框架行为一致                 | ✅   |

## 技术笔记

- 装饰器：`@TreeEntity()` 扩展 `@Entity()`，自动生成 `parentId` 属性
- 仓库：`TreeRepository` 继承 `Repository`，提供 `findDescendants`/`findAncestors`/`findRoots` 等方法
- 适配器支持：SQLite/PGlite 均实现 `TreeRepository`，Supabase 使用递归 CTE
- Demo 覆盖：Angular/React/Vue 三端均有 Tree Menu (3 种) + File Manager (3 种) 演示

## 实现文件

- `packages/rxdb/src/entity/@TreeEntity.ts` — 树形实体装饰器
- `packages/rxdb/src/repository/TreeRepository.ts` — 树形仓库
- `packages/rxdb-adapter-*/src/*TreeRepository.ts` — 各适配器实现

## 参考

- [文档: 树形数据查询](../../../website/docs/model-query/findDescendants.md)
