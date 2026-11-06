---
id: US-530
title: 后台外壳偏好中心：声明式 schema 驱动的偏好抽屉与外观设置
status: In Progress
priority: Medium
epic: epic-010-model-driven-admin-framework
created: 2026-11-06
updated: 2026-11-06
tags: [domain, admin-framework, admin-shell, preferences, theme, cross-framework]
---

# 用户故事：后台外壳偏好中心：声明式 schema 驱动的偏好抽屉与外观设置

## 作为/我想要/以便

**作为** 使用模型驱动后台管理框架的开发者与终端使用者
**我想要** 在后台右上角打开一个偏好抽屉，调整主题、主色、圆角、字号等外观，设置自动保存并在刷新、多标签间保持一致
**以便** 不再为每个后台各写一套设置页，也不用在换主题时忍受首屏闪烁或表格仍是白底。

## 范围依据

owner 于 2026-11-06 批准把 aiao-enterprise 偏好中心的外观、布局、快捷键、扩展能力引入本仓的后台外壳，落点为新包族
`@aiao/rxdb-admin`（无头核心）与 `-react` / `-vue` / `-angular` 三端壳；布局模式取四种，不含登录、通知、AI 与页面缓存相关项。
此前 `apps/dev-rxdb-admin` 只有固定宽度侧栏与亮 / 暗二选一，无处承载更多设置。

偏好中心是四个故事的公共底座：[US-531](US-531-admin-shell-layout-tabbar.md) 布局与页签栏、
[US-532](US-532-admin-shell-shortcuts-palette-extensions.md) 快捷键 / 命令面板 / 扩展、
[US-533](US-533-admin-shell-widgets-lock-general.md) 顶栏部件 / 锁屏 / 通用设置都挂在它的 schema 与存储上。

## 范围边界

### In Scope

- 声明式偏好 schema：每个设置项由 `PreferenceItem`（路径、控件种类、页签、分区、约束）声明，偏好抽屉按 schema 通用渲染，没有手写表单；
  控件种类覆盖开关、下拉、分段、卡片、数字、文本、主色、主题网格、部件排序、快捷键列表。
- 偏好状态树 `AdminPreferences`、清洗约束、深合并更新；存储只落相对默认值的差异，应用调整默认值时未改动过的用户自动跟随。
- 外观：主题（35 个 daisyUI 主题目录，应用按启用的主题挑选子集，支持跟随系统）、主色、圆角、字号、半深色侧栏 / 顶栏、
  紧凑密度、灰色 / 色弱模式；写入根节点属性与 CSS 变量，表格随明暗主题重绘。
- 持久化：`localStorage` 差异存储、同源多标签 `storage` 同步、页面隐藏时落盘（不覆盖其他标签刚写入的值）、导出 / 导入 JSON、重置；
  首次使用从应用旧键迁移；内联首屏脚本在框架渲染前应用主题。
- 偏好抽屉：原生模态 `<dialog>`，五个页签（外观 / 布局 / 快捷键 / 通用 / 拓展）；Esc、关闭按钮、点击背景关闭。
- Angular / React / Vue 同功能；`apps/dev-rxdb-admin` 接入并以 `apps/dev-rxdb-admin-e2e` 完成组合验收。

### Out of Scope

- 把偏好同步到服务端或多设备（存储介质可注入，但本故事只交付本机存储）。
- 登录态相关设置、通知、AI 助手与页面缓存（keepAlive）。
- 自定义主题编辑器：主题来自 daisyUI 目录，应用只选子集与主色。

## 验收标准

| #   | 前置条件                                  | 操作                                                             | 预期结果                                                                                                                 | 状态 |
| --- | ----------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 外壳已挂载，偏好为默认值                  | 点击顶栏齿轮或按 `Mod+,`，浏览五个页签，用 Esc / 关闭 / 背景关闭 | 抽屉是模态 `<dialog>`，五个页签由 schema 渲染，三种关闭方式都回写关闭状态，迟到的 `close` 事件不会吞掉紧随其后的重新打开 | ⬜   |
| 2   | 应用启用了多个 daisyUI 主题               | 点击主题卡片、顶栏主题按钮，切换到深色主题                       | `<html data-theme>` 立即变化，`color-scheme` 随之切换；表格（VTable）随明暗重绘；刷新后首帧即为所选主题，无闪烁          | ⬜   |
| 3   | 修改任意偏好                              | 刷新页面、另开同源标签页、修改默认值后重新加载                   | 只有与默认值不同的部分被存储；其他标签页同步；页面隐藏落盘不会用旧快照覆盖其他标签的新值；默认值变化被未改动的用户采纳   | ⬜   |
| 4   | 偏好中有若干改动                          | 导出 JSON，重置，再导入；导入非法文本或非对象                    | 导出内容即差异；导入后整体替换并清洗非法取值；非法输入给出错误提示且当前偏好不变                                         | ⬜   |
| 5   | 设置主色、圆角、字号、半深色、灰色 / 色弱 | 在抽屉中逐项调整                                                 | 根节点属性与 CSS 变量即时更新；对比度不足的主色自动选择可读前景；越界值被约束清洗                                        | ⬜   |
| 6   | 应用声明旧存储键                          | 首次加载                                                         | 旧键内容并入偏好一次，之后以新键为准                                                                                     | ⬜   |
| 7   | 三框架外壳与真实工作台                    | 在 Angular / React / Vue 与 `apps/dev-rxdb-admin` 上执行相同流程 | 三端 DOM 契约、类名、无障碍属性一致；抽屉各页签与各主题下 axe 零违规                                                     | ⬜   |

验收证据：见下方「验收证据」；仓外发布产物的消费验证由发布前的 `release-consumers` 组合承担。

## 技术笔记

- 核心包 `@aiao/rxdb-admin`：[`PreferencesStore`](../../../packages/rxdb-admin/src/preferences/store.ts) 负责深合并、清洗、差异持久化、跨标签同步与导入导出；
  [`buildDrawerModel`](../../../packages/rxdb-admin/src/preferences/drawer-model.ts) 把 schema 与当前值装配成抽屉视图模型，三端只渲染它。
- 主题：[`computeThemeStyle`](../../../packages/rxdb-admin/src/theme/style.ts) 与 `computeRootAttributes` 把偏好换算成根节点属性与 CSS 变量，
  [`createBootstrapScript`](../../../packages/rxdb-admin/src/bootstrap.ts) 生成同逻辑的内联首屏脚本，应用在单测里断言 `index.html` 含该脚本以防漂移。
- 表格主题：`rxdb-model` 的 `isDocumentDarkMode()` 读根节点计算后的 `color-scheme`（daisyUI 的每个主题都设置它），`observeDocumentTheme()`
  在 `data-theme` / `style` / 系统明暗变化时通知三端表格重绘。
- 原生 `<dialog>` 的关闭：Esc 同步触发 `cancel`，`close` 事件晚十余毫秒才到。三端都在 `cancel` 上立即回写、`close` 只在对话框确实关闭时回写，
  否则这段时间里的再次打开请求（如快捷键）会被迟到的 `close` 吞掉。
- 样式契约 [`admin.css`](../../../packages/rxdb-admin/admin.css) 三端共享，全部位于 `@layer components`，只用 daisyUI 主题变量。
  偏好抽屉未选中页签的前景需要写在 `@layer utilities` 本层才压得过 daisyUI 子层的 50% 前景色（对比度不足 4.5:1）。

## 实现文件

- `packages/rxdb-admin/src/preferences/` — 类型、默认值、合并、存储、抽屉视图模型与 schema（`schema/`）。
- `packages/rxdb-admin/src/theme/`、`src/bootstrap.ts`、`src/store.ts`、`src/storage.ts`、`src/media.ts` — 主题目录与换算、首屏脚本、响应式存储与宿主抽象。
- `packages/rxdb-admin/src/shell/` — `createAdminShell` 装配、根节点绑定、内置命令。
- `packages/rxdb-admin/admin.css` — 三端共享的样式契约。
- `packages/rxdb-admin-{react,vue,angular}/src/preferences/` — 三端偏好抽屉与控件。
- `packages/rxdb-model/src/entity-table/vtable/table-theme.ts` 与 `packages/rxdb-model-{angular,react,vue}/src/entity-table/` — 表格随主题重绘。
- `apps/dev-rxdb-admin/` — 外壳接入、首屏脚本与旧键迁移；`apps/dev-rxdb-admin-e2e/src/admin-shell.spec.ts`、`admin-shell.a11y.spec.ts` — 组合验收。

## 验收证据

- 核心单测：[偏好存储](../../../packages/rxdb-admin/src/__tests__/preferences/store.spec.ts)、[抽屉视图模型](../../../packages/rxdb-admin/src/__tests__/preferences/drawer-model.spec.ts)、[schema](../../../packages/rxdb-admin/src/__tests__/preferences/schema.spec.ts)。
- 三端组件单测：[React](../../../packages/rxdb-admin-react/src/__tests__/preferences-drawer.spec.tsx)、[Vue](../../../packages/rxdb-admin-vue/src/__tests__/preferences-drawer.spec.ts)、[Angular](../../../packages/rxdb-admin-angular/src/__tests__/preferences-drawer.spec.ts)，用例标题一一对应。
- 真实工作台：[外壳验收](../../../apps/dev-rxdb-admin-e2e/src/admin-shell.spec.ts)（抽屉、主题、导入导出、刷新保留）与 [a11y 走查](../../../apps/dev-rxdb-admin-e2e/src/admin-shell.a11y.spec.ts)（五个页签与多主题 axe 零违规）。

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [US-531 布局模式与页签栏](US-531-admin-shell-layout-tabbar.md)
