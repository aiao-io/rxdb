---
id: epic-001-core-mvp
status: Done
startDate: 2025-01-01
targetDate: 2026-06-01
owner: jimmy
---

# 核心 MVP 功能

## 愿景

提供一套完整的 Local-first 数据库解决方案，支持 TypeScript 装饰器驱动的实体定义、RxJS 响应式查询、跨框架集成（Angular/React/Vue）和可插拔存储适配器

## 目标

- [x] 使用 TypeScript 装饰器定义数据模型（实体、树、图）
- [x] 生成类型安全的客户端代码
- [x] 支持完整的 CRUD 操作 + 事务
- [x] 支持响应式查询 (RxJS Observable → 框架响应式原语)
- [x] 支持关系映射 (1:1, 1:N, N:1, M:N 自动中间表)
- [x] 支持变更追踪 (patch/inversePatch)
- [x] 支持 6 个存储适配器 (wa-sqlite / sqlite / sqlite-wasm / sqliteai / PGlite / Supabase)
- [x] 支持 3 个框架集成 (Angular Signals, React Hooks, Vue Composables)
- [x] 支持跨 Tab 数据同步
- [x] 支持树形和图数据结构

## 核心引擎故事

- ✅ [US-001 定义数据模型](../stories/core/US-001-model-definition.md) (High)
- ✅ [US-002 客户端代码生成](../stories/core/US-002-client-generation.md) (High)
- ✅ [US-003 数据查询](../stories/core/US-003-data-query.md) (High)
- ✅ [US-004 数据变更](../stories/core/US-004-data-mutation.md) (High)
- ✅ [US-005 关系映射](../stories/core/US-005-relationship-mapping.md) (High)
- ✅ [US-006 响应式查询](../stories/core/US-006-reactive-queries.md) (High)
- ✅ [US-007 变更追踪](../stories/core/US-007-change-tracking.md) (Medium)
- ✅ [US-008 事务支持](../stories/core/US-008-transaction-support.md) (Medium)
- ✅ [US-009 跨 Tab 同步](../stories/core/US-009-cross-tab-sync.md) (High)
- ✅ [US-010 树形数据结构](../stories/core/US-010-tree-entity.md) (Medium)

## 框架集成故事

- ✅ [US-101 Angular 集成](../stories/framework/US-101-angular-integration.md) (High)
- ✅ [US-102 React 集成](../stories/framework/US-102-react-integration.md) (High)
- ✅ [US-103 Vue 集成](../stories/framework/US-103-vue-integration.md) (High)

## 适配器故事（本地存储）

- ✅ [US-201 SQLite 适配器](../stories/adapter/US-201-sqlite-adapter.md) (High)
- ✅ [US-202 PGlite 适配器](../stories/adapter/US-202-pglite-adapter.md) (High)
- ✅ [US-204 SQLite WASM 适配器](../stories/adapter/US-204-sqlite-wasm-adapter.md) (High)
- ✅ [US-205 SQLiteAI 适配器](../stories/adapter/US-205-sqliteai-adapter.md) (High)

> Supabase 适配器（US-203）作为远程同步入口归属 epic-002-data-sync。

## 插件故事

- ✅ [US-501 Workspace 插件](../stories/plugin/US-501-workspace-plugin.md) (Medium)
- ✅ [US-502 Storage 插件](../stories/plugin/US-502-storage-plugin.md) (Medium)
- ✅ [US-503 图数据插件](../stories/plugin/US-503-graph-data.md) (Medium)
