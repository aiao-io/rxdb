---
id: US-531
title: 后台外壳布局：四种布局模式、侧栏图标轨、移动端抽屉与页签栏
status: In Progress
priority: Medium
epic: epic-010-model-driven-admin-framework
created: 2026-11-06
updated: 2026-11-06
tags: [domain, admin-framework, admin-shell, layout, tabbar, cross-framework]
---

# 用户故事：后台外壳布局：四种布局模式、侧栏图标轨、移动端抽屉与页签栏

## 作为/我想要/以便

**作为** 使用模型驱动后台管理框架的使用者
**我想要** 按习惯选择侧栏或顶栏导航，把侧栏折叠成图标轨，在手机上以抽屉访问导航，并在多个页面之间用页签切换
**以便** 同时打开多个实体列表、搜索与备份页面而不必反复通过菜单跳转，窄屏也能完整使用。

## 范围依据

owner 于 2026-11-06 批准，是 [US-530](US-530-admin-shell-preferences-appearance.md) 偏好中心的布局与页签栏分组。
布局取四种：`sidebar-nav`、`header-sidebar-nav`、`header-nav`、`full-content`，不含混合双栏与页面缓存。

## 范围边界

### In Scope

- 布局推导集中在核心包 `deriveLayout`：模式、侧栏 / 顶栏 / 页脚 / 页签栏显隐、侧栏宽度（折叠 48px、展开 160～320px）、顶栏高度与水平菜单、内容区最大宽度与四向内边距、
  半深色侧栏 / 顶栏、移动端一律按侧栏导航且侧栏以抽屉呈现；三端壳只按推导结果渲染。
- 侧栏：品牌、分组菜单（可选手风琴）、折叠为图标轨（压平分组、保留 `title`）、折叠时悬停临时展开、拖拽与键盘（←/→，步长 16px）调宽、折叠开关。
- 顶栏：菜单开关、品牌、水平菜单（分组悬停展开）、面包屑（样式、图标、只有一级时隐藏）、部件区。
- 页脚（可固定、版权信息）、内容区紧凑宽度、页面切换动画、顶部进度条与加载遮罩、跳到主要内容链接、屏幕阅读器可见的页面标题。
- 页签栏：随路由生成页签；点击切换、关闭、固定、拖拽与 Shift+方向键排序、中键关闭、滚轮横向滚动、访问历史菜单；右键菜单含关闭 / 刷新 / 固定 / 新窗口 /
  关闭左侧 / 关闭右侧 / 关闭其他 / 关闭全部 / 内容最大化；持久化模式 `off` / `session` / `local`；样式 `chrome` / `plain` / `card` / `brisk`。
- 刷新当前页重新挂载页面内容；内容最大化隐藏顶栏、侧栏与页脚。
- Angular / React / Vue 同功能；`apps/rxdb-admin-template-react` 接入并以 `apps/rxdb-admin-template-react-e2e` 完成组合验收。

### Out of Scope

- 混合双栏、双列菜单等其他布局，以及页面级缓存（keepAlive）。
- 页签与服务端会话的同步；`local` 持久化只在本机。
- 路由库适配：外壳只接收当前地址并通过 `navigate` 回调跳转。

## 验收标准

| #   | 前置条件                 | 操作                                                 | 预期结果                                                                                                                                                                                                         | 状态 |
| --- | ------------------------ | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 外壳在桌面宽度           | 依次切换四种布局并刷新                               | 侧栏 / 顶栏 / 水平菜单 / 页脚按模式出现或消失；`header-sidebar-nav` 的顶栏横跨整个宽度、侧栏排在它下面；`header-nav` 的分组下拉不被菜单条裁掉；`full-content` 无侧栏与页脚但保留顶栏以便再次打开设置；刷新后保持 | ⬜   |
| 2   | 侧栏展开                 | 点击折叠开关或 `Mod+B`；悬停；拖拽与键盘调宽         | 折叠为 48px 图标轨（分组压平、保留标题），悬停临时展开且不改变占位，宽度被限制在 160～320px，状态刷新后保留                                                                                                      | ⬜   |
| 3   | 视口窄于 768px           | 打开菜单开关，选择菜单项，或点击遮罩                 | 侧栏是抽屉，开关的 `aria-expanded` 与抽屉一致；选择菜单项跳转后自动收起，点击遮罩收起                                                                                                                            | ⬜   |
| 4   | 配置面包屑、页脚、内容区 | 调整样式、固定页脚、紧凑宽度与内边距                 | 面包屑只在需要时出现，页脚与内容区尺寸随偏好变化，水平菜单布局下面包屑隐藏                                                                                                                                       | ⬜   |
| 5   | 依次访问多个页面         | 点击页签、关闭按钮、中键、拖拽与 Shift+方向键排序    | 页签随路由生成并标出当前页，关闭当前页签跳到相邻页签，最后一个关闭后回到首页，排序与历史菜单生效                                                                                                                 | ⬜   |
| 6   | 页签栏有多个页签         | 右键菜单：固定、关闭其他、关闭全部、刷新、内容最大化 | 固定页签没有关闭按钮且不被批量关闭带走；刷新重新挂载页面内容；最大化隐藏顶栏 / 侧栏 / 页脚；会话内刷新页面页签保留                                                                                               | ⬜   |
| 7   | 三框架外壳与真实工作台   | 在四种布局、图标轨与移动端抽屉下扫描                 | 三端 DOM 契约一致；各变体 axe 零违规；页面切换动画结束前不影响画布点击坐标的换算                                                                                                                                 | ⬜   |

验收证据：见下方「验收证据」。

## 技术笔记

- [`deriveLayout`](../../../packages/rxdb-admin/src/layout/layout-state.ts) 把偏好、视口、最大化与是否有菜单推导成 `LayoutState`；侧栏被关闭时导航自动回退到顶栏水平菜单，不会让用户失去入口。
- 菜单模型 [`MenuNode`](../../../packages/rxdb-admin/src/layout/menu.ts) 描述分组与叶子，图标类型由绑定决定（React 的 `ReactNode`、Vue 的 `Component`、Angular 的 lucide 图标数据）；
  `findMenuPath` / `activeGroupIds` / `toggleGroup` 供三端共享，保证高亮、展开与手风琴语义一致。
- 页签状态在 [`TabsStore`](../../../packages/rxdb-admin/src/tabs/tabs-store.ts)，纯函数操作在 `tabs-ops.ts`；外壳在路由同步时打开页签，页签标题取自菜单。
- 「刷新」重新挂载页面内容：React / Vue 用 `key`，Angular 的 `<ng-content>` 无法重建，需要把路由出口放进 `*adminPage` 模板由布局重建实例。
- 页面进入动画会在短时间内位移内容区；对画布内元素按页面坐标换算点击位置的测试必须先等动画结束。

## 实现文件

- `packages/rxdb-admin/src/layout/`、`src/tabs/`、`src/shell/` — 布局推导、菜单、瞬时界面状态、页签。
- `packages/rxdb-admin/admin.css` — 布局、侧栏图标轨、移动抽屉、页签栏、页脚与动画。
- `packages/rxdb-admin-{react,vue,angular}/src/layout/`、`src/tabbar/` — 三端布局、侧栏、顶栏、菜单树、页签栏与右键菜单。
- `apps/rxdb-admin-template-react/src/app/app.tsx`、`src/app/shell/workbench-menu.tsx` — 工作台的菜单与外壳接入。
- `apps/rxdb-admin-template-react-e2e/src/admin-shell.spec.ts`、`workbench.spec.ts`、`admin-shell.a11y.spec.ts` — 布局、移动端抽屉、页签与 a11y 验收。

## 验收证据

- 核心单测：[布局推导](../../../packages/rxdb-admin/src/__tests__/layout/layout-state.spec.ts)、[页签](../../../packages/rxdb-admin/src/__tests__/tabs/tabs-store.spec.ts)。
- 三端组件单测：[React 布局](../../../packages/rxdb-admin-react/src/__tests__/layout.spec.tsx)与[页签栏](../../../packages/rxdb-admin-react/src/__tests__/tabbar.spec.tsx)，
  [Vue](../../../packages/rxdb-admin-vue/src/__tests__/layout.spec.ts)，[Angular](../../../packages/rxdb-admin-angular/src/__tests__/layout.spec.ts)，用例标题一一对应。
- 真实工作台：[外壳验收](../../../apps/rxdb-admin-template-react-e2e/src/admin-shell.spec.ts)（布局切换、图标轨、页签）、[移动端抽屉](../../../apps/rxdb-admin-template-react-e2e/src/workbench.spec.ts)与 [a11y 走查](../../../apps/rxdb-admin-template-react-e2e/src/admin-shell.a11y.spec.ts)。

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [US-530 偏好中心与外观设置](US-530-admin-shell-preferences-appearance.md)
