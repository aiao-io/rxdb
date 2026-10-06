---
id: US-010
title: 树形数据结构
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-10-06
tags: [core, tree, entity]
---

# 用户故事：树形数据结构

## 作为/我想要/以便

**作为** 需要管理层级数据的开发者
**我想要** 对树形结构（文件管理器、菜单、分类目录）进行 CRUD 和拖拽操作
**以便** 高效管理父子层级数据

## 验收标准

| #   | 前置条件                       | 操作                             | 预期结果                       | 状态 |
| --- | ------------------------------ | -------------------------------- | ------------------------------ | ---- |
| 1   | 使用 `@TreeEntity()` 装饰器    | 注册到 RxDB                      | 自动添加 `parentId` 自引用关系 | ✅   |
| 2   | 树形实体（文件/菜单）          | 创建子节点                       | 正确设置 `parentId` 和排序     | ✅   |
| 3   | 拖拽节点到新父节点             | 执行移动操作                     | 更新 `parentId` 和排序字段     | ✅   |
| 4   | 文件管理器中创建同路径文件     | 保存                             | 阻止并提示冲突                 | ✅   |
| 5   | 执行了拖拽操作                 | undo                             | 节点恢复到原始位置             | ✅   |
| 6   | 调用 `findDescendants(nodeId)` | 查询                             | 返回所有后代节点               | ✅   |
| 7   | 调用 `findAncestors(nodeId)`   | 查询                             | 返回所有祖先节点               | ✅   |
| 8   | 三端 Tree hooks                | 使用 `useFindDescendants` 等 API | 跨框架行为一致                 | ✅   |

## 技术笔记

- 装饰器：`@TreeEntity()`（`@aiao/rxdb-plugin-tree`）包装 `@Entity()`，补全 `features.tree` 并默认 `repository: 'TreeRepository'`；`parentId` 外键与 `children` 来自 `TreeAdjacencyListEntityBase` 的 parent / children 关系
- 仓库：`TreeRepository`（同一插件，需 `rxdb.use(rxDBPluginTree)` 注册）继承 `Repository`，提供 `findDescendants` / `countDescendants` / `findAncestors` / `countAncestors`
- 适配器支持：SQLite / PGlite / Supabase 各有 `ITreeRepository` 实现；Supabase 按层 `in('parentId')` 逐级展开，不用递归 CTE
- 三端 hooks：`@aiao/rxdb-plugin-tree-{angular,react,vue}` 导出 `useFindDescendants` / `useCountDescendants` / `useFindAncestors` / `useCountAncestors`
- Demo 覆盖：`apps/dev-rxdb-{angular,react,vue}` 均有 Tree Menu 与 File Manager 演示

## 实现文件

- `packages/rxdb-plugin-tree/src/entity/tree-entity.decorator.ts` — 树形实体装饰器
- `packages/rxdb-plugin-tree/src/repository/TreeRepository.ts` — 树形仓库
- `packages/rxdb-adapter-*/src/**/*TreeRepository.ts` — 各适配器实现
- `packages/rxdb-plugin-tree-{angular,react,vue}/src/use-tree.ts` — 三端 hooks

## 参考

- [文档: 树形数据查询](../../../website/docs/model-query/findDescendants.md)
