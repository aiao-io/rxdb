# 用 Dashboard 扩展自定义页面与导航

日期：2026-11-16。对应 [ADMIN-US-102](../stories/domain/ADMIN-US-102-custom-pages-navigation.md)。三端使用相同路由 `/dashboard`、菜单 id `dashboard` 与浏览器契约。页面和数据逻辑留在应用层，外壳从菜单与当前 URL 派生导航状态。

## 三端实际入口

下表的路径相对于各应用目录；三端分别位于 `rxdb-admin-template/apps/angular`、`rxdb-admin-template/apps/react` 和 `rxdb-admin-template/apps/vue`。

| 接线                | Angular                                    | React                               | Vue                                                          |
| ------------------- | ------------------------------------------ | ----------------------------------- | ------------------------------------------------------------ |
| 页面                | `src/app/pages/dashboard-page.ts`          | `src/app/pages/dashboard-page.tsx`  | `src/app/pages/dashboard-page.vue` / `dashboard-content.vue` |
| 懒加载路由          | `src/app/app.routes.ts` 的 `loadComponent` | `src/app/router.tsx` 的 `lazyRoute` | `src/app/router.ts` 的 `component: () => import(...)`        |
| 菜单                | `src/app/shell/workbench-menu.ts`          | `src/app/shell/workbench-menu.tsx`  | `src/app/shell/workbench-menu.ts`                            |
| 菜单和 URL 交给外壳 | `src/app/app.ts`                           | `src/app/app.tsx`                   | `src/app/app-layout.vue`                                     |
| 导航／实体中英文    | `src/app/i18n/domain-messages.ts`          | 同左                                | 同左                                                         |
| 页面中英文          | `src/app/i18n/page-messages.ts`            | 同左                                | 同左                                                         |
| 偏好注册            | `src/app/shell/workbench-shell.ts`         | 同左                                | 同左                                                         |
| 搜索页使用偏好      | `src/app/pages/search-page.ts`             | `src/app/pages/search-page.tsx`     | `src/app/pages/search-page.vue` / `search-results.vue`       |

## 可复现扩展步骤

1. 在各端 `src/app/pages/` 添加页面，沿用对应 Dashboard 页的框架结构、共享 I18n 和 `page-host` 容器。只有实际访问需要数据的页面时连接数据库；首页和备份恢复页继续保留连接前恢复能力。Dashboard 的指标契约是 `dashboard-model.ts`，持久化活动查询是 `dashboard-activity-source.ts`。
2. 在上表路由入口注册稳定路径。Dashboard 使用 Angular 的 `{ path: 'dashboard', loadComponent: () => import('./pages/dashboard-page') }`、React 的 `{ path: 'dashboard', lazy: lazyRoute(() => import('./pages/dashboard-page')) }`、Vue 的 `{ path: '/dashboard', component: () => import('./pages/dashboard-page.vue') }`。页面模块保留各框架现有默认导出。
3. 在 `buildWorkbenchMenu` 的 `overview` 分组内添加稳定 id、翻译后的 label、图标与 route。Dashboard 的 id 为 `dashboard`，route 为 `/dashboard`，测试标识为 `dashboard-nav-link`。补齐 `domain-messages.ts` 的 `nav.overview` / `nav.dashboard` 和页面目录的中英文 key。实体菜单仍由注册表派生。
4. 沿用现有布局向外壳传递的 `menu` 和当前 URL。外壳用菜单路径生成「概览 / Dashboard」面包屑、`Dashboard · 工作台` 标题、活动页签与命令面板菜单来源。不要为这些行为再建一份标题或路由映射。Angular 用 `bindWorkbenchNavigator`、React 在 `main.tsx` 绑定 navigator、Vue 在 `main.ts` 绑定路由跳转。
5. 从桌面菜单打开页面，检查标题、面包屑和当前页签；从快捷入口进入资产与备份页，再通过页签返回。按 `Mod+K` 输入 `Dashboard` 并选择菜单结果。移动端设置 375×812，打开菜单进入页面，确认抽屉收起；刷新 `/dashboard` 后再进入实体与备份页。
6. 扩展偏好复用已有的搜索分页实例：`SEARCH_PAGE_SIZE_KEY = 'searchPageSize'`，`EXTENSIONS` 注册 number、默认值 20、范围 5～50、步长 5；中英文 label / hint / section 目录注册于 `rxdb-admin` 命名空间。搜索页订阅 `preferences.extension[SEARCH_PAGE_SIZE_KEY]` 并更新 `useSearch` 的 pageSize。Dashboard 无需额外设置项。
7. 用六条匹配记录验证分页：偏好设为 5 后先显示五条，加载更多为六条；刷新后仍先显示五条；恢复默认后显示六条，重刷仍为六条。只通过外壳偏好 API 持久化，不自行写另一份设置。

## 存储隔离

`app.config.json` 的 `storagePrefix` 传给 `createAdminShell`；偏好键为 `<storagePrefix>.preferences`，页签与命令历史也沿用该前缀。

| 应用    | 前缀                     | 偏好键                               |
| ------- | ------------------------ | ------------------------------------ |
| Angular | `aiao.workbench.angular` | `aiao.workbench.angular.preferences` |
| React   | `aiao.workbench`         | `aiao.workbench.preferences`         |
| Vue     | `aiao.workbench.vue`     | `aiao.workbench.vue.preferences`     |

浏览器断言按各端 E2E metadata 核对实际写入的唯一 `.preferences` 键。`app-config.spec.ts` 另验证自定义前缀与默认前缀互不覆盖。修改既有应用的前缀仍需单独的数据迁移方案。

## 验收入口

- [Dashboard 共享浏览器场景](../../apps/react-e2e/src/dashboard.spec.ts)：桌面／移动菜单、刷新深链、页签、面包屑、命令面板、返回实体与备份。
- [搜索分页偏好共享浏览器场景](../../apps/react-e2e/src/admin-shell.spec.ts)：即时生效、应用前缀、刷新、恢复默认与再次刷新。
- [应用配置测试](../../apps/react/src/app/app-config.spec.ts)：默认标识与自定义标识的存储隔离。
- [三端执行记录](nexus-dashboard-verification.md) 与 [国际化 AC 记录](client-i18n-verification.md)：具体运行结果及证据边界。

在仓库根依次执行 `NX_NO_CLOUD=true pnpm nx run rxdb-admin-template-<angular|react|vue>-e2e:e2e --workers=2 --skipRemoteCache`。每端任务构建并启动自己的生产产物，共享测试文件不代表仅运行 React。
