---
id: ADMIN-US-002
title: 应用标识与存储配置
status: In Review
priority: High
epic: ADMIN-EPIC-001
created: 2026-11-06
updated: 2026-11-06
tags: [admin, configuration, compatibility]
dependsOn: []
capabilities: [rxdb:US-526, rxdb:US-530]
---

# 用户故事：应用标识与存储配置

## 作为/我想要/以便

**作为** 在当前仓库孵化新业务的开发者
**我想要** 从一个入口配置应用标题、品牌、数据库名、偏好前缀和可见命名空间
**以便** 定制应用时避免页面、外壳和本机存储配置漂移。

## 范围边界

### In Scope

- 集中 HTML 标题 / 描述、外壳品牌、数据库名、偏好前缀与可见命名空间。
- 首屏主题脚本和运行时偏好使用同一前缀。
- 默认值保持现有工作台兼容；用另一业务命名空间与标识验证接线。

### Out of Scope

- 自动迁移更改数据库名后的历史数据；现有应用仍使用原默认标识。
- 新建独立工程、替换整个资产样例或新增公共包 API。

## 验收标准

| #   | 前置条件                 | 操作                                                 | 预期结果                                                        | 状态 |
| --- | ------------------------ | ---------------------------------------------------- | --------------------------------------------------------------- | ---- |
| 1   | 使用默认配置             | 初始化外壳、数据库与实体注册表                       | 原品牌、数据库名、偏好前缀和资产导航保持兼容                    | ✅   |
| 2   | 使用另一组配置与命名空间 | 初始化并派生可见实体                                 | 品牌、数据库配置、偏好键与实体可见性按配置生效，不再锁定 assets | ✅   |
| 3   | 已有自定义前缀的主题偏好 | 生成 HTML 并执行首屏脚本                             | 首屏读取正确前缀，标题 / 描述正确，外壳与首屏配置一致           | ✅   |
| 4   | 配置接线已完成           | 跑应用 lint、typecheck、test、build 与外壳浏览器回归 | 代码和实际构建产物可用，原用户路径通过                          | ✅   |

验收证据：[app-config.spec.ts](../../../src/app/app-config.spec.ts) 覆盖 `createWorkbenchDatabase`、`createWorkbenchShell` 与真实 Vite HTML 转换；[entity-registry.spec.ts](../../../src/app/entities/entity-registry.spec.ts) 覆盖替换命名空间；构建与浏览器结果见 [当前验收台账](../../verification-report.md)。

## 技术笔记

默认数据库名 `admin-workbench` 与偏好前缀 `aiao.workbench` 承载既有本机数据。新业务可选择新标识，但不能用更改标识冒充迁移。Vite 与运行时读取同一配置，避免独立硬编码主题存储键。

## 实现文件

- `apps/rxdb-admin-template-react/app.config.json` — 应用标识配置。
- `apps/rxdb-admin-template-react/src/app/rxdb/setup_rxdb.ts` — 数据库配置接线。
- `apps/rxdb-admin-template-react/src/app/shell/workbench-shell.ts` — 品牌与存储接线。
- `apps/rxdb-admin-template-react/src/app/entities/entity-registry.ts` — 实体可见性。
- `apps/rxdb-admin-template-react/index.html` / `vite.config.mts` — HTML 与首屏主题接线。

## References

- [US-526 工作台能力](../../../../../requirements/stories/domain/US-526-admin-workbench.md)
- [US-530 外壳偏好能力](../../../../../requirements/stories/domain/US-530-admin-shell-preferences-appearance.md)
- [D-03 数据兼容与宿主边界](../../decisions.md#d-03数据兼容与宿主边界)
