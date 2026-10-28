---
id: US-529
title: 实体列表视图配置：字段显隐、多字段排序与分组
status: Done
priority: Medium
epic: epic-010-model-driven-admin-framework
created: 2026-10-25
updated: 2026-10-28
tags: [domain, admin-framework, rxdb-model, table, cross-framework]
---

# 用户故事：实体列表视图配置：字段显隐、多字段排序与分组

## 作为/我想要/以便

**作为** 使用预置 schema 工作台管理数据的使用者
**我想要** 调整列表字段显隐和顺序、按多个字段排序、按一个字段分组
**以便** 在同一份数据上组织当前需要的展示和浏览顺序，减少无关列与逐条查找。

## 范围依据

owner 批准字段配置、排序和分组三项，依据为 [Teable 调研](../../teable-research.md)。
该切片扩展通用模型 UI：公共逻辑集中于 `rxdb-model`，三端同时交付，复用列头排序、关系编辑、筛选与 CRUD。
字段顺序使用拖拽，显隐使用开关，配置弹层须完整显示在视口内。

## 范围边界

### In Scope

- 开关控制字段显隐，拖拽手柄支持鼠标、触摸及方向键调整顺序，并可重置；至少保留一个数据字段，操作列和选择列保持固定位置。
- 多字段升降序、优先级调整、移除与清除；查询排序以唯一键稳定分页，列头排序继续可用。
- 字段显隐与顺序调整只更新展示，不重建查询或丢弃已加载分页。
- 单字段分组、展开折叠与取消；未填写值保留在空值组，组内数量明确为已加载记录数。
- 分组状态禁用手动行拖拽；分组标题作为只读节点，不能编辑、粘贴、删除或落库。
- Angular / React / Vue 同功能；工作台默认消费新工具栏，实体切换重置配置。
- 三类配置弹层使用原生 Popover，在视口内定位，避开右侧边界及列表容器裁切；窗口缩放、滚动后重新定位，支持 Escape 关闭。

### Out of Scope

- schema 编辑、字段类型修改、命名视图和配置持久化。
- 多层分组、全量聚合、CSV 交换、权限隔离与多人共享配置。

## 验收标准

| #   | 前置条件                       | 操作                                         | 预期结果                                                                 | 状态 |
| --- | ------------------------------ | -------------------------------------------- | ------------------------------------------------------------------------ | ---- |
| 1   | 列表有多个数据字段             | 切换显隐开关、拖动字段并重置                 | 列表及时更新，至少保留一个数据字段，操作与选择列位置不变                 | ✅   |
| 2   | 记录有不同的排序字段值         | 添加多个排序、改变方向、调整优先级、移除规则 | 查询结果符合规则优先级，分页保留唯一键排序                               | ✅   |
| 3   | 已配置工具栏排序               | 点击列头排序或清除排序                       | 列头交互继续生效，清除后回到实体默认排序                                 | ✅   |
| 4   | 分组字段包含空值、false 或零   | 设置分组、折叠展开、取消分组                 | 记录不丢失，空值组可见，计数明确为已加载记录                             | ✅   |
| 5   | 表格处于分组状态               | 尝试编辑标题、粘贴、清空或拖拽行             | 分组标题不产生业务写入，手动拖拽关闭，组内业务行仍可编辑                 | ✅   |
| 6   | 三框架实体列表及真实工作台可用 | 执行相同配置流程，切换实体并在窄屏操作       | 三端行为一致，配置重置，桌面与窄屏弹层完整可见；真实 VTable 组合验收通过 | ✅   |

## 技术笔记

- [`ListViewState`](../../../packages/rxdb-model/src/entity-list/list-view.ts) 统一字段顺序、显隐、查询排序与分组；
  `buildListViewOrderBy` 构造查询规则，分组字段参与查询顺序，唯一键稳定分页。
- `buildListViewRecords` 仅规范展示副本中的空分组值；`buildListViewTableOptions` 接入 VTable 原生分组。
- [`isReadonly`](../../../packages/rxdb-model/src/entity-table/columns/column-utils.ts) 识别分组标题，
  复用于编辑器、剪贴板、键盘及三端单元格事件入口。
- `ListViewSettingsController` 统一三端弹层定位及拖拽生命周期，复用 `@aiao/utils` 的 `FixedRowDrag`；取消拖拽或字段序列变化时不提交旧落点。
- 领域功能与 `packages/*` 改动按 [AGENTS.md](../../../AGENTS.md) 单独提取、评审和合并。

## 实现文件

- `packages/rxdb-model/src/entity-list/list-view.ts` — 共享视图状态与派生逻辑。
- `packages/rxdb-model/src/entity-list/list-view-settings.ts` — 共享 Popover 定位、拖拽及键盘交互。
- `packages/rxdb-model-{angular,react,vue}/src/entity-list/` — 三端工具栏与列表接线。
- `packages/rxdb-model/src/entity-table/` — 分组标题只读保护。
- `packages/rxdb-model-{angular,react,vue}/src/entity-table/` — 单元格事件只读保护。
- `packages/rxdb-model/src/__tests__/entity-list/list-view.spec.ts` — 核心配置与边界测试。
- `packages/rxdb-model/src/__tests__/entity-list/list-view-settings.spec.ts` — 弹层边界、拖拽与取消、销毁清理测试。
- `packages/rxdb-model-{angular,react,vue}/src/__tests__/entity-list/` — 三端真实组件交互回归。
- `apps/dev-rxdb-admin-e2e/src/list-view.spec.ts` — 真实表格、空值分组、分组后编辑与窄屏验收。

## 验收证据

- [共享视图断言](../../../packages/rxdb-model/src/__tests__/entity-list/list-view.spec.ts)与[配置交互断言](../../../packages/rxdb-model/src/__tests__/entity-list/list-view-settings.spec.ts)：排序、分组、弹层边界、拖拽取消与销毁清理。
- [Angular](../../../packages/rxdb-model-angular/src/__tests__/entity-list/entity-list.real.spec.ts)、[React](../../../packages/rxdb-model-react/src/__tests__/entity-list/entity-list.real.spec.tsx)、[Vue](../../../packages/rxdb-model-vue/src/__tests__/entity-list/entity-list.real.spec.ts)：真实组件的字段显隐、方向键调序、重置、排序清除与实体切换；字段显隐不重查分页。
- [工作台真实表格验收](../../../apps/dev-rxdb-admin-e2e/src/list-view.spec.ts)：拖拽、排序、空值分组、折叠与分组后编辑；桌面及窄屏弹层完整可见，Escape 关闭。

配置只保存在当前组件会话中；页面刷新或切换实体会恢复默认值。分组计数只覆盖已加载记录。
命名视图、配置持久化、多层分组及全量汇总仍需单独确定范围。

## References

- [合入 PR #152](https://github.com/aiao-io/rxdb/pull/152)
- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [Teable 调研与后续决策依据](../../teable-research.md)
