<div align="center">

# RxDB

[![codecov](https://codecov.io/gh/aiao-io/aiao/branch/main/graph/badge.svg?token=g46Yu3vLzx)](https://codecov.io/gh/aiao-io/aiao)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![User Stories](https://img.shields.io/badge/User_Stories-32%2F37_Done-green)](requirements/status-overview.md)

</div>

RxDB 是一套面向 Local-first 应用的 TypeScript 基建。

它整合了数据库、响应式数据流、模型定义和前端集成，通过装饰器驱动的实体定义自动生成类型安全的 Repository 和查询 API，让你可以在浏览器中直接运行 SQLite，用接近原生 App 的方式构建离线优先、数据驱动的 Web 应用。

## 技术栈

| 层        | 技术                                                   |
| --------- | ------------------------------------------------------ |
| 语言      | TypeScript 6.0+ strict, ESM                            |
| 构建      | Nx 23 + pnpm 10                                        |
| 框架      | Angular 22+ / React 19+ / Vue 3.5+                     |
| 状态/响应 | RxJS 7.8+                                              |
| 存储      | wa-sqlite / sqlite-wasm / PGlite / Supabase / sqliteai |
| 测试      | Vitest (unit/integration) + Playwright (e2e/a11y)      |
| 运行时    | 浏览器 (OPFS/IDB) + Node 26+ + Electron + Tauri        |

> [!NOTE]
> ⚠️ 本项目仍处于早期阶段，目前正在积极开发中，不建议直接用于生产环境，请关注更新并等待 1.0 的发布

## RxDB 解决什么问题？

- 传统 Web 应用里，数据库 schema、TypeScript 类型、状态管理、前后端通信、离线能力往往需要分别维护，一处改动需要同步多处代码，维护成本高。
- RxDB 试图把这些基础能力统一起来：同一份模型定义，驱动数据库、查询、变更、客户端代码和 UI 集成。
- 如果你在做离线优先、复杂数据结构、强类型协作应用，这套方案会更顺手。

## 核心特点

- 响应式：数据变化自动驱动 UI 更新，减少手写状态同步。
- Local-first：浏览器内运行数据库，弱网和离线场景体验更稳定。
- 强类型：从模型定义出发，生成类型安全的查询、变更和客户端代码。
- 数据驱动：适合树、图、地理信息等复杂结构，并支持围绕模型生成基础 CRUD 能力。
- 跨框架：提供 Angular、React、Vue 三端集成，保持 API 风格一致。
- 可协作：围绕数据版本与同步演进，目标是支持多端一致性和多人协作。

参考生态：

- [jazz](https://jazz.tools/)
- [livestore](https://github.com/livestorejs/livestore)
- [powersync-js](https://github.com/powersync-ja/powersync-js)
- [zero](https://zero.rocicorp.dev/)

## 现在有什么？

当前仓库已经包含以下核心模块：

**核心**

- RxDB 核心：模型定义、查询、变更、关系映射、响应式查询、事务、跨 Tab 同步
- 客户端代码生成：基于 ts-morph，从模型产出类型安全的 Repository 与查询构建器
- 存储适配器：wa-sqlite / sqlite-wasm（subframe + 官方）/ sqliteai（向量 + AI 函数）/ PGlite（WASM PostgreSQL）/ Supabase（PostgREST + Realtime）/ miniprogram（微信/Alipay 小程序），通过 `rxdb-adapter-sqlite-core` 共享 SQLite 系核心
- 框架集成：Angular (Signals)、React (Hooks)、Vue (Composables)，三端 API 对称

**插件**

- 树形数据：`@TreeEntity` + TreeRepository
- 图数据：`@GraphEntity` + GraphRepository
- 全文搜索：`@aiao/rxdb-plugin-search` 基于 SQLite FTS5,三端绑定 + reactive refresh + adapter guard
- 文件存储：OPFS 文件存储,元数据由 RxDB 管理,支持上传/下载/预览/watch
- 工作区：staging / commit / restore 工作流

**协作与安全**

- 版本控制：Git-like 分支、合并、切换，变更压缩
- 撤销/重做：基于 inversePatch + transactionId 分组
- Supabase 同步：RPC 推送、PostgREST、Realtime 订阅
- 字段级加密：`@aiao/rxdb-adapter-encrypted`，AES-GCM-256 + WebCrypto，透明加解密
- 小程序适配：`@aiao/rxdb-adapter-miniprogram`，微信/Alipay 小程序存储适配，支持本地持久化与响应式查询

**UI 与工具**

- code-editor：基于 CodeMirror 6 的跨框架编辑器
- Devtools：运行时调试包与 Chrome 扩展
- 多端演示：Web、Supabase、Electron、Tauri

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

### 已验证的典型场景

- Todo List：增删改、历史记录、撤销/重做
- 树结构文件管理：增删改、拖拽移动、路径唯一性校验、撤销/重做、搜索
- 树结构菜单管理：增删改、同路径告警、拖拽排序、撤销/重做、搜索
- Supabase 同步：本地优先的远端同步 demo（PostgREST + Realtime + RPC 推送）

### 正在推进

- Headless 组件：只负责数据计算和状态管理，UI 交由业务侧实现
- PG 全文搜索路径：FTS5 已落地，PGlite 的 `tsvector` 路径补齐
- 工作区工作流：staging / commit / restore 的进一步打磨

## 路线图

路线图分阶段推进，当前以阶段 1 收尾为主。所有阶段遵守相同的横向原则：跨框架 API 对称（Angular / React / Vue 三端齐全）、Local-first 优先（先有无网络可用路径再做远端增强）、模型驱动（装饰器 + 客户端生成）、适配器无关（插件不绑定特定后端）。

### 阶段 1 收尾（约 6–8 周）

把现有代码推到稳定可发版状态。

- **真实意见**：开源并收集真实用户反馈，验证设计假设，调整优先级
  - 🚧 反馈入口（Issue / PR 模板、贡献指南）已就绪；开源与反馈闭环进行中
- **API 冻结**：核心 / 适配器 / 框架集成的对外类型与导出锁定，进入 semver 维护
  - 🚧 API 表面基线 + [稳定性策略](https://rxdb.netlify.app/docs/versioning) + conventional-commits 版本决策已建立；0.x → 1.0 正式冻结待发布
- **测试覆盖率提升**：核心包 ≥ 90%、其余 ≥ 80% 的覆盖率门禁，补齐边界与降级路径
  - 🚧 覆盖率门禁已接入 CI（先测量再棘轮，按包分级判定）；边界与降级路径补齐进行中
- **1.0 文档冲刺**：API 参考、迁移指南、版本兼容表、跨框架示例对齐
  - 🚧 API 参考（26 包）、[迁移指南](https://rxdb.netlify.app/docs/migration/)、[兼容矩阵](https://rxdb.netlify.app/docs/compatibility)、跨框架示例骨架已完成；内容持续补齐

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
