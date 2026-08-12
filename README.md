<div align="center">

# RxDB

[![codecov](https://codecov.io/gh/aiao-io/rxdb/graph/badge.svg?token=VJW8U2PNBG)](https://codecov.io/gh/aiao-io/rxdb)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![User Stories](https://img.shields.io/badge/User_Stories-32%2F37_Done-green)](requirements/status-overview.md)

</div>

RxDB 是面向 Local-first 应用的 TypeScript 全栈数据层。

- 使用装饰器定义的实体模型，自动生成类型安全的 Repository 和查询 API
- 一份模型声明同时驱动数据库 schema、TypeScript 类型和响应式数据流。
- 浏览器里直接跑 SQLite，用接近原生 App 的体验构建离线优先应用。

## Demo

| 框架    | 地址                                                                   |
| ------- | ---------------------------------------------------------------------- |
| Angular | [rxdb.netlify.app/demo/angular](https://rxdb.netlify.app/demo/angular) |
| React   | [rxdb.netlify.app/demo/react](https://rxdb.netlify.app/demo/react)     |
| Vue     | [rxdb.netlify.app/demo/vue](https://rxdb.netlify.app/demo/vue)         |

## 技术栈

| 层     | 技术                                                   |
| ------ | ------------------------------------------------------ |
| 语言   | TypeScript 6.0+ strict, ESM                            |
| 构建   | Nx 23 + pnpm 10                                        |
| 框架   | Angular 22+ / React 19+ / Vue 3.5+                     |
| 响应式 | RxJS 7.8+                                              |
| 存储   | wa-sqlite / sqlite-wasm / PGlite / Supabase / sqliteai |
| 测试   | Vitest (unit/integration) + Playwright (e2e/a11y)      |
| 运行时 | 浏览器 (OPFS/IDB) + Node 26+ + Electron + Tauri        |

> [!NOTE]
> ⚠️ 核心 MVP 已完成（[32/37 stories](requirements/status-overview.md)），当前处于 1.0 发布冲刺阶段。API 仍在演进中，生产使用前请锁定版本并关注 [迁移指南](https://rxdb.netlify.app/docs/migration/)。

## RxDB 解决什么问题？

传统 Web 应用中，数据库 schema、TypeScript 类型、状态管理、前后端通信、离线能力往往各自维护 —— 改一处就要同步多处，维护成本高。

RxDB 把这些能力统一到一份模型声明里：同一份实体定义，同时驱动数据库、查询、变更、客户端代码和 UI 集成。对离线优先、复杂数据结构和强类型协作场景，这套方案会让你更顺手。

## 核心特点

| 特点            | 说明                                             |
| --------------- | ------------------------------------------------ |
| **响应式**      | 数据变更自动驱动 UI，无需手动同步状态            |
| **Local-first** | 浏览器内运行数据库，弱网离线同样稳定             |
| **强类型**      | 从模型定义推导出类型安全的查询、变更和客户端代码 |
| **数据驱动**    | 原生支持树、图等复杂结构，围绕模型自动生成 CRUD  |
| **跨框架**      | Angular / React / Vue 三端集成，API 风格一致     |
| **可协作**      | 围绕数据版本与同步演进，目标多端一致、多人协作   |

参考生态：

- [jazz](https://jazz.tools/)
- [livestore](https://github.com/livestorejs/livestore)
- [powersync-js](https://github.com/powersync-ja/powersync-js)
- [zero](https://zero.rocicorp.dev/)

## 现在有什么？

当前仓库已经包含以下核心模块：

**核心引擎**

- 装饰器驱动模型定义：`@Entity` / `@TreeEntity` 一处声明 `properties` / `relations` / `indexes`，自动生成 DDL 与 TypeScript 类型
- 客户端代码生成：ts-morph 驱动的 Repository + 查询构建器，类型安全、零样板代码
- 响应式查询：RxJS Observable → Angular Signals / React Hooks / Vue Composables
- CRUD + 事务：原子批量操作、upsert、乐观锁、嵌套 save
- 关系映射：1:1 / 1:N / N:1 / M:N 自动中间表，级联查询与变更
- 变更追踪：patch / inversePatch，支撑撤销/重做与版本控制
- 跨 Tab 同步：BroadcastChannel + leader election，多 Tab 数据一致
- 高级类型：bigint（64 位有符号）与 binary（Uint8Array），全链路无损
- 树形数据：`@TreeEntity` + TreeRepository（路径唯一性、拖拽排序），核心包内建

**存储适配器**

- wa-sqlite / sqlite-wasm / sqlite（官方）：浏览器端 SQLite，共享 `sqlite-core` 抽象
- sqliteai：向量存储 + AI 内建函数（embedding、相似度）
- PGlite：WASM PostgreSQL，完整 PG 生态
- Supabase：PostgREST + Realtime + RPC 推送，远程同步
- 加密包装器：AES-GCM-256 + WebCrypto，透明字段级加解密
- 小程序：微信 / Alipay 本地持久化与响应式查询

**插件生态**

- 图数据：`@GraphEntity` + GraphRepository（节点/边管理、拓扑遍历）
- 全文搜索：FTS5 + reactive refresh + adapter guard，Angular / React / Vue 三端绑定
- 文件存储：OPFS 文件管理，元数据由 RxDB 托管，上传/下载/预览/watch
- 工作区：staging / commit / restore 工作流

**协作与安全**

- 版本控制：Git-like 分支、合并、切换，变更压缩
- 撤销/重做：inversePatch + transactionId 分组，跨 session 持久化
- Supabase 同步：RPC 推送 + PostgREST + Realtime 订阅，本地优先远端同步
- 字段级加密：透明加解密，加密字段不进 FTS 索引，历史快照自动脱敏

**UI 与工具**

- Code Editor：CodeMirror 6 跨框架编辑器，Angular / React / Vue 三端
- DevTools：运行时调试面板 + Chrome 扩展，实体浏览、查询监控、变更回放
- 多端演示：Web / Supabase / Electron / Tauri，覆盖全部运行时

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
│   ├── dev-rxdb-react/              # React DEMO
│   ├── dev-rxdb-react-e2e/          # React E2E
│   ├── dev-rxdb-supabase/           # Supabase 同步 DEMO
│   ├── dev-rxdb-supabase-e2e/       # Supabase E2E
│   ├── dev-rxdb-tauri/              # Tauri DEMO
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
│   ├── rxdb-adapter-encrypted/      # 字段级加密（AES-GCM-256）
│   ├── rxdb-adapter-miniprogram/    # 小程序适配器（微信/Alipay）
│   ├── rxdb-adapter-pglite/         # PGlite 适配器（PostgreSQL）
│   ├── rxdb-adapter-supabase/       # Supabase 适配器
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
- 同步 demo：`pnpm nx serve dev-rxdb-supabase`
- 桌面 demo：`pnpm nx serve dev-rxdb-electron`、`pnpm nx serve dev-rxdb-tauri`
- 调试扩展：`pnpm nx serve rxdb-devtools-extension`

## 适合什么场景？

- 需要离线优先体验的 Web 应用
- 数据结构复杂的业务系统，比如树、图、地理信息
- 希望前后端围绕同一套模型协作，减少重复定义的项目
- 想同时支持 Angular、React、Vue 的组件或平台型能力

## 当前进展

32/37 个 story 已交付。核心引擎、六种存储适配器、三框架集成、插件体系和协作能力均已就绪。

### 已验证场景

- **Todo List** — 增删改、历史记录、撤销/重做
- **树结构文件管理** — 增删改、拖拽移动、路径唯一性校验、撤销/重做、搜索
- **树结构菜单管理** — 增删改、同路径告警、拖拽排序、撤销/重做、搜索
- **Supabase 同步** — 本地优先远端同步，PostgREST + Realtime + RPC 推送

### 进行中

- 🚧 **Writer lease 与迁移 fencing**（[US-304](requirements/stories/collaboration/US-304-writer-lease-migration-fencing.md)）— 跨 Tab / Worker / 进程的安全迁移协议，防止旧连接在升级后写入不兼容格式

### 待办

- ⬜ **字段语义元数据**（[US-012](requirements/stories/core/US-012-field-semantic-metadata.md)）— `PropertyType + format` 统一契约，版本化前端 DTO
- ⬜ **桌面本地数据库**（[US-207](requirements/stories/adapter/US-207-desktop-local-database.md)）— Electron / Tauri 原生 SQLite / PGlite 持久化
- ⬜ **持久化 Git 式工作区提交**（[US-305](requirements/stories/collaboration/US-305-persistent-workspace-commits.md)）— 独立命名空间的 commit 存储
- ⬜ **PGlite 原生全文搜索**（[US-703](requirements/stories/future/US-703-pglite-full-text-search.md)）— tsvector / GIN / trigger，补齐与 SQLite FTS5 的能力对称

## 路线图

路线图按 Epic 组织，已完成 [Epic 1（核心 MVP）](requirements/epics/epic-001-core-mvp.md) 与 [Epic 2（数据同步）](requirements/epics/epic-002-data-sync.md)，[Epic 5（类型系统演进）](requirements/epics/epic-005-type-system-evolution.md) 收尾中。所有阶段遵守相同的横向原则：跨框架 API 对称、Local-first 优先、模型驱动、适配器无关。

### 阶段 1 → 1.0 发布

将已完成能力推到稳定可发版状态。阻塞项：

- 🚧 **US-304** writer lease：跨 realm 安全迁移的最后一道门禁
- ⬜ **US-012** 字段语义元数据：统一前端 DTO 与校验契约
- **API 冻结**：核心 / 适配器 / 框架集成锁定对外类型，进入 semver
- **覆盖率门禁**：核心包 ≥ 90%，其余 ≥ 80%（已接入 CI，棘轮式推进）
- **1.0 文档**：API 参考（26 包）、迁移指南、兼容矩阵已完成骨架，内容补齐中

### 阶段 2 生产可靠性

让 Local-first 数据进入真实业务后可维护、可恢复、可诊断。

- 数据库备份、恢复、导入导出和完整性检查
- schema migration 预检查、dry-run、失败恢复和升级诊断
- 同步队列持久化、断点续传、重试和积压监控
- 连接、事务、迁移、慢查询、存储容量和错误码观测
- 1.0 之后的兼容矩阵、升级助手和长期支持策略

### 阶段 3 多端协作与同步

把本地版本能力扩展为可审计、可控的多人和多设备协作。

- 远程 commit push/pull 与版本图同步
- 用户身份、设备身份、工作区成员和权限模型
- 选择性同步、按租户同步和按实体范围同步
- 冲突中心、字段级差异、人工解决和冲突回放
- 离线编辑批量合并、同步审计和设备恢复

### 阶段 4 模型驱动应用

让同一份字段语义同时驱动数据层、校验层和前端交互。

- 自动生成表单、表格、详情页、筛选器和关系编辑器
- 字段级权限、只读规则、条件显示和统一校验
- 计算字段、公式、汇总和物化视图
- `decimal`、`dateOnly`、`timeOnly`、附件和用户引用等业务类型
- 从模型生成前端 DTO、服务端校验和 API 契约

### 阶段 5 文件与跨平台数据

补齐文件型数据和原生应用的完整生命周期。

- 大文件分片上传、断点续传、缩略图和预览
- 文件元数据、实体关系、版本历史和垃圾回收
- 本地文件与远端对象存储同步
- 文件级加密、访问控制和安全下载
- 桌面与移动端原生数据库、备份目录和迁移工具

### 阶段 6 搜索与本地 AI

在全文搜索之上建立适配器无关的混合检索能力。

- FTS 与向量检索统一编排
- 本地 embedding 生成、索引更新和状态观测
- 语义搜索、相似记录和结果解释
- 多语言 tokenizer、拼写纠错和可配置相关性
- 本地模型优先，云端模型可插拔；加密字段默认不进入索引和模型输入

### 阶段 7 安全与生态

把基础库建设成可长期扩展的开发者平台。

- 系统 Keychain、Keystore、WebAuthn/passkey 和密钥轮换
- 审计日志、脱敏日志、合规导出和租户隔离
- 稳定的插件 SDK、第三方 adapter contract 和 schema registry
- 性能基准中心、生产诊断工具和可观测性扩展
- 生态示例、迁移工具和面向维护者的长期支持版本

后续阶段不是一次性承诺的功能清单。每个阶段开工前都应基于真实用户反馈新建 Epic，明确跨框架 parity、适配器矩阵、故障恢复、性能预算和发布门禁。查询构建器、CRDT、Tauri PGlite sidecar 等高复杂度方向，只有在对应场景被验证后再单独立项。

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
