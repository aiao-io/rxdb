---
id: US-902
title: DevTools 面板
status: Done
priority: Low
epic: epic-003-ui-developer-tools
created: 2025-12-08
updated: 2026-05-15
tags: [tooling, devtools]
---

# 用户故事：DevTools 面板

## 作为/我想要/以便

**作为** 开发者
**我想要** 在浏览器 DevTools 中检查 RxDB 状态
**以便** 调试实时应用中的数据流

## 验收标准

| #   | 前置条件        | 操作          | 预期结果               | 状态 |
| --- | --------------- | ------------- | ---------------------- | ---- |
| 1   | Chrome 扩展安装 | 打开 DevTools | 显示 RxDB 面板         | ✅   |
| 2   | RxDB 实例运行中 | 查看面板      | 展示所有实体和当前查询 | ✅   |
| 3   | 实时查询监控    | 数据变更      | DevTools 面板实时更新  | ✅   |
| 4   | 事件流追踪      | 查看事件面板  | 展示 17 种事件的实时流 | ✅   |

## 技术笔记

- 核心包 `@aiao/rxdb-devtools`（当前 v0.0.9）在本仓库 `packages/rxdb-devtools/`，提供 `connector` / `sequence` / `serializer` 等运行时基础设施
- 浏览器扩展工程在 `apps/rxdb-devtools-extension/`，技术栈：Chrome Extensions API + React/Preact
- 集成方式：宿主应用调用 `openRxdbDevtools()` 建立 DevTools 通道（参考 React demo）

## 实现文件

- `packages/rxdb-devtools/` — DevTools 运行时连接器与序列化层
- `apps/rxdb-devtools-extension/` — Chrome DevTools 扩展工程
- `apps/dev-rxdb-react/src/app/contexts/AppServiceContext.tsx` — React 应用集成示例

## 参考

- [Epic: UI 组件与开发者工具](../../epics/epic-003-ui-developer-tools.md)
