## Unreleased

### 🚀 Features

- **rxdb-plugin-history:** `VersionManager.compareBranches()` 与 `previewMerge()`：不切换分支就对比两条分支、预览一次合并会落什么，`merged` 与随后 `mergeBranch()` 返回的一致，并标出四类覆盖（`overwrite` / `delete_edited` / `update_deleted` / `revive_deleted`）。只读，不写任何表（US-312）
- **rxdb:** 新增 `ENTITY_BOOKKEEPING_FIELDS`（`remoteId` / `createdAt` / `updatedAt`）；工作树插件的 `UNTRACKED_BOOKKEEPING_FIELDS` 改为引用它，对比与覆盖判定同样不把这些字段算作差异（US-312）
- **rxdb-plugin-working-tree:** 只读检出位 `rxdb.workingTree.checkouts`：不切换分支、不动工作树，以只读方式打开另一条分支或当前分支上一个可达提交的完整数据。快照库与主库同一种后端、独立库名，用第二个只读实例浏览；`open()` / `attach()` / `list()` / `prune()`，会话归属与持久归属，排他 Web Lock；既有库连接期判定出孤儿时在连上之后回收；插件选项 `worktrees: { adapter, plugins? }`（US-313）
- **rxdb-plugin-working-tree-angular / -react / -vue:** `useWorktrees()`，三端同名同 API；打开的视图把 `view.rxdb` 交给各端现成的 Provider（US-313）
- **rxdb:** `cloneEntityClasses()` 从 `@aiao/rxdb/testing` 提为主入口公开 API；新增 `RxDBOptions.readOnly` 与 `RxDBReadOnlyError`；适配器新增可选的快照原语（`readWorktreeSnapshotPage` / `importWorktreeSnapshot` / `adoptWorktreeEncryption` / `sealWorktreeReadOnly`）与删库能力（`dropStorage()` / `canDropStorage()`）（US-313）
- **rxdb-adapter-pglite / -sqlite / -sqlite-wasm / -sqliteai / -wa-sqlite / -electron:** 实现快照原语与 `dropStorage()`；Electron 桌面线协议新增 `drop` 请求，老宿主在任何副作用之前就拒绝不认识的请求，协议版本不变（US-313）
- **rxdb-model / -angular / -react / -vue:** `deriveEntityCapabilities` 认实例侧的 `readOnly`：只读实例上实体列表不出新建、编辑与删除（US-313）
- **rxdb-plugin-working-tree:** 从提交建分支 `rxdb.workingTree.createBranchFromCommit(branchId, commitId)`：新分支的 HEAD 就是当前分支历史里的那个提交（与源分支共享之前的历史），工作树为空，切过去读到那次 `commit()` 刚完成时的数据；只建不切。`checkBranchFromCommit(commitId)` 先判建不建得了，被拒三种走返回值（`unreachable_target` / `fork_point_unknown` / `history_rewritten`）。分叉点在提交时同一事务记进新的系统表 `rxdb_commit_fork_point`，既有库连接时补建，补建之前的提交不能拿来建分支（US-314）
- **rxdb-plugin-working-tree-angular / -react / -vue:** `useWorkingTree()` 新增 `checkBranchFromCommit()` / `createBranchFromCommit()` 与两格命令状态（US-314）
- **rxdb:** 建分支上下文 `RxDBBranchCreationContext` 新增可选的 `fromCommitId`，原样转交给系统贡献方（US-314）

### 🩹 Fixes

- **rxdb:** 多对多解绑后保存，中间行留在根实体的待删集合里；切走再切回来那一行被切换插回，下一次哪怕只改一个标量的 `save()` 都会把它再删一遍。两端都不记日志（`log: false`）时，生成的中间表也不再记日志（US-313）
- **rxdb:** 只读实例与可写实例共用一个实体类时（核心系统实体每个实例都登记），`RxDBBranch.find()` 这类静态调用落到可写的那个，不再报多实例；两个可写实例共用一个类照旧报错（US-313）
- **rxdb-adapter-pglite:** 断开时关掉 IdbFs 留着的 IndexedDB 连接，此前之后的 `deleteDatabase` 会一直卡在 `blocked`（US-313）
- **rxdb-adapter-sqlite-wasm:** 断开与初始化失败时关掉打开库的 VFS，IndexedDB 系 VFS 的连接此前一直留着（US-313）
- **rxdb-adapter-sqlite-wasm / -wa-sqlite:** OPFS 库整页刷新后偶发打不开（上一个页面的 Worker 还占着库文件的同步访问句柄，应用起不来也不报错）：打开失败为 `SQLITE_CANTOPEN` 时有界退避重试（合计约 3 秒），每次重试前交出失败那次留下的句柄，用尽后仍被占用就报占用。sqlite-wasm 的 `opfs` 档与 wa-sqlite 的 `OPFSCoopSyncVFS` 是同一个 VFS，一并覆盖；wa-sqlite 的其余 VFS 不重试。自己实现 `WaSqliteClientRuntime` 的要补上必选的 `open()`（US-221）
- **rxdb-model:** 实体表格接键盘焦点的隐藏输入框补上可读名，此前 axe 判 `label`（critical），读屏只念「编辑框，只读」（US-313）
- **rxdb-plugin-workspace:** 草稿缓存不再收系统表与关闭变更日志（`log: false`）实体的草稿。此前系统表名单只认核心四张表，插件登记的系统表（如工作树插件的提交表）与 storage 插件的 `StorageFileMeta` 每次构造都留下一条永远清不掉的草稿：它们出现在 `list()` / `cacheCount` 里、广播给其他标签页、每次启动被恢复。`install()` 会删掉 IndexedDB 里已有的这类草稿（US-311）

## 0.0.26 (2026-10-01)

桥接版本（bridge）：发布点为 `de70a1a9`（US-025 核心插件外移完成）。`RXDB_SYSTEM_SCHEMA_VERSION` 与 `RXDB_CHANGE_CODEC_VERSION` 均未提升，已有本地数据库无需迁移即可打开。

### ⚠️ Breaking Changes

相对 0.0.25 共七组破坏性变更，均附迁移指南：

- **rxdb / rxdb-adapter-sqlite-core:** 删除跨 realm writer lease。`@aiao/rxdb` 移除 16 个导出（`RxDBWriterLeaseError` 等常量、函数、类型），`@aiao/rxdb-adapter-sqlite-core/testing` 移除 `rowsAffectedConformanceSuite`，`RxDBAdapterLocalBase.startWriterLease()` 移除。PGlite 遗留的 `rxdb.rxdb_upgrade_guard` / `rxdb.rxdb_writer_lease` 表可保留。→ [writer-lease-removal](https://rxdb.aiao.io/docs/migration/writer-lease-removal) ([#10](https://github.com/aiao-io/rxdb/pull/10))
- **rxdb:** 删除孤立类型 `RemoteSyncOptions`；冲突解决改用 `PullOptions.conflictResolver` / `PullRepositoryOptions.conflictResolver`。→ [remote-sync-options](https://rxdb.aiao.io/docs/migration/remote-sync-options) ([#52](https://github.com/aiao-io/rxdb/pull/52))
- **rxdb:** 历史、同步、QueryCache 子系统外移到 `@aiao/rxdb-plugin-history` / `@aiao/rxdb-plugin-sync` / `@aiao/rxdb-plugin-querycache`，核心包 13 个导出随之迁出；`QueryCacheRepository` 更名为 `QueryCacheEngine`。→ [history-sync-plugins](https://rxdb.aiao.io/docs/migration/history-sync-plugins)、[querycache-plugin](https://rxdb.aiao.io/docs/migration/querycache-plugin) ([#61](https://github.com/aiao-io/rxdb/pull/61))
- **rxdb-adapter-desktop:** 拆分为 `@aiao/rxdb-adapter-electron` 与 `@aiao/rxdb-adapter-tauri`，import 路径与适配器注册名随之变更，数据文件与线协议不变；旧包 `@aiao/rxdb-adapter-desktop` 停在 0.0.25，不标记 deprecated。→ [desktop-split](https://rxdb.aiao.io/docs/migration/desktop-split) ([#29](https://github.com/aiao-io/rxdb/pull/29))
- **rxdb:** 插件拆卸改为宿主下发 `LifecycleScope` + 逆序释放，第三方插件的 `install()` 需接收作用域；内置插件已迁移。→ [plugin-scope](https://rxdb.aiao.io/docs/migration/plugin-scope) ([#34](https://github.com/aiao-io/rxdb/pull/34))
- **rxdb-adapter-supabase:** 连不上远端（`status === 0`）时改抛 core 的 `NetworkOfflineError`（原为 `SupabaseDataError`），QueryCache 的 `offlineFallback` 由此生效；401/403/409/5xx 仍为 `SupabaseDataError`。→ [supabase-network-errors](https://rxdb.aiao.io/docs/migration/supabase-network-errors) ([#39](https://github.com/aiao-io/rxdb/pull/39))
- **rxdb-client-generator:** 实体元数据 `default` 的生成改为按运行时类型分派，不再先做 `JSON.stringify` / `JSON.parse` 往返。bigint、`Uint8Array`、`Date` 现在原样还原；函数默认值（`() => uuid()` 等）此前会被**静默丢弃**，现在生成期抛 `unsupportedDefaultFactory`；`NaN` / `Infinity`、非法 `Date`、循环引用、`Map` 等无法确定性还原的值抛 `unsupportedDefaultValue`。继承 `EntityBase` 的实体不受影响。→ [generator-default](https://rxdb.aiao.io/docs/migration/generator-default)（补录：0.0.26 发布时漏报）([#39](https://github.com/aiao-io/rxdb/pull/39))

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

## 0.0.24 / 0.0.25（补录）

CHANGELOG 自 0.0.26 起才真正开始维护，此前两个 release tag 没有留下条目（本文件在两个 tag 上均为空），以下按 tag 与提交记录补录可核实的事实。

### 0.0.24 (2026-08-11)

- 初始发布：tag `v0.0.24` 指向仓库 `init` 提交 `c47cf979`，可发布包以 0.0.24 起步。

### 0.0.25 (2026-08-14)

- 桥接版本（bridge）：`release.kind` 由 normal 改为 bridge，不升 system schema、不换 change codec，作用是为后续 migration 版本留一个可被 `bridge.tag` 引用的锚点（发布提交 `eb4d1a26`）。
- 新增 `@aiao/rxdb-adapter-desktop` 包。
- 优化 GitHub Actions、更新覆盖率；修复压缩产物 name 退化并接入桌面 adapter 加密契约套件；修复 tarball 消费者门禁从 registry 回落的问题；为 29 个可发布包补齐 `repository` 字段（tag 提交 `b31c7e2c`）。
