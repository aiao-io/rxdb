---
id: ADMIN-US-102
title: 自定义页面与导航扩展路径
status: Backlog
priority: Medium
epic: ADMIN-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [admin, routing, navigation, customization]
dependsOn: [ADMIN-US-002]
capabilities: [rxdb:US-531, rxdb:US-532]
---

# 用户故事：自定义页面与导航扩展路径

## 作为/我想要/以便

**作为** Admin 业务开发者
**我想要** 按文档增加实体 CRUD 之外的业务页面和导航入口
**以便** 用相同外壳承载概览、操作页等真实业务，而无需复制外壳逻辑。

## 范围边界

### In Scope

- 用一个最小自定义页面验证路由、菜单、面包屑、页签与命令面板接线。
- 记录懒加载页面、导航标识和应用偏好扩展的实际入口。
- 覆盖桌面与移动端导航及刷新后的深链进入。

### Out of Scope

- 为尚无实例的扩展设计插件系统、低代码页面编辑器或多框架模板。
- 独立部署、账号菜单与远程权限。

## 验收标准

| #   | 前置条件                   | 操作                           | 预期结果                                             | 状态 |
| --- | -------------------------- | ------------------------------ | ---------------------------------------------------- | ---- |
| 1   | 按文档添加自定义页面与菜单 | 从桌面、移动菜单进入并刷新深链 | 页面正常显示，实体与备份入口可继续使用               | ⬜   |
| 2   | 页面有稳定路由与标题       | 使用页签、面包屑与命令面板切换 | 路由与外壳状态一致，返回实体页不丢失已有操作路径     | ⬜   |
| 3   | 有一项应用自定义偏好       | 修改偏好、刷新并恢复默认       | 页面按偏好更新，存储遵守应用前缀，步骤有对应回归用例 | ⬜   |

验收证据要求：真实页面代码、可复现文档与浏览器测试；仅列出可编辑文件不代表通过。

## 技术笔记

沿用 [routes](../../../src/app/router.tsx) 和 [buildWorkbenchMenu](../../../src/app/shell/workbench-menu.tsx)，优先把现有接线路径讲清楚，用实际业务验证后再判断是否需要新的抽象。

## 实现文件

- `apps/dev-rxdb-admin/src/app/pages/` — 自定义页面。
- `apps/dev-rxdb-admin/src/app/router.tsx` — 懒加载路由。
- `apps/dev-rxdb-admin/src/app/shell/` — 菜单与偏好扩展。
- `apps/dev-rxdb-admin-e2e/src/admin-shell.spec.ts` — 外壳交互验收入口。

## References

- [ADMIN-US-002](../platform/ADMIN-US-002-application-configuration.md)
- [US-531](../../../../../requirements/stories/domain/US-531-admin-shell-layout-tabbar.md)
- [US-532](../../../../../requirements/stories/domain/US-532-admin-shell-shortcuts-palette-extensions.md)
