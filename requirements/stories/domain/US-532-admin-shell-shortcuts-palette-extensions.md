---
id: US-532
title: 后台外壳快捷键、命令面板与扩展偏好项
status: In Progress
priority: Medium
epic: epic-010-model-driven-admin-framework
created: 2026-11-06
updated: 2026-11-06
tags: [domain, admin-framework, admin-shell, shortcuts, command-palette, extensions, cross-framework]
---

# 用户故事：后台外壳快捷键、命令面板与扩展偏好项

## 作为/我想要/以便

**作为** 使用模型驱动后台管理框架的使用者与应用开发者
**我想要** 用键盘打开命令面板跳转页面、执行命令、检索数据记录，并让应用把自己的设置项接进同一个偏好抽屉
**以便** 高频操作不离开键盘，业务设置不必另做一套页面。

## 范围依据

owner 于 2026-11-06 批准，是 [US-530](US-530-admin-shell-preferences-appearance.md) 偏好中心的快捷键、命令面板与扩展分组。
扩展偏好项解决的是应用自有设置（例如工作台搜索页的每页条数）没有位置可放的问题。

## 范围边界

### In Scope

- 快捷键注册中心：组合键语法（`Mod` 在 macOS 为 ⌘，其他平台为 Ctrl）、含 Alt 的组合按物理键位匹配、锁屏时全部不响应；
  内置 `Mod+K` 命令面板、`Mod+,` 偏好设置、`Alt+L` 锁屏、`Mod+B` 折叠侧栏、`Alt+W` 关闭当前页签；应用可注册自己的快捷键与命令。
- 快捷键偏好：总开关与逐项停用，停用状态持久化；抽屉的快捷键页签显示键帽。
- 命令面板：原生模态 `<dialog>`，输入框是 combobox、结果是 listbox；聚合「页面」（来自菜单）、「命令」、「最近使用」与应用注册的来源；
  模糊匹配与高亮、↑/↓ 选择、回车执行、Esc 与点击背景关闭；空结果、加载中、部分来源失败三种状态。
- 异步来源：来源可声明最小查询长度，过期查询被取消；`apps/rxdb-admin-template-react` 把全文搜索接成「数据记录」来源，命中后跳到所属实体列表。
- 扩展偏好项：应用声明 `switch` / `text` / `select` / `number` 四类扩展，出现在「拓展」页签，值存放在 `extension.<key>`，与其他偏好一样被清洗、持久化、跨标签同步。
- Angular / React / Vue 同功能。

### Out of Scope

- 自定义快捷键的重新绑定与冲突检测（本故事只支持启停）。
- 命令的参数输入与多步向导。

## 验收标准

| #   | 前置条件               | 操作                                                                        | 预期结果                                                                                         | 状态 |
| --- | ---------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ---- |
| 1   | 外壳已挂载             | 按 `Mod+K`、`Mod+,`、`Alt+L`、`Mod+B`；锁屏状态下再按                       | 对应动作生效；含 Alt 的组合在 macOS 也能匹配；锁屏时全部不响应                                   | ⬜   |
| 2   | 抽屉的快捷键页签       | 关闭总开关，或单独停用「打开命令面板」                                      | 被停用的快捷键失效、其余照常；搜索按钮仍可打开面板；停用状态刷新后保留                           | ⬜   |
| 3   | 命令面板打开           | 输入页面名、用方向键移动、回车、Esc                                         | 结果按分组显示并高亮匹配片段，回车跳转并关闭，Esc 关闭；无结果 / 加载中 / 部分失败各有可见提示   | ⬜   |
| 4   | 应用注册了全文搜索来源 | 在工作台新建一条分类，离开列表后用面板检索其名称                            | 命中记录进入「数据记录」分组并带实体名与命中字段，回车跳到所属实体列表；适配器未连接时不触发搜索 | ⬜   |
| 5   | 应用声明了数字类扩展   | 在拓展页签修改，再进入搜索页                                                | 值被约束到声明范围并写入 `extension.<key>`，搜索页的分页条数随之变化，刷新后保留                 | ⬜   |
| 6   | 三框架外壳与真实工作台 | 在 Angular / React / Vue 与 `apps/rxdb-admin-template-react` 上执行相同流程 | 三端行为与 DOM 契约一致；命令面板在有结果时 axe 零违规                                           | ⬜   |

验收证据：见下方「验收证据」。

## 技术笔记

- [`ShortcutRegistry`](../../../packages/rxdb-admin/src/shortcuts/registry.ts) 与 [组合键语法](../../../packages/rxdb-admin/src/shortcuts/combo.ts)：含 Alt 的组合匹配 `event.code`，
  因为 macOS 上 ⌥L 的 `event.key` 是 `¬`。
- [`PaletteController`](../../../packages/rxdb-admin/src/palette/controller.ts) 汇总同步 / 异步来源并管理选中项、最近使用与取消；
  [`matchText` / `rankItems`](../../../packages/rxdb-admin/src/palette/fuzzy.ts) 产出带高亮区间的匹配与排序。
- 搜索句柄的 `state$` 与 `results$` 派生自同一份快照，状态先到、结果还是旧值；来源必须等 `state$` 结算后再读 `results$`，
  不能用 `combineLatest` 合并（会在状态已变而结果仍为空的瞬间结算，面板永远搜不到数据）。
- 扩展偏好项由 [`extensionToItem`](../../../packages/rxdb-admin/src/preferences/schema/extension.ts) 转成同一套 `PreferenceItem`，抽屉无需特判。

## 实现文件

- `packages/rxdb-admin/src/shortcuts/`、`src/palette/` — 快捷键与命令面板。
- `packages/rxdb-admin/src/preferences/schema/extension.ts` — 扩展偏好项。
- `packages/rxdb-admin-{react,vue,angular}/src/palette/`、`src/preferences/shortcut-list.*` — 三端命令面板与快捷键列表。
- `apps/rxdb-admin-template-react/src/app/shell/record-search.ts`、`workbench-shell.ts` — 全文搜索来源与「每页条数」扩展。
- `apps/rxdb-admin-template-react-e2e/src/admin-shell.spec.ts`、`admin-shell.a11y.spec.ts` — 快捷键、面板、扩展的组合验收。

## 验收证据

- 核心单测：[快捷键](../../../packages/rxdb-admin/src/__tests__/shortcuts/registry.spec.ts)、[命令面板](../../../packages/rxdb-admin/src/__tests__/palette/controller.spec.ts)、[模糊匹配](../../../packages/rxdb-admin/src/__tests__/palette/fuzzy.spec.ts)。
- 应用单测：[全文搜索来源](../../../apps/rxdb-admin-template-react/src/app/shell/record-search.spec.ts)（状态与结果到达顺序、未连接、失败、取消）。
- 三端组件单测：[React](../../../packages/rxdb-admin-react/src/__tests__/palette-lock.spec.tsx)、[Vue](../../../packages/rxdb-admin-vue/src/__tests__/palette-lock.spec.ts)、[Angular](../../../packages/rxdb-admin-angular/src/__tests__/palette-lock.spec.ts)。
- 真实工作台：[外壳验收](../../../apps/rxdb-admin-template-react-e2e/src/admin-shell.spec.ts)（面板、数据记录来源、快捷键启停、扩展驱动分页）与 [a11y 走查](../../../apps/rxdb-admin-template-react-e2e/src/admin-shell.a11y.spec.ts)。

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [US-530 偏好中心与外观设置](US-530-admin-shell-preferences-appearance.md)
