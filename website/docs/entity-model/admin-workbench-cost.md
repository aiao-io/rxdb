---
id: admin-workbench-cost
title: 接入成本记录：独立消费示例
sidebar_label: 接入成本（admin-workbench-cost）
description: 模型驱动数据工作台独立消费示例（US-528）的接入成本：新增代码行数、依赖清单与样式要求
---

# 接入成本记录：独立消费示例

> 本文是 [模型驱动后台管理框架](https://github.com/aiao-io/rxdb/blob/main/requirements/domain-research/admin-framework.md) 首版切片 US-528 的
> 验收产物：一份**只 import 发布包**（不碰工作台内部模块）从零接线的独立消费应用（`apps/dev-rxdb-admin-consumer`），
> 记录它新增了多少代码、加了哪些依赖、样式怎么接入——回答「定义实体之后少写了多少 CRUD」。

## 闭环范围

应用是一个「书签」管理页：录入 / 编辑 / 删除 / 查询筛选 / 刷新重开，
全部交互由 `@aiao/rxdb-model-react` 的 `EntityList` 提供，端到端用例见
`apps/dev-rxdb-admin-consumer-e2e`。

**验证范围**：仓库内的构建与 e2e 经 workspace 源码解析 `@aiao/*`（`@aiao/source` 导出条件 + tsconfig paths），
验证的是接线方式与组件闭环，不等于验证了 npm 上的发布产物。发布 tarball 的隔离安装由
`pnpm verify:release-consumers` 守，它的组合目前还没有覆盖 `@aiao/rxdb-model-react` 与 `@aiao/rxdb-adapter-wa-sqlite`。

## 依赖清单

`apps/dev-rxdb-admin-consumer/package.json` 的 dependencies：

| 包                             | 作用                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `@aiao/rxdb`                   | 引擎：实体装饰器、RxDB 实例、`PropertyType` / `EntityBase`                                                                     |
| `@aiao/rxdb-adapter-wa-sqlite` | 浏览器本地存储适配器（`IDBBatchAtomicVFS`，IndexedDB 持久化）                                                                  |
| `@aiao/rxdb-react`             | `RxDBProvider` 与响应式查询 hook                                                                                               |
| `@aiao/rxdb-model-react`       | 模型驱动 UI 组件（`EntityList` / `EntityDetail` / 查询构建器）                                                                 |
| `@aiao/rxdb-plugin-history`    | 表单与撤销 / 重做依赖的历史插件                                                                                                |
| `lucide-react`                 | 图标                                                                                                                           |
| `wa-sqlite`                    | `setup_rxdb.ts` 经 Vite `?url` 引入的 `wa-sqlite-async.wasm`；版本与 `@aiao/rxdb-adapter-wa-sqlite` 依赖的 GitHub tarball 一致 |

仓库内另有一批依赖由 workspace 根提供，在仓库外重搭时要自行安装：示例源码直接 import 的
`react`、`react-dom`、`react-router-dom`，包的 peer 依赖 `@aiao/rxdb-model`、`@aiao/rxdb-plugin-graph`、
`rxjs`、`@visactor/vtable`，以及构建工具 `vite`、`@vitejs/plugin-react`。

## 新增代码（按文件）

应用源码（`src/`）合计 **175 行**：

| 文件                                | 行数 | 内容                                                                   |
| ----------------------------------- | ---- | ---------------------------------------------------------------------- |
| `src/app/entities/bookmark.ts`      | 26   | **唯一的「领域代码」**：一个 `@Entity` 声明（3 个属性）                |
| `src/app/rxdb/setup_rxdb.ts`        | 34   | RxDB 实例、adapter 与插件接线（主线程 IndexedDB）                      |
| `src/app/app.tsx`                   | 35   | `RxDBProvider` + 顶栏 + 懒加载出口                                     |
| `src/app/router.tsx`                | 24   | 路由表：`/` 重定向到 `/bookmarks`                                      |
| `src/app/pages/bookmarks.tsx`       | 13   | **整个 CRUD 页面**：`<EntityList namespace='links' name='Bookmark' />` |
| `src/main.tsx` + `src/main-root.ts` | 24   | React 挂载入口                                                         |
| `src/styles.css`                    | 19   | Tailwind + daisyUI 入口与页面宿主工具类                                |

配置与入口合计 **158 行**：`package.json`（18）、`project.json`（18）、`vite.config.mts`（35）、
`eslint.config.mjs`（11）、`tsconfig.json`（13）、`tsconfig.app.json`（42）、`index.html`（21）。

**总新增 ≈ 333 行**，其中业务代码只有实体声明的 26 行；列表、分页、表单三模式、校验、
筛选（查询构建器）、删除、撤销 / 重做与持久化全部来自组件，没有手写一行 CRUD。

## 样式要求

- 样式入口是 `@import 'tailwindcss'` + daisyUI 插件（主题 light/dark），与 demo 同款。
- **必须**在 Tailwind 入口引入组件样式源，否则包内组件使用的工具类不会被扫描生成，
  弹层与表格画布会失去尺寸（`apps/dev-rxdb-admin-consumer` 实测：漏引时 VTable canvas
  高度为 0、筛选弹层控件不在视口内）：

  ```css
  @import 'tailwindcss';
  @import '@aiao/rxdb-model-react/tailwind.css';
  ```

  消费发布产物（dist）时按 `@aiao/rxdb-model-react` README 另需
  `import '@aiao/rxdb-model-react/index.css'`。

## 对照

同一闭环在 [工作台应用](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-admin/src/app) 里的形态见
[模型驱动后台管理框架](https://github.com/aiao-io/rxdb/blob/main/requirements/domain-research/admin-framework.md) 首版切片
（US-526 ~ US-528）。
