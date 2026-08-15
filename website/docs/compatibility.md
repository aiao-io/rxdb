# 版本兼容矩阵

本页汇总 Aiao 各包与运行时、语言、框架及彼此之间的兼容关系。数据源自各包的 `engines` 与 `peerDependencies`；随版本演进，请以对应版本发布时的 `package.json` 为准。

> 当前所有 `@aiao/*` 发布包同步版本号（fixed release group）。下文以 `<aiao>` 表示同一发布版本。

## 运行时与语言

| 依赖       | 要求                                    | 说明                                                                  |
| :--------- | :-------------------------------------- | :-------------------------------------------------------------------- |
| Node.js    | `>=22`                                  | 见根 `package.json` 的 `engines.node`；开发环境推荐 24（见 `.nvmrc`） |
| pnpm       | `>=10`                                  | 仅开发/构建需要                                                       |
| TypeScript | `~6.0`                                  | strict、ESM；消费端建议 `>=5.5` 以支持所用类型特性                    |
| 浏览器     | 支持 WASM + OPFS/IndexedDB 的现代浏览器 | 具体能力见下方「运行时能力 × 适配器」                                 |
| 微信小程序 | 支持 `WXWebAssembly` 的基础库版本       | **实验性**，仅 `@aiao/rxdb-adapter-miniprogram`；边界见下方专节       |

## 框架 × 框架绑定包

框架绑定采用 `peerDependencies`，因此由你的应用决定框架的具体次/补丁版本，只要落在下表范围内即可。

| 框架    | 绑定包                             | 框架版本要求                                             | RxJS     |
| :------ | :--------------------------------- | :------------------------------------------------------- | :------- |
| Angular | `@aiao/rxdb-angular`               | `@angular/core >=20.0.0`                                 | `^7.8.2` |
| React   | `@aiao/rxdb-react`                 | `react / react-dom ^19.2`                                | `^7.8.0` |
| Vue     | `@aiao/rxdb-vue`                   | `vue >=3.5.0`                                            | `^7.8.0` |
| Angular | `@aiao/rxdb-plugin-search-angular` | `@angular/core >=19.0.0`                                 | `^7.8.2` |
| React   | `@aiao/rxdb-plugin-search-react`   | `react ^19.2`                                            | `^7.8.2` |
| Vue     | `@aiao/rxdb-plugin-search-vue`     | `vue >=3.5.0`                                            | `^7.8.2` |
| Angular | `@aiao/code-editor-angular`        | `@angular/{common,core,forms,platform-browser} >=20.0.0` | —        |
| React   | `@aiao/code-editor-react`          | `react / react-dom ^19.2`                                | —        |
| Vue     | `@aiao/code-editor-vue`            | `vue >=3.5.0`                                            | —        |

## `@aiao/rxdb` × 适配器 / 插件

所有 `@aiao/*` 包同步发布，互相之间始终使用同一 `<aiao>` 版本。

| 包                               | 类型       | 依赖关系                                                                              |
| :------------------------------- | :--------- | :------------------------------------------------------------------------------------ |
| `@aiao/rxdb-adapter-wa-sqlite`   | 适配器     | 基于 wa-sqlite；**推荐浏览器 SQLite 默认方案**，依赖 `@aiao/rxdb-adapter-sqlite-core` |
| `@aiao/rxdb-adapter-sqlite`      | 适配器     | 官方 SQLite WASM，依赖 `@aiao/rxdb-adapter-sqlite-core`                               |
| `@aiao/rxdb-adapter-sqlite-wasm` | 适配器     | sqlite-wasm，**全文搜索插件的唯一兼容适配器**                                         |
| `@aiao/rxdb-adapter-sqliteai`    | 适配器     | sqliteai 运行时                                                                       |
| `@aiao/rxdb-adapter-pglite`      | 适配器     | 浏览器内 PGlite                                                                       |
| `@aiao/rxdb-adapter-supabase`    | 适配器     | Supabase 远端同步                                                                     |
| `@aiao/rxdb-adapter-encrypted`   | 适配器封装 | 为底层适配器提供透明加密                                                              |
| `@aiao/rxdb-adapter-miniprogram` | 适配器     | **实验性**，仅微信小程序逻辑层；基于 wa-sqlite，依赖 `@aiao/rxdb-adapter-wa-sqlite`   |
| `@aiao/rxdb-plugin-search`       | 插件       | 依赖 `@aiao/rxdb-adapter-sqlite-wasm`；其他适配器 fail-fast                           |
| `@aiao/rxdb-plugin-graph`        | 插件       | 图结构实体与查询                                                                      |
| `@aiao/rxdb-plugin-workspace`    | 插件       | NEW 草稿恢复，需浏览器 IndexedDB                                                      |
| `@aiao/rxdb-plugin-storage`      | 插件       | 存储管理与配额                                                                        |

## 运行时能力 × 适配器

| 适配器                                             | 运行时     | 需要的运行时能力                                                | 持久化                           |
| :------------------------------------------------- | :--------- | :-------------------------------------------------------------- | :------------------------------- |
| `rxdb-adapter-wa-sqlite`                           | 浏览器     | WASM；OPFS（推荐）或 IndexedDB 回退                             | OPFS 文件 / IDB                  |
| `rxdb-adapter-sqlite` / `rxdb-adapter-sqlite-wasm` | 浏览器     | WASM；OPFS（推荐）或 IndexedDB 回退                             | OPFS 文件 / IDB                  |
| `rxdb-adapter-pglite`                              | 浏览器     | WASM；IndexedDB                                                 | IDB                              |
| `rxdb-adapter-sqliteai`                            | 浏览器     | WASM                                                            | 取决于运行时配置                 |
| `rxdb-adapter-supabase`                            | 浏览器     | fetch / WebSocket（远端）                                       | 远端 + 本地缓存                  |
| `rxdb-adapter-miniprogram`                         | 微信小程序 | `WXWebAssembly`、`wx.getFileSystemManager()`、`BigInt` 等 11 项 | `wx.env.USER_DATA_PATH` 下的文件 |

> 全文搜索（`@aiao/rxdb-plugin-search`）基于 SQLite FTS5，仅在 `@aiao/rxdb-adapter-sqlite-wasm` 上可用。

### `@aiao/rxdb-adapter-miniprogram` 的能力边界

本适配器标记为**实验性**，接入前请确认下列限制可接受：

| 维度     | 支持情况                                                                                       |
| :------- | :--------------------------------------------------------------------------------------------- |
| 平台     | **仅微信小程序逻辑层**；不支持支付宝 / 抖音 / 百度 / QQ 等其他小程序平台                       |
| 并发     | **强制单连接**：同一数据库文件的第二个连接直接抛错，并发安全由 JS 层保证而非 SQLite 锁         |
| 日志模式 | `journal_mode = DELETE`（rollback journal），**不支持 WAL**、Worker / SharedWorker、多页面并发 |
| 崩溃恢复 | **无保证**——微信文件 API 缺少可靠的 `fsync`、文件锁与原子 rename                               |
| 数据量   | 整库缓冲在内存，仅适用于 ~10MB 级的兼容性验证，不适用于大数据量场景                            |
| 随机源   | 由 `wx.getRandomValues` 预取随机池；池耗尽时抛错，**任何情况下都不降级**到 `Math.random`       |
| 全文搜索 | 不支持（`@aiao/rxdb-plugin-search` 只兼容 `@aiao/rxdb-adapter-sqlite-wasm`）                   |

运行时启动前需调用 `@aiao/rxdb-adapter-miniprogram/runtime` 的 `prepareMiniProgramRuntime(wx)`，
缺少任一必需能力时 fail-fast 并列出全部缺失项。详见[包 README](https://github.com/aiao-io/rxdb/tree/main/packages/rxdb-adapter-miniprogram)。

## 参考

- [迁移指南](./migration/README.md)
- 各包 API 参考见「API 文档」
