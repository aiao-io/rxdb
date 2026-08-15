---
id: US-501
title: Workspace 插件
status: Done
priority: Medium
epic: epic-001-core-mvp
created: 2025-12-08
updated: 2026-07-29
tags: [plugin, workspace, draft-recovery]
---

# 用户故事：Workspace 插件

## 作为/我想要/以便

**作为** 需要草稿能力的开发者
**我想要** 新建但尚未保存的实体自动落到浏览器本地缓存
**以便** 刷新或重开页面后草稿还在，可以继续编辑、保存或丢弃

## 验收标准

| #   | 前置条件                    | 操作                           | 预期结果                                                                      | 状态 |
| --- | --------------------------- | ------------------------------ | ----------------------------------------------------------------------------- | ---- |
| 1   | workspace plugin 已安装     | `new Todo()`（NEW 事件）       | 草稿进入内存缓存并写入 IndexedDB（`idb-keyval`），不写主表                    | ✅   |
| 2   | 缓存中有草稿                | `list()`                       | 返回草稿快照（`cacheId` / `namespace` / `entity` / `id` / `data`）            | ✅   |
| 3   | 缓存中有草稿                | `entity.save()`（CREATE 事件） | 数据落主表，对应草稿自动移出缓存并从 IndexedDB 删除                           | ✅   |
| 4   | 缓存中有草稿                | `discard(cacheId)`             | 草稿与对应 entity 缓存一并清理                                                | ✅   |
| 5   | 刷新或重开浏览器            | `install()`                    | IndexedDB 草稿恢复；已注册类型重建 entity ref，未注册类型仍保留在 `list()` 中 | ✅   |
| 6   | 同源多标签页                | 任一标签页新增或丢弃草稿       | 经 BroadcastChannel 同步，接收端重建实体缓存并重新入本地持久化队列            | ✅   |
| 7   | 草稿状态变化                | 订阅 `changes$`                | 发出通知，调用方据此重新 `list()`（三端 demo 即用此刷新列表）                 | ✅   |
| 8   | `autoSave: false`           | 事件产生变更                   | 内存与跨标签页状态更新，但不自动写 IndexedDB，须显式 `await flush()`          | ✅   |
| 9   | IndexedDB 写入失败          | `flush()`                      | reject 并恢复待写/待删集合，不在后台重试；环境修复后显式再调用即可重试        | ✅   |
| 10  | 插件遵循 `IRxDBPlugin` 接口 | 通过 factory 注册              | 重复 factory 调用返回同一实例且不重复注册监听器；`destroy()` 清理监听与队列   | ✅   |

## 范围边界

只覆盖**尚未入库的 NEW 草稿**。不在范围内：

- 已存在实体的未保存 UPDATE（`ENTITY_LOCAL_UPDATE_EVENT` 在写库成功之后才派发，未保存编辑只存在于各实体自己的 `EntityStatus.patch`，包内无法可靠订阅到全局未保存变更流）
- 回滚到编辑前状态（需要完整 base/inverse patch 模型）；丢弃草稿用 `discard(cacheId)`
- DELETE 撤销（REMOVE / CREATE 事件只负责清理对应草稿，不保存被删实体快照）

## 技术笔记

- 插件接口：`IRxDBPlugin` + `RxDBPluginBase`；入口为 `rxDBPluginWorkspace` factory，实例挂载在只读的 `rxdb.workspace` 属性上（同一 `RxDB` 实例只允许一个）
- 事件源：仅监听 `ENTITY_LOCAL_NEW_EVENT`（缓存草稿）、`ENTITY_LOCAL_CREATE_EVENT` / `ENTITY_LOCAL_REMOVE_EVENT`（清理草稿）
- 缓存键：`WorkspaceCacheId` = `` `${namespace}:${entity}:${id}` ``
- 草稿存储：`idb-keyval` 自定义 store（store 名为 `workspace`，DB 名取 `rxdb.config.dbName`）
- 写盘调度：变更进入 `need_save` / `need_delete` 队列，经 `debounceTime(0)` 合并后批量 `setMany` / `delMany`；`autoSave`（默认 `true`）控制是否自动触发，`flush()` 为显式写入屏障
- 跨标签页：BroadcastChannel（频道名 `<dbName>_workspace_sync`）广播 `add` / `remove`，按 `clientId` 过滤自身消息；`origin === 'cross-tab'` 的 NEW 事件不再回播
- 工作流：`new Entity()` → 草稿缓存 → `entity.save()`（落主表）｜ `discard()`（丢弃）
- 公开 API：`ready`、`install()`、`destroy()`、`list()`、`discard()`、`flush()`、`changes$`、`cacheCount`
- 浏览器边界：依赖 `crypto.randomUUID()` 与 IndexedDB，BroadcastChannel 可用时才启用跨标签页同步；不可在 SSR 渲染阶段构造

## 后续清理

- `stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 与 `WorkspaceCacheEntry.staged` 是早期 Git 式暂存流程的遗留导出，三端 demo 与仓库内均无调用方，仅插件自测在用。已从文档移除，代码中标记待移除；实际删除属于破坏性变更，单独一次改动处理。

## 实现文件

- `packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.ts` — 插件实现与 `rxDBPluginWorkspace` factory
- `packages/rxdb-plugin-workspace/src/index.ts` — 公开导出（factory + `RxDBPluginWorkspaceOptions` / `WorkspaceCacheEntry` / `WorkspaceCacheId`）

### 演示用例

- `apps/dev-rxdb-angular/src/app/pages/workspace/workspace.page.ts`
- `apps/dev-rxdb-react/src/app/pages/workspace.tsx`
- `apps/dev-rxdb-vue/src/pages/WorkspacePage.vue`

## 测试文件

- `packages/rxdb-plugin-workspace/src/RxDBPluginWorkspace.spec.ts` — 事件处理、草稿缓存、flush、安装与生命周期、跨标签页同步

## 参考

- [包 README](../../../packages/rxdb-plugin-workspace/README.md)
- [网站文档: Workspace 插件](../../../website/docs/plugins/rxdb-plugin-workspace/README.md)
