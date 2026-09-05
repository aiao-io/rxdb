<div align="center">

# RxDB

[![PR CI](https://github.com/aiao-io/rxdb/actions/workflows/pr.yml/badge.svg?branch=main)](https://github.com/aiao-io/rxdb/actions/workflows/pr.yml)
[![npm](https://img.shields.io/npm/v/@aiao/rxdb)](https://www.npmjs.com/package/@aiao/rxdb)
[![codecov](https://codecov.io/gh/aiao-io/rxdb/graph/badge.svg?token=VJW8U2PNBG)](https://codecov.io/gh/aiao-io/rxdb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![Docs](https://img.shields.io/badge/docs-rxdb.netlify.app-0ea5e9)](https://rxdb.netlify.app)

</div>

RxDB 是面向 Local-first 应用的 TypeScript 全栈数据层。所有 `@aiao/*` 公开包当前同步发布为 `0.0.25`，仍处于 0.x 演进阶段。

> 本项目发布在 `@aiao/*` 作用域下，与 npm 上的 [`rxdb`](https://rxdb.info)（NoSQL 文档数据库）**无关**：这里是装饰器实体 + SQL 引擎（SQLite / PGlite）+ 三框架绑定，不是它的 fork 或插件。

- 使用装饰器定义的实体模型，自动生成类型安全的 Repository 和查询 API
- 一份模型声明同时驱动数据库 schema、TypeScript 类型和响应式数据流
- 浏览器里直接跑 SQLite，用接近原生 App 的体验构建离线优先应用

## Demo

| 框架    | 地址                                                                   |
| ------- | ---------------------------------------------------------------------- |
| Angular | [rxdb.netlify.app/demo/angular](https://rxdb.netlify.app/demo/angular) |
| React   | [rxdb.netlify.app/demo/react](https://rxdb.netlify.app/demo/react)     |
| Vue     | [rxdb.netlify.app/demo/vue](https://rxdb.netlify.app/demo/vue)         |

## 技术栈

| 层     | 技术                                                          |
| ------ | ------------------------------------------------------------- |
| 语言   | TypeScript 6.0+ strict, ESM                                   |
| 构建   | Nx 23 + pnpm 10                                               |
| 框架   | Angular 22+ / React 19+ / Vue 3.5+                            |
| 响应式 | RxJS 7.8+                                                     |
| 存储   | wa-sqlite / sqlite-wasm / PGlite / Supabase / HTTP / sqliteai |
| 测试   | Vitest (unit/integration) + Playwright (e2e/a11y)             |
| 运行时 | 浏览器 (OPFS/IDB) + Node 26+ + Electron + Tauri               |

> [!NOTE]
> ⚠️ API 仍在演进中，生产使用前请锁定版本并关注 [迁移指南](https://rxdb.netlify.app/docs/migration/)。当前交付状态 [55/65 已交付](requirements/status-overview.md)

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

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-pglite @electric-sql/pglite   # 浏览器内 PostgreSQL；SQLite 见文档
pnpm add @aiao/rxdb-react                                            # 或 @aiao/rxdb-angular / @aiao/rxdb-vue
```

```ts
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {}

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});
rxdb.adapter(
  'pglite',
  async db => new RxDBAdapterPGlite(db, await PGlite.create({ dataDir: `idb://rxdb-${db.dbName}` }))
);
await rxdb.connect('pglite');

const todo = new Todo();
todo.title = '读完 README';
await todo.save(); // 同一份声明已生成表、类型与 Repository
```

```tsx
import { useFind } from '@aiao/rxdb-react'; // Angular / Vue 同名 API

const { value: todos, isLoading } = useFind(Todo, {
  where: { combinator: 'and', rules: [{ field: 'completed', operator: '=', value: false }] }
});
```

写入后 `todos` 自动更新，跨 Tab 同样生效。完整接线（Worker / WASM 路径 / 框架 provider）见[快速开始](https://rxdb.netlify.app/docs/getting-started/)。

## 现在有什么？

一句话版本，细节与「哪些组合不支持」见 [能力矩阵](requirements/capability-matrix.md)：

- **核心引擎**：装饰器实体 → DDL + 类型 + Repository；关系映射（含 M:N 中间表）、事务、变更追踪、跨 Tab 同步、树形实体、bigint / binary、远端 QueryCache 行缓存。
- **存储适配器**：浏览器 SQLite 三种（wa-sqlite / sqlite-wasm / 官方 sqlite）、sqliteai（向量）、PGlite、Electron `node:sqlite`、Tauri `rusqlite`、Supabase、HTTP；字段级加密内建；微信小程序**实验性**。
- **插件**：图数据、全文搜索（FTS5 / pg tsvector，三端绑定）、文件存储（OPFS 与桌面目录）、工作区（NEW 草稿的本地缓存，刷新不丢未保存的新实体）。
- **协作**：Git 式分支 / 合并 / 切换、撤销重做、Supabase 与 HTTP 同步、加密字段不进索引与历史。
- **UI 与工具**：CodeMirror 6 编辑器三端组件、DevTools 面板 + Chrome 扩展 + Electron / Tauri 原生存储调试。

对应文档（线上站：[rxdb.netlify.app](https://rxdb.netlify.app)）：

- [快速开始](https://rxdb.netlify.app/docs/getting-started/)
- [模型定义](https://rxdb.netlify.app/docs/model-definition/)
- [客户端生成](https://rxdb.netlify.app/docs/client-generator)
- [数据查询](https://rxdb.netlify.app/docs/model-query/)
- [数据变更](https://rxdb.netlify.app/docs/model-mutation/)
- [数据协作](https://rxdb.netlify.app/docs/collaboration/branch)
- [框架集成](https://rxdb.netlify.app/docs/frameworks/)
- [数据库适配器](https://rxdb.netlify.app/docs/adapters/)
- [code-editor](https://rxdb.netlify.app/docs/code-editor/)
- [迁移指南](https://rxdb.netlify.app/docs/migration/)
- [版本兼容矩阵](https://rxdb.netlify.app/docs/compatibility)
- [版本与 API 稳定性策略](https://rxdb.netlify.app/docs/versioning)

## 架构一览

```text
aiao/
├── apps/                            # 开发演示
│   ├── dev-rxdb-angular/            # Angular DEMO
│   ├── dev-rxdb-angular-e2e/        # Angular E2E
│   ├── dev-rxdb-electron/           # Electron DEMO
│   ├── dev-rxdb-electron-e2e/       # Electron E2E
│   ├── dev-rxdb-http/               # HTTP 远程同步 DEMO（Angular 前端）
│   ├── dev-rxdb-http-e2e/           # HTTP E2E
│   ├── dev-rxdb-http-server/        # HTTP 参考后端（node:sqlite）
│   ├── dev-rxdb-react/              # React DEMO
│   ├── dev-rxdb-react-e2e/          # React E2E
│   ├── dev-rxdb-supabase/           # Supabase 同步 DEMO
│   ├── dev-rxdb-supabase-e2e/       # Supabase E2E
│   ├── dev-rxdb-tauri/              # Tauri DEMO
│   ├── dev-rxdb-tauri-e2e/          # Tauri E2E
│   ├── dev-rxdb-vue/                # Vue DEMO
│   ├── dev-rxdb-vue-e2e/            # Vue E2E
│   └── rxdb-devtools-extension/     # 浏览器 Devtools 扩展
├── benchmarks/                      # 性能测试
├── docker/                          # Docker 配置
├── examples/                        # 集成演示
├── modules/                         # 独立模块与 Angular 示例库
├── packages/                        # 核心库
│   ├── rxdb/                        # 核心：模型、查询、适配器接口
│   ├── rxdb-adapter-wa-sqlite/      # WA SQLite 适配器
│   ├── rxdb-adapter-sqlite/         # SQLite 官方适配器
│   ├── rxdb-adapter-sqlite-core/    # SQLite 核心共享代码
│   ├── rxdb-adapter-sqlite-wasm/    # SQLite WASM 适配器
│   ├── rxdb-adapter-sqliteai/       # SQLite AI 适配器（向量 + AI 函数）
│   ├── rxdb-adapter-electron/       # Electron 适配器（node:sqlite 特权宿主）
│   ├── rxdb-adapter-tauri/          # Tauri 适配器（Rust rusqlite 宿主，WebView 侧）
│   ├── rxdb-adapter-encrypted/      # 字段级加密（AES-GCM-256）
│   ├── rxdb-adapter-miniprogram/    # 小程序适配器（仅微信，实验性）
│   ├── rxdb-adapter-pglite/         # PGlite 适配器（PostgreSQL）
│   ├── rxdb-adapter-supabase/       # Supabase 适配器
│   ├── rxdb-adapter-http/           # HTTP 远程适配器（QueryCache + 条件请求 + SSE）
│   ├── rxdb-angular/                # Angular 集成（signals）
│   ├── rxdb-react/                  # React 集成（hooks）
│   ├── rxdb-vue/                    # Vue 集成（composables）
│   ├── rxdb-client-generator/       # 客户端代码生成
│   ├── rxdb-devtools/               # 运行时调试工具
│   ├── rxdb-plugin-graph/           # 图插件
│   ├── rxdb-plugin-workspace/       # 工作区插件
│   ├── rxdb-plugin-storage/         # 存储插件
│   ├── rxdb-plugin-search/          # 全文搜索插件（FTS5）
│   ├── rxdb-plugin-search-angular/  # Angular 搜索集成
│   ├── rxdb-plugin-search-react/    # React 搜索集成
│   ├── rxdb-plugin-search-vue/      # Vue 搜索集成
│   ├── rxdb-test/                   # 测试库与跨框架 fixture
│   ├── code-editor/                 # 代码编辑器核心
│   ├── code-editor-angular/         # Angular 编辑器集成
│   ├── code-editor-react/           # React 编辑器集成
│   ├── code-editor-vue/             # Vue 编辑器集成
│   └── utils/                       # 通用工具
├── requirements/                    # 需求文档
├── scripts/                         # 构建脚本
└── website/                         # 文档站
```

## 可直接运行的入口

- Web demo：`pnpm nx serve dev-rxdb-angular`、`pnpm nx serve dev-rxdb-react`、`pnpm nx serve dev-rxdb-vue`
- HTTP 远程同步 demo：`pnpm nx serve dev-rxdb-http-server`（node:sqlite 参考后端）+ `pnpm nx serve dev-rxdb-http`（Angular 前端）
- 同步 demo：`pnpm nx serve dev-rxdb-supabase`
- 桌面 demo：`pnpm nx serve dev-rxdb-electron`、`pnpm nx serve dev-rxdb-tauri`
- 调试扩展：`pnpm nx serve rxdb-devtools-extension`

## 适合什么场景？

- 需要离线优先体验的 Web 应用
- 数据结构复杂的业务系统，比如树、图、地理信息
- 希望前后端围绕同一套模型协作，减少重复定义的项目
- 想同时支持 Angular、React、Vue 的组件或平台型能力

## 当前进展

交付状态见 [status-overview](requirements/status-overview.md)。核心引擎、十种存储适配器、三框架集成、插件体系和协作能力均已就绪。

### 已验证场景

- **Todo List** — 增删改、历史记录、撤销/重做
- **树结构文件管理** — 增删改、拖拽移动、路径唯一性校验、撤销/重做、搜索
- **树结构菜单管理** — 增删改、同路径告警、拖拽排序、撤销/重做、搜索
- **Supabase 同步** — 本地优先远端同步，PostgREST + Realtime + RPC 推送
- **HTTP 远程同步** — Angular 前端 + node:sqlite 参考后端，QueryCache 行缓存，双客户端 SSE 实时收敛

### 进行中

- 🚧 **Tauri DevTools 调试窗口**（[US-905](requirements/stories/future/US-905-tauri-native-devtools.md)）— 阶段 1 代码侧收尾完成，差驱动两个真实 WebView 的 harness；阶段 2 前置已齐
- 🚧 **Electron 桌面端 DevTools 面板的开发者可用路径**（[US-906](requirements/stories/future/US-906-electron-devtools-developer-path.md)）— 6 条 AC 关 5，剩人工验收
- 👀 **插件依赖声明与按需装卸**（[US-015](requirements/stories/core/US-015-plugin-inject-dependency.md)）— 阶段 A 已交付，停在 In Review，解锁条件 = 出现第一个 `plugin:*` 依赖声明

### 待办

- ⬜ **提交图与 HEAD 持久化**（[US-305](requirements/stories/collaboration/US-305-commit-graph-head.md)）— epic-006 链首，卡在一次桥接发布而非代码，见 [release-plan](requirements/release-plan.md)
- ⬜ **多端小程序宿主**（[US-211](requirements/stories/adapter/US-211-multi-miniprogram-platforms.md)）— 先抽宿主契约与可行性矩阵，再按门禁放行支付宝 / 抖音 / 百度 / QQ
- ⬜ **PGlite 侧 QueryCache 行契约**（[US-024](requirements/stories/core/US-024-pglite-querycache-row-contract.md)）— sqlite-core 已有的缺列诊断补到 PGlite 落地路径

## 路线图

路线图按 Epic 组织，已完成 [Epic 1（核心 MVP）](requirements/epics/epic-001-core-mvp.md)、[Epic 2（数据同步）](requirements/epics/epic-002-data-sync.md) 与 [Epic 8（生命周期作用域）](requirements/epics/epic-008-lifecycle-scope.md)，[Epic 4（未来功能）](requirements/epics/epic-004-future-features.md)、[Epic 5（类型系统演进）](requirements/epics/epic-005-type-system-evolution.md) 与 [Epic 7（公开 API 门禁）](requirements/epics/epic-007-public-api-gates.md) 进行中。所有阶段遵守相同的横向原则：跨框架 API 对称、Local-first 优先、模型驱动、适配器无关。

### 阶段 1 → 1.0 发布

将已完成能力推到稳定可发版状态。阻塞项：

- **API 冻结**：核心 / 适配器 / 框架集成锁定对外类型，进入 semver
- **覆盖率门禁**：核心包 ≥ 90%，其余 ≥ 80%（已接入 CI，门槛只升不降）
- **1.0 文档**：API 参考、迁移指南、兼容矩阵已完成骨架，内容补齐中（新增的 electron / tauri / http / miniprogram 包 API 文档待生成）

### 1.0 之后

生产可靠性、多端协作、模型驱动应用、文件与跨平台、搜索与本地 AI、安全与生态六个方向见
[requirements/vision.md](requirements/vision.md)。那是方向不是承诺：每个方向开工前都要基于真实用户反馈新建 Epic。

---

## 开发与贡献

欢迎提交 Issue 和 PR。提交前请先确保：

- 完整的测试：核心包覆盖率 ≥ 90%，其余包 ≥ 80%
- 通过所有检查：`pnpm run test-all`
- 保持跨框架 API 一致：Angular / React / Vue 三端示例齐全

快速开始：

```bash
pnpm install
pnpm nx serve dev-rxdb-angular
```

也可以启动其他示例：

- `pnpm nx serve dev-rxdb-supabase`
- `pnpm nx serve rxdb-devtools-extension`

完整检查：

```bash
pnpm run test-all
```

详情见：[CONTRIBUTING.md](CONTRIBUTING.md)

## 许可证

本项目采用 [MIT 许可证](LICENSE)。
