# 版本兼容矩阵

本页汇总 Aiao 各包与运行时、语言、框架及彼此之间的兼容关系。数据源自各包的 `engines` 与 `peerDependencies`；随版本演进，请以对应版本发布时的 `package.json` 为准。

> 当前所有 `@aiao/*` 发布包同步版本号（fixed release group）。下文以 `<aiao>` 表示同一发布版本。

## 运行时与语言

| 依赖       | 要求                                    | 说明                                                                       |
| :--------- | :-------------------------------------- | :------------------------------------------------------------------------- |
| Node.js    | `>=26`                                  | 见根 `package.json` 的 `engines.node`；开发环境与 CI 使用 `.nvmrc` 中的 26 |
| pnpm       | `>=10`                                  | 仅开发/构建需要                                                            |
| TypeScript | `~6.0`                                  | strict、ESM；消费端建议 `>=5.5` 以支持所用类型特性                         |
| 浏览器     | 支持 WASM + OPFS/IndexedDB 的现代浏览器 | 具体能力见下方「运行时能力 × 适配器」                                      |
| 小程序     | 微信 / 抖音 / 支付宝逻辑层              | **实验性**，仅 `@aiao/rxdb-adapter-miniprogram`；边界见下方专节            |

## 框架 × 框架绑定包

框架绑定采用 `peerDependencies`，因此由你的应用决定框架的具体次/补丁版本，只要落在下表范围内即可。

| 框架    | 绑定包                                   | 框架版本要求                                                       | RxJS     |
| :------ | :--------------------------------------- | :----------------------------------------------------------------- | :------- |
| Angular | `@aiao/rxdb-angular`                     | `@angular/core 22.2.2`（精确 pin）                                 | `^7.8.2` |
| React   | `@aiao/rxdb-react`                       | `react / react-dom ^19.3.0`                                        | `^7.8.0` |
| Vue     | `@aiao/rxdb-vue`                         | `vue ^3.5.43`                                                      | `^7.8.0` |
| Angular | `@aiao/rxdb-plugin-search-angular`       | `@angular/core 22.2.2`（精确 pin）                                 | `^7.8.2` |
| React   | `@aiao/rxdb-plugin-search-react`         | `react ^19.3.0`                                                    | `^7.8.2` |
| Vue     | `@aiao/rxdb-plugin-search-vue`           | `vue ^3.5.43`                                                      | `^7.8.2` |
| Angular | `@aiao/rxdb-plugin-working-tree-angular` | `@angular/core 22.2.2`（精确 pin）                                 | `^7.8.2` |
| React   | `@aiao/rxdb-plugin-working-tree-react`   | `react ^19.3.0`                                                    | `^7.8.2` |
| Vue     | `@aiao/rxdb-plugin-working-tree-vue`     | `vue ^3.5.43`                                                      | `^7.8.2` |
| Angular | `@aiao/rxdb-plugin-replay-angular`       | `@angular/core 22.2.2`（精确 pin）                                 | —        |
| React   | `@aiao/rxdb-plugin-replay-react`         | `react ^19.3.0`                                                    | —        |
| Vue     | `@aiao/rxdb-plugin-replay-vue`           | `vue ^3.5.43`                                                      | —        |
| Angular | `@aiao/rxdb-plugin-tree-angular`         | `@angular/core 22.2.2`（精确 pin）                                 | `^7.8.2` |
| React   | `@aiao/rxdb-plugin-tree-react`           | `react ^19.3.0`                                                    | `^7.8.2` |
| Vue     | `@aiao/rxdb-plugin-tree-vue`             | `vue ^3.5.43`                                                      | `^7.8.2` |
| Angular | `@aiao/rxdb-model-angular`               | `@angular/core 22.2.2`（精确 pin）                                 | `^7.8.2` |
| React   | `@aiao/rxdb-model-react`                 | `react ^19.3.0`                                                    | `^7.8.2` |
| Vue     | `@aiao/rxdb-model-vue`                   | `vue ^3.5.43`                                                      | `^7.8.2` |
| Angular | `@aiao/code-editor-angular`              | `@angular/{common,core,forms,platform-browser} 22.2.2`（精确 pin） | —        |
| React   | `@aiao/code-editor-react`                | `react / react-dom ^19.3.0`                                        | —        |
| Vue     | `@aiao/code-editor-vue`                  | `vue ^3.5.43`                                                      | —        |

> Angular 绑定包当前把 `@angular/*` peer 写成了精确版本（工作区为 `22.2.2`）。改回区间的「peer 统一」归在 [US-602](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/tooling/US-602-ai-comprehensible-artifacts.md) 阶段 A2：目前仍在 **Backlog、尚未立项**，合入时将标注 `BREAKING CHANGE`——没有承诺的改版日期，见 [roadmap 未完成需求全景](https://github.com/aiao-io/rxdb/blob/main/requirements/roadmap.md#未完成需求全景)。

## `@aiao/rxdb` × 适配器 / 插件

工作区内所有 `@aiao/*` 包使用同一 `<aiao>` 版本号，互相之间按同一版本配套使用；部分包尚未发布到 npm。

| 包                               | 类型       | 依赖关系                                                                                                                            |
| :------------------------------- | :--------- | :---------------------------------------------------------------------------------------------------------------------------------- |
| `@aiao/rxdb-adapter-wa-sqlite`   | 适配器     | 基于 wa-sqlite；**推荐浏览器 SQLite 默认方案**，依赖 `@aiao/rxdb-adapter-sqlite-core`                                               |
| `@aiao/rxdb-adapter-sqlite`      | 适配器     | 官方 SQLite WASM，依赖 `@aiao/rxdb-adapter-sqlite-core`                                                                             |
| `@aiao/rxdb-adapter-sqlite-wasm` | 适配器     | sqlite-wasm，全文搜索（FTS5）已放行                                                                                                 |
| `@aiao/rxdb-adapter-sqliteai`    | 适配器     | sqliteai 运行时                                                                                                                     |
| `@aiao/rxdb-adapter-pglite`      | 适配器     | 浏览器内 PGlite                                                                                                                     |
| `@aiao/rxdb-adapter-supabase`    | 适配器     | Supabase 远端同步                                                                                                                   |
| `@aiao/rxdb-adapter-http`        | 适配器     | 自有 REST API 远端；**仅 `SyncType.QueryCache`**，changelog 方法一律 unsupported throw                                              |
| `@aiao/rxdb-adapter-encrypted`   | 加密工具包 | 密钥环与信封编解码；非适配器，由 sqlite-core / pglite 内部使用                                                                      |
| `@aiao/rxdb-adapter-miniprogram` | 适配器     | **实验性**，微信 / 抖音 / 支付宝小程序逻辑层（抖音、支付宝 Android 未验证）；基于 wa-sqlite，依赖 `@aiao/rxdb-adapter-wa-sqlite`    |
| `@aiao/rxdb-taro`                | 构建插件   | **实验性**，Taro 4.3（vite 编译器）一行接入 `@aiao/rxdb-adapter-miniprogram`，微信 / 抖音；支付宝经 `./vite` 子路径；Node `>=20.19` |
| `@aiao/rxdb-plugin-search`       | 插件       | 放行名单见下方「运行时能力 × 适配器」之后的说明；未放行的适配器 fail-fast                                                           |
| `@aiao/rxdb-plugin-working-tree` | 插件       | 工作树与提交历史；`use()` 必须排在 `connect()` 之前，声明 10 张系统表并写能力水位                                                   |
| `@aiao/rxdb-plugin-replay`       | 插件       | 基于 rrweb 的会话录制与回放；事件流写入独立录制库，可选依赖 working-tree 打 commit 标记                                             |
| `@aiao/rxdb-plugin-graph`        | 插件       | 图结构实体与查询                                                                                                                    |
| `@aiao/rxdb-plugin-workspace`    | 插件       | NEW 草稿恢复，需浏览器 IndexedDB                                                                                                    |
| `@aiao/rxdb-plugin-storage`      | 插件       | 存储管理与配额                                                                                                                      |
| `@aiao/rxdb-plugin-history`      | 插件       | 变更历史、撤销 / 重做与分支管理                                                                                                     |
| `@aiao/rxdb-plugin-sync`         | 插件       | 推拉同步、冲突解决与离线出站队列；依赖 `@aiao/rxdb-plugin-history`                                                                  |
| `@aiao/rxdb-plugin-querycache`   | 插件       | `SyncType.QueryCache` 的读引擎（远端权威 + 本地行缓存）                                                                             |
| `@aiao/rxdb-plugin-tree`         | 插件       | 树形实体、层级查询与增量合并                                                                                                        |
| `@aiao/rxdb-model`               | 模型库     | 框架无关的实体模型核心（元数据驱动的列表 / 表单）；三框架 UI 组件在 `@aiao/rxdb-model-{angular,react,vue}`                          |

## 运行时能力 × 适配器

| 适配器                                             | 运行时       | 需要的运行时能力                                                                     | 持久化                                                           |
| :------------------------------------------------- | :----------- | :----------------------------------------------------------------------------------- | :--------------------------------------------------------------- |
| `rxdb-adapter-wa-sqlite`                           | 浏览器       | WASM；OPFS（推荐）或 IndexedDB 回退                                                  | OPFS 文件 / IDB                                                  |
| `rxdb-adapter-sqlite` / `rxdb-adapter-sqlite-wasm` | 浏览器       | WASM；OPFS（推荐）或 IndexedDB 回退                                                  | OPFS 文件 / IDB                                                  |
| `rxdb-adapter-pglite`                              | 浏览器       | WASM；IndexedDB                                                                      | IDB                                                              |
| `rxdb-adapter-sqliteai`                            | 浏览器       | WASM                                                                                 | 取决于运行时配置                                                 |
| `rxdb-adapter-supabase`                            | 浏览器       | fetch / WebSocket（远端）                                                            | 远端 + 本地缓存                                                  |
| `rxdb-adapter-http`                                | 浏览器       | 全局 `fetch`（远端）                                                                 | 远端 + 独立注册的本地行缓存                                      |
| `rxdb-adapter-miniprogram`                         | 微信小程序   | `WXWebAssembly`、`wx.getFileSystemManager()`、`BigInt` 等 11 项                      | `wx.env.USER_DATA_PATH` 下的文件                                 |
| `rxdb-adapter-miniprogram`                         | 抖音小程序   | `TTWebAssembly`、`tt.getFileSystemManager()`、`BigInt` 等 11 项                      | `tt.getEnvInfoSync().common.USER_DATA_PATH` 下的 64 KiB 分块文件 |
| `rxdb-adapter-miniprogram`                         | 支付宝小程序 | 逻辑层 `WebAssembly`、`my.getFileSystemManager()`、Worker 随机源等（含未文档化能力） | `my.env.USER_DATA_PATH` 下的 64 KiB 分块文件                     |

> 全文搜索（`@aiao/rxdb-plugin-search`）的放行名单以 [backend-registry.ts](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb-plugin-search/src/backend/backend-registry.ts) 的登记表为准：`sqlite-wasm` / `sqlite` / `sqliteai` 走 SQLite FTS5，`pglite` 走 `pg-tsvector`；`wa-sqlite` 与 `wa-sqlite-miniprogram` 登记为 `unverified`，桌面宿主、`http`、`supabase` 无本地 SQL 连接，均在 `createRxDatabase` 阶段抛 `SearchUnsupportedAdapterError`。

### `@aiao/rxdb-adapter-miniprogram` 的能力边界

本适配器标记为**实验性**，接入前请确认下列限制可接受：

| 维度     | 支持情况                                                                                                                                                                                                   |
| :------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 平台     | **微信**、**抖音**与**支付宝**小程序的逻辑层，逐平台结论见下表                                                                                                                                             |
| 并发     | **强制单连接**：同一数据库文件的第二个连接直接抛错，并发安全由 JS 层保证而非 SQLite 锁                                                                                                                     |
| 日志模式 | `journal_mode = DELETE`（rollback journal），**不支持 WAL**、Worker / SharedWorker、多页面并发                                                                                                             |
| 崩溃恢复 | **无保证**——三个平台的文件 API 都缺少可靠的 `fsync`、文件锁与原子 rename                                                                                                                                   |
| 数据量   | 整库缓冲在内存，仅适用于 ~10MB 级的兼容性验证，不适用于大数据量场景                                                                                                                                        |
| 配额     | 与内存缓冲分开算。抖音用户目录总共约 10 MB（iOS 实测一次最多写入 9 MiB），库文件、`-journal` 与每库 128 KiB 的回滚余量共用；写满时事务以 `SQLITE_FULL` 失败，平台原文在 `cause` 链上，已提交的数据重开仍在 |
| 随机源   | 由 `wx.getRandomValues` / `tt.getRandomValues` / 支付宝 Worker 里的 `crypto.getRandomValues` 预取 64 KiB 随机池并在见底前后台补给；补给失败且余量耗尽时抛错，**任何情况下都不降级**到 `Math.random`        |
| 全文搜索 | wasm 已编入 FTS5，可直接写 SQL 虚拟表；但 `@aiao/rxdb-plugin-search` 尚未放行本适配器                                                                                                                      |

逐平台结论（判定依据与复议条件见[平台可行性矩阵](https://github.com/aiao-io/rxdb/blob/main/requirements/stories/adapter/miniprogram-platform-feasibility.md)）：

| 平台            | 结论       | 原因 / 边界                                                                                                                                                                                                                                      |
| :-------------- | :--------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 微信 `wechat`   | 实验性支持 | 上表边界全部适用                                                                                                                                                                                                                                 |
| 抖音 `douyin`   | 实验性支持 | 上表边界全部适用；开发者工具与 iOS 真机验证过，**Android 真机未验证**                                                                                                                                                                            |
| 支付宝 `alipay` | 实验性支持 | 上表边界全部适用；依赖四项**未文档化**能力（逻辑层的标准 `WebAssembly` 与 `BigInt`、Worker 里的 `crypto` 随机源、找回真实全局对象），平台改掉任一项时引导直接报错、不降级；开发者工具与 iOS 真机验证过，**Android 真机未验证**，配额上限没观测到 |
| 百度 `baidu`    | 不支持     | 找不到安全随机源与 WASM 入口（文档没有，也没有实测）                                                                                                                                                                                             |
| QQ `qq`         | 不支持     | 找不到安全随机源与 WASM 入口（文档没有，也没有实测）                                                                                                                                                                                             |

运行时启动前需调用 `@aiao/rxdb-adapter-miniprogram/runtime` 的 `prepareMiniProgramRuntime(wx)`（微信），
`prepareMiniProgramHostRuntime(createDouyinMiniProgramHost(tt, { runtimeGlobal }))`（抖音），
或 `prepareMiniProgramHostRuntime(createAlipayMiniProgramHost(my, { randomWorker, webAssembly }))`（支付宝，Worker 脚本与 wasm 文本副本的放法见包 README），
缺少任一必需能力时 fail-fast 并列出全部缺失项。详见[包 README](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-miniprogram)。

## 参考

- [迁移指南](./migration/README.md)
- 各包 API 参考见「API 文档」
