---
id: US-503
title: 图数据插件
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-02-08
tags: [plugin, graph]
---

# 用户故事：图数据插件

## 作为/我想要/以便

**作为** 需要处理网络关系的开发者
**我想要** 在实体间建立图关系（有向/无向边，权重）
**以便** 支持邻居查询、路径查找等图操作

## 验收标准

| #   | 前置条件                         | 操作                       | 预期结果          | 状态 |
| --- | -------------------------------- | -------------------------- | ----------------- | ---- |
| 1   | `@GraphEntity()` 装饰器          | 注册到 RxDB                | 自动生成 edges 表 | ✅   |
| 2   | 调用 `addEdge(from, to, weight)` | 成功                       | 创建边关系        | ✅   |
| 3   | 调用 `findNeighbors(nodeId)`     | 查询                       | 返回所有相连节点  | ✅   |
| 4   | 调用 `findPaths(from, to)`       | 查询                       | 返回可达路径      | ✅   |
| 5   | 三端 Graph hooks                 | 使用 `useGraphFind` 等 API | 跨框架行为一致    | ✅   |
| 6   | 图数据作为插件实现               | 通过 `IRxDBPlugin` 注册    | 遵循插件架构规范  | ✅   |

## 技术笔记

- 装饰器：`@GraphEntity()` 扩展实体定义
- 仓库：`GraphRepository` 提供图操作方法
- 插件：`rxdb-plugin-graph` 遵循 `IRxDBPlugin` + `RxDBPluginBase` 模式
- Demo 覆盖：Angular/React/Vue 三端均有图数据演示

## 实现文件

- `packages/rxdb-plugin-graph/` — 图数据插件

## 参考

- [文档: 图数据插件 API](../../../website/docs/api/rxdb-plugin-graph/README.md)
