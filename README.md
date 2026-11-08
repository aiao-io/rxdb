<div align="center">

# RxDB

[![PR CI](https://github.com/aiao-io/rxdb/actions/workflows/pr.yml/badge.svg?branch=main)](https://github.com/aiao-io/rxdb/actions/workflows/pr.yml)
[![npm](https://img.shields.io/npm/v/@aiao/rxdb)](https://www.npmjs.com/package/@aiao/rxdb)
[![codecov](https://codecov.io/gh/aiao-io/rxdb/graph/badge.svg?token=VJW8U2PNBG)](https://codecov.io/gh/aiao-io/rxdb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docs](https://img.shields.io/badge/docs-rxdb.aiao.io-0ea5e9)](https://rxdb.aiao.io)

</div>

RxDB 是面向 Local-first 应用的 TypeScript 全栈数据层，提供 SQL 存储、响应式查询、实体管理 UI 与 Angular / React / Vue 三端集成。当前登记的已发布基线为 `v0.0.28`，仍处于 0.x 演进阶段；发布范围与下一次迁移发布见[发布计划](requirements/release-plan.md)。

> 本项目发布在 `@aiao/*` 作用域下，与 npm 上的 [`rxdb`](https://rxdb.info)（NoSQL 文档数据库）**无关**：这里是装饰器实体 + SQL 引擎（SQLite / PGlite）+ 三框架绑定，不是它的 fork 或插件。

- 使用装饰器定义的实体模型，自动生成类型安全的 Repository 和查询 API
- 一份模型声明同时驱动数据库 schema、TypeScript 类型和响应式数据流
- 浏览器里直接跑 SQLite，用接近原生 App 的体验构建离线优先应用

> 本文能力说明对应当前 main。Admin、I18n、Board 与 P2P 包族尚未进入 npm 发布集合，请先在仓库工作区运行示例；发布包请按对应版本文档接入，兼容要求见[版本兼容矩阵](website/docs/compatibility.md)。

## Demo

| 框架    | 地址                                                           |
| ------- | -------------------------------------------------------------- |
| Angular | [rxdb.aiao.io/demo/angular](https://rxdb.aiao.io/demo/angular) |
| React   | [rxdb.aiao.io/demo/react](https://rxdb.aiao.io/demo/react)     |
| Vue     | [rxdb.aiao.io/demo/vue](https://rxdb.aiao.io/demo/vue)         |

## 技术栈

| 层     | 技术                                                          |
| ------ | ------------------------------------------------------------- |
| 语言   | TypeScript 6.0+ strict, ESM                                   |
| 构建   | Nx 24.0.5 + pnpm 12.16.1                                      |
| 框架   | Angular 22+ / React 19+ / Vue 3.5+                            |
| 响应式 | RxJS 7.8+                                                     |
| 存储   | wa-sqlite / sqlite-wasm / PGlite / Supabase / HTTP / sqliteai |
| 测试   | Vitest (unit/integration) + Playwright (e2e/a11y)             |
| 运行时 | 浏览器 (OPFS/IDB) + Node 26+ + Electron + Tauri               |

> [!NOTE]
> ⚠️ API 仍在演进中，生产使用前请锁定版本并关注 [迁移指南](https://rxdb.aiao.io/docs/migration/)。当前交付状态 [96/139 已交付](requirements/status-overview.md)；需求交付状态以状态概览与各 story 的 YAML 为准。

支持与反馈：可复现的 bug 请提交 [Bug Issue](https://github.com/aiao-io/rxdb/issues/new?template=bug_report.yml)，功能建议提交 [Feature Issue](https://github.com/aiao-io/rxdb/issues/new?template=feature_request.yml)，使用问题请提交 [Question Issue](https://github.com/aiao-io/rxdb/issues/new?template=question.yml)。

## RxDB 解决什么问题？

传统 Web 应用中，数据库 schema、TypeScript 类型、状态管理、前后端通信、离线能力往往各自维护 —— 改一处就要同步多处，维护成本高。

RxDB 把这些能力统一到一份模型声明里：同一份实体定义，同时驱动数据库、查询、变更、客户端代码和 UI 集成。面对离线优先、复杂数据结构与强类型协作场景，这套方案会更顺手。

## 核心特点

| 特点            | 说明                                                 |
| --------------- | ---------------------------------------------------- |
| **响应式**      | 数据变更自动驱动 UI，无需手动同步状态                |
| **Local-first** | 浏览器内运行数据库，弱网或离线环境同样稳定           |
| **强类型**      | 从模型定义推导出类型安全的查询、变更和客户端代码     |
| **数据驱动**    | 原生支持树、图等复杂结构，围绕模型自动生成 CRUD      |
| **跨框架**      | Angular / React / Vue 三端集成，API 风格一致         |
| **可协作**      | 围绕数据版本管理与同步演进，目标是多端一致、多人协作 |

参考生态：

- [jazz](https://jazz.tools/)
- [livestore](https://github.com/livestorejs/livestore)
- [powersync-js](https://github.com/powersync-ja/powersync-js)
- [zero](https://zero.rocicorp.dev/)

## 5 分钟跑通

不用装环境，直接在浏览器里打开一个可编辑的最小 Todo（wa-sqlite · 装饰器实体 · 响应式查询 · IndexedDB 持久化）：

- [React](https://stackblitz.com/~/github.com/aiao-io/rxdb-todo-react)
- [Vue](https://stackblitz.com/~/github.com/aiao-io/rxdb-todo-vue)
- [Angular](https://stackblitz.com/~/github.com/aiao-io/rxdb-todo-angular)

核心代码如下（Vite 的 WASM 资源导入写法）——同一份声明同时生成表、类型与 Repository：

```ts
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import waSqliteAsync from 'wa-sqlite/dist/wa-sqlite-async.wasm?url';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class Todo extends EntityBase {
  title!: string;
  completed!: boolean;
}

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { wasmPath: waSqliteAsync }));
await rxdb.connect('wa-sqlite');
await new Todo({ title: '读完 README' }).save();
```

完整安装、三框架 `useFind` 响应式查询与 Worker / WASM 接线见[快速开始](https://rxdb.aiao.io/docs/getting-started/)。 wa-sqlite 默认使用 IndexedDB；OPFS VFS 仍为实验性，支持边界见[适配器说明](packages/rxdb-adapter-wa-sqlite/README.md)。

## 现在有什么？

当前 main 的主要能力如下；组合限制见[能力矩阵](requirements/capability-matrix.md)，接入路径见[能力与示例](website/docs/getting-started/capabilities.md)。

- **核心引擎**：装饰器实体 → DDL + 类型 + Repository；关系映射（含 M:N 中间表）、事务、变更追踪、跨 Tab 同步、树形实体、bigint / binary、远端 QueryCache 行缓存。
- **存储适配器**：浏览器 SQLite（wa-sqlite / sqlite-wasm / 官方 sqlite）、sqliteai 向量、PGlite、Electron `node:sqlite`、Tauri `rusqlite`、Supabase、HTTP；字段级加密；微信 / 抖音 / 支付宝小程序仍为实验性，设备验证范围见[兼容矩阵](website/docs/compatibility.md)。
- **实体 UI 与 Headless**：元数据生成表单、详情、表格与查询构建器；六类 Headless 控制器提供独立状态与动作，三框架均有绑定，默认组件迁移与部分交互仍在收尾。
- **后台与国际化**：三框架后台外壳及模板，包含导航、布局、主题、页签与用户偏好；ICU 消息、数字 / 日期格式化、语言偏好与目录管理。
- **插件与协作**：图数据、全文搜索（FTS5 / PostgreSQL tsvector）、文件存储、草稿缓存、Git 式分支与合并、撤销重做、Supabase 与 HTTP 同步。
- **任务看板**：单人本地任务管理，包含多看板、列、拖放、筛选、历史与备份恢复；三框架视图已接入，完整外壳首轮支持 sqlite-wasm 主线程 IDB，仍有验收项待收口。
- **P2P 会话与文件共享**：已认证会话、分块校验、断点续传与多源下载；应用负责发现、信令、认证与字节存储，桌面真实宿主仍有验收范围。
- **开发工具**：CodeMirror 6 编辑器三端组件、DevTools 面板与浏览器扩展、Electron / Tauri 原生存储调试。

对应文档（线上站：[rxdb.aiao.io](https://rxdb.aiao.io)）：

- [快速开始](https://rxdb.aiao.io/docs/getting-started/)
- [模型定义](https://rxdb.aiao.io/docs/model-definition/)
- [客户端生成](https://rxdb.aiao.io/docs/client-generator)
- [数据查询](https://rxdb.aiao.io/docs/model-query/)
- [数据变更](https://rxdb.aiao.io/docs/model-mutation/)
- [数据协作](https://rxdb.aiao.io/docs/collaboration/branch)
- [框架集成](https://rxdb.aiao.io/docs/frameworks/)
- [实体模型 UI](website/docs/entity-model/README.md)与[Headless 实体能力](website/docs/entity-model/headless.md)
- [后台外壳](website/docs/admin-shell/README.md)与[客户端国际化](website/docs/i18n/README.md)
- [任务看板](website/docs/plugins/rxdb-plugin-board/README.md)与[P2P 会话及文件共享](website/docs/plugins/rxdb-plugin-p2p/README.md)
- [数据库适配器](https://rxdb.aiao.io/docs/adapters/)
- [code-editor](https://rxdb.aiao.io/docs/code-editor/)
- [迁移指南](https://rxdb.aiao.io/docs/migration/)
- [版本兼容矩阵](https://rxdb.aiao.io/docs/compatibility)
- [版本与 API 稳定性策略](https://rxdb.aiao.io/docs/versioning)

## 架构一览

```text
rxdb/
├── apps/             # 三框架演示、后台模板、看板、P2P、桌面与小程序应用及 E2E
├── packages/         # 核心引擎、适配器、框架绑定、UI 与插件公共包
├── modules/          # 内部共享模块、领域示例与跨框架 E2E 契约
├── website/          # 文档站、API 参考与在线演示入口
├── requirements/     # 用户故事、能力矩阵、路线图与发布计划
├── benchmarks/       # 性能测试
├── scripts/          # 质量审计、发布与开发脚本
└── docker/           # 本地服务配置
```

公共包按能力拆分，`{angular,react,vue}` 表示三端分别提供的绑定包：

| 能力                       | 包族 / 目录                                                           |
| -------------------------- | --------------------------------------------------------------------- |
| 核心与框架绑定             | `rxdb`、`rxdb-{angular,react,vue}`                                    |
| 存储与加密                 | `rxdb-adapter-*`，选择见[适配器文档](website/docs/adapters/README.md) |
| 实体 UI 与 Headless        | `rxdb-model`、`rxdb-model-{angular,react,vue}`                        |
| 后台外壳                   | `rxdb-admin`、`rxdb-admin-{angular,react,vue}`                        |
| 客户端国际化               | `rxdb-i18n`、`rxdb-i18n-{angular,react,vue}`                          |
| 任务看板                   | `rxdb-plugin-board`、`rxdb-plugin-board-{angular,react,vue}`          |
| P2P 会话与文件共享         | `rxdb-plugin-p2p`                                                     |
| 历史、同步、搜索与其他插件 | `rxdb-plugin-*`，入口见[插件文档](website/docs/plugins/README.md)     |
| 编辑器                     | `code-editor`、`code-editor-{angular,react,vue}`                      |
| 开发与测试工具             | `rxdb-client-generator`、`rxdb-devtools`、`rxdb-test`                 |

完整包清单见 [packages/](packages/)，发布组合见[包关系登记](requirements/package-graph.json)。

## 适合什么场景？

- 需要离线优先体验的 Web 应用
- 数据结构复杂的业务系统，比如树、图、地理信息
- 希望前后端围绕同一套模型协作，减少重复定义的项目
- 想同时支持 Angular、React、Vue 的组件或平台型能力

## 当前进展

核心引擎、存储适配器、三框架绑定与历史 / 同步等插件已有实现和验证。工作区新增能力是否发布、故事是否关闭，分别以[发布计划](requirements/release-plan.md)和[状态概览](requirements/status-overview.md)为准。

### 已有示例与验证

- **Todo、文件树与菜单树**：增删改、拖放、搜索、历史记录与撤销重做。
- **Supabase 与 HTTP 同步**：本地优先同步、QueryCache 行缓存、双客户端 SSE 收敛。
- **三框架后台模板**：后台外壳、实体页面、主题偏好与国际化。
- **任务看板与 P2P**：提供独立应用入口，运行条件与当前边界见[能力与示例](website/docs/getting-started/capabilities.md)。

### 实现与验收中的范围

| 范围                                                                                                                                                                  | 当前状态                                                                       |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| [Headless 实体 API（US-403）](requirements/stories/ui/US-403-entity-components-headless.md)                                                                           | 控制器与三框架绑定已接入；独立消费、依赖隔离、默认组件迁移及质量门禁仍待收口。 |
| [后台外壳（US-530～533）](requirements/epics/epic-010-model-driven-admin-framework.md)                                                                                | 外壳实现与三端测试已接入；验收和代码评审待收口，仓外消费验证另行推进。         |
| [客户端国际化（US-911）](requirements/stories/future/US-911-client-i18n.md)                                                                                           | A～D 已实现，三端 / 四运行时等验证已记录，等待代码评审。                       |
| [任务看板](requirements/epics/epic-011-task-board-domain-model.md)                                                                                                    | 领域模型与三端视图待评审，恢复异常分支及 demo 验收仍有缺口。                   |
| [P2P 文件共享](requirements/epics/epic-011-p2p-file-share.md)                                                                                                         | 浏览器协议与会话已接入；Electron / Tauri 宿主和剩余验收继续推进。              |
| [多端小程序（US-211）](requirements/stories/adapter/US-211-multi-miniprogram-platforms.md)与[Taro 插件（US-219）](requirements/stories/adapter/US-219-taro-plugin.md) | 实验性支持，设备证据与当前 Taro 版本的外部安装验收仍待补齐。                   |
| [声明式存储约束（US-030）](requirements/stories/core/US-030-declarative-storage-constraints.md)                                                                       | A～C 已实现并待评审，阶段 D 仍为候选。                                         |

## 路线图

排期、前置与可开工条件见[路线图](requirements/roadmap.md)；BOM、后台框架、任务看板与 P2P 等范围按各 Epic 和用户故事推进。

### 阶段 1 → 1.0 发布

- **API 与质量门禁**：对外类型冻结，核心包覆盖率 ≥ 90%、其余包 ≥ 80%，保持 Angular / React / Vue 的能力与 API 对称。
- **迁移发布**：已发布 `v0.0.28` 的系统 schema 为 7，当前源码为 8；下一次发布必须承接 7→8 升级及旧客户端隔离策略，执行条件见[发布计划](requirements/release-plan.md)。
- **文档与消费验证**：随发布更新 API 参考、迁移指南、兼容矩阵和包组合登记；工作区实现与发布产物分别验证。

### 1.0 之后

生产可靠性、多端协作、模型驱动应用、文件与跨平台、搜索与本地 AI、安全与生态六个方向见
[requirements/vision.md](requirements/vision.md)。那是方向不是承诺：每个方向开工前都要基于真实用户反馈新建 Epic。

---

## 开发与贡献

### 本地开发与示例

需要 Node.js ≥ 26（[.nvmrc](.nvmrc) 固定为 26），包管理器使用根 [package.json](package.json) 固定的 `pnpm@12.16.1`。

```bash
pnpm install

# 按框架选一个综合演示
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

其他工作区示例：

| 示例               | 启动方式                                                                                      |
| ------------------ | --------------------------------------------------------------------------------------------- |
| 单人任务看板       | `pnpm nx serve dev-rxdb-board`                                                                |
| Angular 后台模板   | `pnpm nx serve rxdb-admin-template-angular`                                                   |
| React 后台模板     | `pnpm nx serve rxdb-admin-template-react`                                                     |
| Vue 后台模板       | `pnpm nx serve rxdb-admin-template-vue`                                                       |
| P2P 会话与文件共享 | `pnpm nx serve dev-rxdb-p2p`，认证与本地服务配置见[应用说明](apps/dev-rxdb-p2p/README.md)     |
| HTTP 同步          | 分别运行 `pnpm nx serve dev-rxdb-http-server` 与 `pnpm nx serve dev-rxdb-http`                |
| Supabase 同步      | `pnpm nx serve dev-rxdb-supabase`，服务配置见[应用说明](apps/dev-rxdb-supabase/README.md)     |
| Electron / Tauri   | `pnpm nx serve dev-rxdb-electron` / `pnpm nx serve dev-rxdb-tauri`，宿主要求见对应应用 README |
| 浏览器调试扩展     | `pnpm nx serve rxdb-devtools-extension`                                                       |
| 文档站             | `pnpm nx serve website`                                                                       |

### 提交前检查

欢迎提交 Issue 和 PR。功能改动遵循 TDD，保持三框架 API 与示例一致，核心包覆盖率 ≥ 90%、其余包 ≥ 80%。

```bash
# 针对核心包开发；其他项目替换项目名
pnpm nx test rxdb --watch
pnpm nx run rxdb:lint
pnpm nx run rxdb:typecheck

# 按受影响项目执行提交前门禁
pnpm test-all
```

`test-all` 使用 `nx affected` 执行 lint、typecheck、test、test-memory、test-browser、build、audit-lazy-backend 与 e2e，默认基线通常为 `main`，并禁用远端缓存。要检查所有公共包，使用 `pnpm test-packages`。

详情见[贡献指南](CONTRIBUTING.md)、[脚本说明](scripts/README.md)与[需求管理](requirements/README.md)。

## 许可证

本项目采用 [MIT 许可证](LICENSE)。

## 实际应用

[Aiao Media](aiao-media/apps/web/README.md) 是同仓孵化的 local-first 图片创作应用，包含独立产品需求、部署和浏览器验收。启动：`pnpm nx run aiao-media:serve`。
