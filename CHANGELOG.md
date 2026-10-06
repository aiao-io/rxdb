## 0.0.26 (2026-10-01)

桥接版本（bridge）：发布点为 `de70a1a9`（US-025 核心插件外移完成）。`RXDB_SYSTEM_SCHEMA_VERSION` 与 `RXDB_CHANGE_CODEC_VERSION` 均未提升，已有本地数据库无需迁移即可打开。

### ⚠️ Breaking Changes

相对 0.0.25 共七组破坏性变更，均附迁移指南：

- **rxdb / rxdb-adapter-sqlite-core:** 删除跨 realm writer lease。`@aiao/rxdb` 移除 16 个导出（`RxDBWriterLeaseError` 等常量、函数、类型），`@aiao/rxdb-adapter-sqlite-core/testing` 移除 `rowsAffectedConformanceSuite`，`RxDBAdapterLocalBase.startWriterLease()` 移除。PGlite 遗留的 `rxdb.rxdb_upgrade_guard` / `rxdb.rxdb_writer_lease` 表可保留。→ [writer-lease-removal](https://rxdb.netlify.app/docs/migration/writer-lease-removal) ([#10](https://github.com/aiao-io/rxdb/pull/10))
- **rxdb:** 删除孤立类型 `RemoteSyncOptions`；冲突解决改用 `PullOptions.conflictResolver` / `PullRepositoryOptions.conflictResolver`。→ [remote-sync-options](https://rxdb.netlify.app/docs/migration/remote-sync-options) ([#52](https://github.com/aiao-io/rxdb/pull/52))
- **rxdb:** 历史、同步、QueryCache 子系统外移到 `@aiao/rxdb-plugin-history` / `@aiao/rxdb-plugin-sync` / `@aiao/rxdb-plugin-querycache`，核心包 13 个导出随之迁出；`QueryCacheRepository` 更名为 `QueryCacheEngine`。→ [history-sync-plugins](https://rxdb.netlify.app/docs/migration/history-sync-plugins)、[querycache-plugin](https://rxdb.netlify.app/docs/migration/querycache-plugin) ([#61](https://github.com/aiao-io/rxdb/pull/61))
- **rxdb-adapter-desktop:** 拆分为 `@aiao/rxdb-adapter-electron` 与 `@aiao/rxdb-adapter-tauri`，import 路径与适配器注册名随之变更，数据文件与线协议不变；旧包 `@aiao/rxdb-adapter-desktop` 停在 0.0.25，不标记 deprecated。→ [desktop-split](https://rxdb.netlify.app/docs/migration/desktop-split) ([#29](https://github.com/aiao-io/rxdb/pull/29))
- **rxdb:** 插件拆卸改为宿主下发 `LifecycleScope` + 逆序释放，第三方插件的 `install()` 需接收作用域；内置插件已迁移。→ [plugin-scope](https://rxdb.netlify.app/docs/migration/plugin-scope) ([#34](https://github.com/aiao-io/rxdb/pull/34))
- **rxdb-adapter-supabase:** 连不上远端（`status === 0`）时改抛 core 的 `NetworkOfflineError`（原为 `SupabaseDataError`），QueryCache 的 `offlineFallback` 由此生效；401/403/409/5xx 仍为 `SupabaseDataError`。→ [supabase-network-errors](https://rxdb.netlify.app/docs/migration/supabase-network-errors) ([#39](https://github.com/aiao-io/rxdb/pull/39))
- **rxdb-client-generator:** 实体元数据 `default` 的生成改为按运行时类型分派，不再先做 `JSON.stringify` / `JSON.parse` 往返。bigint、`Uint8Array`、`Date` 现在原样还原；函数默认值（`() => uuid()` 等）此前会被**静默丢弃**，现在生成期抛 `unsupportedDefaultFactory`；`NaN` / `Infinity`、非法 `Date`、循环引用、`Map` 等无法确定性还原的值抛 `unsupportedDefaultValue`。继承 `EntityBase` 的实体不受影响。→ [generator-default](https://rxdb.netlify.app/docs/migration/generator-default)（补录：0.0.26 发布时漏报）([#39](https://github.com/aiao-io/rxdb/pull/39))

### 📦 首次发布的包

- `@aiao/rxdb-adapter-electron`、`@aiao/rxdb-adapter-tauri`（取代 `@aiao/rxdb-adapter-desktop`）
- `@aiao/rxdb-adapter-http`
- `@aiao/rxdb-plugin-history`、`@aiao/rxdb-plugin-sync`、`@aiao/rxdb-plugin-querycache`

### 🚀 Features

- **aiao:** update deps ([#46](https://github.com/aiao-io/rxdb/pull/46))
- **aiao:** rxdb-adapter-http ([#47](https://github.com/aiao-io/rxdb/pull/47))
- **aiao:** 完成 US-208（Electron PGlite 数据目录与事务宿主）、US-703（PGlite 全文搜索） ([#48](https://github.com/aiao-io/rxdb/pull/48))
- **aiao:** 添加 DevTools 面板，更新相关配置以支持 Electron 应用 ([#52](https://github.com/aiao-io/rxdb/pull/52))
- **aiao:** US-906 Electron 桌面端 DevTools 面板的开发者可用路径 ([#53](https://github.com/aiao-io/rxdb/pull/53))
- **aiao:** 落地 US-024 远端 QueryCache 行契约 ([#57](https://github.com/aiao-io/rxdb/pull/57))
- **aiao:** 添加 dev-rxdb-miniprogram ([#54](https://github.com/aiao-io/rxdb/pull/54))
- **aiao:** 拆分 rxdb 功能为 plugin（US-025） ([#61](https://github.com/aiao-io/rxdb/pull/61))
- **rxdb:** Local file storage ([#11](https://github.com/aiao-io/rxdb/pull/11))
- **rxdb:** 删除跨 realm writer lease，清理 review 文档 ([#10](https://github.com/aiao-io/rxdb/pull/10))
- **rxdb:** US-012 字段语义元数据 ([#20](https://github.com/aiao-io/rxdb/pull/20))
- **rxdb:** 添加 CodeQL 告警清单与 AI review 规则记录 ([#21](https://github.com/aiao-io/rxdb/pull/21))
- **rxdb:** 优化字段语义与前端通信契约 ([#22](https://github.com/aiao-io/rxdb/pull/22))
- **rxdb:** 完善桌面端访问本地 sqlite 的能力 ([#29](https://github.com/aiao-io/rxdb/pull/29))
- **rxdb:** 优化 dev-rxdb-electron，dev-rxdb-tauri ([#30](https://github.com/aiao-io/rxdb/pull/30))
- **rxdb:** 添加插件作用域管理, 优化中文表达 ([#34](https://github.com/aiao-io/rxdb/pull/34))
- **rxdb:** 落地插件 inject 依赖调度 ([#35](https://github.com/aiao-io/rxdb/pull/35))
- **rxdb:** 完善 QueryCache 接入 Repository 功能 ([#38](https://github.com/aiao-io/rxdb/pull/38))
- **rxdb:** 添加 rxdb-adapter-http 适配器 ([#39](https://github.com/aiao-io/rxdb/pull/39))
- **rxdb-adapter-desktop:** 添加 tauri 本地数据库支持 ([#7](https://github.com/aiao-io/rxdb/pull/7))
- **rxdb-devtools:** devtools for tauri ([#58](https://github.com/aiao-io/rxdb/pull/58))
- **website:** 使用 wujie 加载三端 demo ([#31](https://github.com/aiao-io/rxdb/pull/31))
- **website:** 抽出共享测试 bus，Vue 主题副作用改绑 detached scope ([#32](https://github.com/aiao-io/rxdb/pull/32))

### 🩹 Fixes

- **rxdb:** 修正 0.0.25 已发布的 `@aiao/rxdb` 中 `RXDB_VERSION` 误报为 `"0.0.24"` 的问题；0.0.26 起与包版本一致
- **rxdb-devtools:** US-908 传输取消时 `cancel()` 等待在途写入排空；Electron 应用在 `pagehide` 时调用 `dispose()` 释放桌面文件会话 ([#53](https://github.com/aiao-io/rxdb/pull/53))
- **aiao:** 修复错误，添加用户故事 ([#17](https://github.com/aiao-io/rxdb/pull/17))
- **aiao:** 修复 ci bug ([2bc4f6a2](https://github.com/aiao-io/rxdb/commit/2bc4f6a2))
- **rxdb:** 主分支打包错误 ([#23](https://github.com/aiao-io/rxdb/pull/23))

### 🧹 Cleanup

- **aiao:** 清理文件 ([91cb5a13](https://github.com/aiao-io/rxdb/commit/91cb5a13))
- **rxdb:** format all ([f77783a3](https://github.com/aiao-io/rxdb/commit/f77783a3))
- **rxdb:** 优化需求文案，部分太长的代码 ([#36](https://github.com/aiao-io/rxdb/pull/36))
- **rxdb:** 拆分长文件 ([#37](https://github.com/aiao-io/rxdb/pull/37))

### ❤️ Thank You

- Jimmy @Jimmysh
- Jimmy Liu @aiao-io
