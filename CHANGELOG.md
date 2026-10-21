## Unreleased

### ⚠️ Breaking Changes

- **rxdb-adapter-sqlite-core / -pglite / -sqlite / -sqlite-wasm / -sqliteai / -wa-sqlite:** 推导物理表名、生成建表 / 读写 / 触发器 SQL 的公开函数多了必填的表集参数（`WorktreeTableSet`），如 `get_table_name_by_metadata(metadata, tableSet)`、`getTableNameByMetadata(metadata, tableSet)`、`create_tables_sql(adapter, tableSet, …)`，触发器生成选项的 `tableSet` 必填。可写检出位在同一个库里各有一套业务表，不说哪一套推出来的永远是主检出位那一套，挂在别的检出位上会静默读写错表。只有主检出位的代码补 `WorktreeTableSet.MAIN` 即可，物理名与之前逐字相同，库文件无需迁移。→ [table-set-parameter](https://rxdb.aiao.io/docs/migration/table-set-parameter)（US-314）
- **rxdb-adapter-sqlite-core:** 去掉 `switch_transaction_id`，改用 `generate_table_set_trigger_sql(adapter, tableSet, branchId, transactionId?)`：按表集重建变更触发器的唯一入口，表集与分支都显式给（US-314）
- **rxdb-adapter-sqlite-core:** `readCurrentBranchId(tx)` 改为 `readCurrentBranchId(tx, tableSet)`：挂在可写检出位上时读那套表持有的分支（US-314）
- **rxdb:** `TransactionExecutor` 多了必填的只读成员 `tableSet`：本事务落在哪一套业务表上（发起它的实例挂的那一套）。自己实现事务执行器的适配器要补上，取适配器的 `tableSet` 即可；两个内置适配器已带（US-314）

### 🚀 Features

- **rxdb:** 新增 `WorktreeTableSet`：一套业务表，`WorktreeTableSet.MAIN` 是主检出位那一套；两个适配器新增 `adapter.tableSet`（本实例挂的表集），sqlite-core 新增 `get_companion_table_name` / `get_storage_object_name`，PGlite 新增 `getSchemaName` / `getChangeTriggerFunctionName`。业务实体的物理名只从两个适配器的表名解析器出，`pnpm audit:table-name-resolver` 守着解析器之外不推物理名（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 分支持有模型：`rxdb_branch.activeKey` 除了主检出位的哨兵，还可以是可写检出位的持有键。新增 `WorktreeBranchHeldError`（码 `worktree_branch_held`）：`switchBranch()` 切到被可写检出位持有的分支时，两个适配器在切换事务里、动第一行之前拒绝；零 active 时点亮 `main` 与系统迁移回填哨兵同样先查，被占就拒。系统迁移只清旧哨兵，不再抹掉持有键（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 按表集建表与重建触发器：`WorktreeTableSet.holderKey` / `suffixOfHolderKey`（持有键由表集推出），两个适配器新增 `createWorktreeTableSet()` / `dropWorktreeTableSet()`；`remove_all_triggers_sql` 对影子表集只删成员的触发器；系统迁移给每一套现存的影子表集按持有分支重建触发器，认不出的持有键整条回滚（US-314）
- **rxdb-plugin-working-tree:** 可写检出位：`checkouts.add(branchId, { name?, owner? })` 一笔事务里登记、持有分支、建一套影子表并播种，`mount(id)` / `mountMain()` 让主实例挂上 / 挂回，`release(id)` 交出认领，`remove(id)` 删表、放开分支、删登记（未提交的改动留在分支上）。一条分支只能被一个检出位持有，被占时抛 `WorktreeBranchHeldError`。登记表 `Worktree` 加 `mode` / `tableSetSuffix` / `name` 三列、`dbName` 可空；`prune()` 与启动清理也回收会话归属的、持有的分支已不在的可写检出位，不需要配快照库（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 适配器可选槽位 `createWorktreeTableSet(executor, tableSet, seed)` / `dropWorktreeTableSet(executor, tableSet)`：在调用方的事务里建表并播种（主表集的行原样复制、自增序列对齐、叠上增量，都不记变更日志）、按目录删；新增 `WorktreeTableSetSeed`；`convertSwitchResultToSql` 的选项多了 `tableSet`；PGlite 新增 `getTableSetSchemaSuffix`（US-314）
- **rxdb / rxdb-plugin-working-tree / -history / -sync:** 当前分支贯穿捕获、历史与同步：工作树捕获、状态、提交按本实例挂的那套表持有的分支走，变更记在别的分支名下时整笔拒绝；挂在可写检出位上建分支，父分支是持有分支；重做栈失效只认记在本实例当前分支上的变更；挂在可写检出位上的实例不同步，九个同步入口一进门就抛，写业务表的同步事务里再核对一次，QueryCache 自动回推等挂回主检出位再跑（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite / rxdb-plugin-history:** 实例挂可写检出位：`rxdb.mountWorktreeTableSet()` 换挂一套表（核对持有、清实体缓存、重跑活查询），`rxdb.worktreeTableSet` / `worktreeTableSet$`；当前分支统一成挂的那套表持有的分支（`WorktreeTableSet.heldBranchWhere`），历史插件的撤销 / 重做跟着走；挂在可写检出位上不能真切分支（US-314）
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
- **rxdb:** `HistoryScopeAPI` 新增 `undoBarrier$` / `redoBarrier$`：撤销 / 重做栈停在子分支分叉点时给出原因（`{ reason: 'inherited_by_branch', branchIds }`），否则 `null`。自己实现 `HistoryScopeAPI` 的（如测试替身、没装历史插件时的兜底对象）要补上这两个成员（US-315）
- **rxdb-model / -angular / -react / -vue:** 实体列表的撤销 / 重做按钮因子分支分叉点停用时，`title` 说明是哪条分支继承了下一步；文案在 `describeHistoryBarrier()`（US-315）

### 🩹 Fixes

- **rxdb-adapter-sqlite-core / -pglite:** 撤销 / 重做、重做栈失效与拉取回填不再写分支表。此前它们每次都对当前分支跑一遍「熄灭 + 点亮」：撤销 / 重做派出一条「activated 翻转了」的 RxDBBranch 更新事件，PGlite 上每批拉取再经 NOTIFY 派一条谁都没做过的更新。现在只重挂触发器（US-314）
- **rxdb-adapter-sqlite-core / -pglite:** 关掉变更日志的实体（`log: false`：分支表、迁移与同步水位、插件系统表、`StorageFileMeta` 等）删行之后，活查询立刻不再有它。此前这些表的删除派不出事件：分支表与迁移表只有行号通知，删除时按行号回查不到行，其余的表连通知都没有。三端 demo 删掉一条分支，分支列表照旧列着它。现在批量写入与单删两条删行路径删完就直接派删除事件；行号回查不再处理这些表的删除，它只会撞上缓存里的旧实体或复用行号的新行，派出过期的删除。变更日志表本身不在其列（US-222）
- **rxdb-plugin-history:** 父分支上已被子分支继承的变更（不晚于子分支分叉点的）不能再撤销 / 重做。此前父分支撤销了子分支分叉时继承、子分支随后又改过的变更，切到子分支再切回来，父分支读到撤销之前的值且不报错，对比与合并预览跟着失真。撤销栈现在停在分叉点，`undo()` / `redo()` 撤到那一步什么也不做；写事务里再按事务内读到的子分支复核一次。删掉继承它们的子分支之后限制解除（US-315）
- **rxdb:** 多对多解绑后保存，中间行留在根实体的待删集合里；切走再切回来那一行被切换插回，下一次哪怕只改一个标量的 `save()` 都会把它再删一遍。两端都不记日志（`log: false`）时，生成的中间表也不再记日志（US-313）
- **rxdb:** 只读实例与可写实例共用一个实体类时（核心系统实体每个实例都登记），`RxDBBranch.find()` 这类静态调用落到可写的那个，不再报多实例；两个可写实例共用一个类照旧报错（US-313）
- **rxdb-adapter-pglite:** 断开时关掉 IdbFs 留着的 IndexedDB 连接，此前之后的 `deleteDatabase` 会一直卡在 `blocked`（US-313）
- **rxdb-adapter-sqlite-wasm:** 断开与初始化失败时关掉打开库的 VFS，IndexedDB 系 VFS 的连接此前一直留着（US-313）
- **rxdb-adapter-sqlite-wasm / -wa-sqlite:** OPFS 库整页刷新后偶发打不开（上一个页面的 Worker 还占着库文件的同步访问句柄，应用起不来也不报错）：打开失败为 `SQLITE_CANTOPEN`、或新建 VFS 时删旧临时目录撞上没关的句柄（`NoModificationAllowedError`）时有界退避重试（合计约 3 秒），每次重试前交出失败那次留下的句柄与临时目录，用尽后仍被占用就报占用。sqlite-wasm 的 `opfs` 档与 wa-sqlite 的 `OPFSCoopSyncVFS` 是同一个 VFS，一并覆盖；wa-sqlite 的其余 VFS 不重试。自己实现 `WaSqliteClientRuntime` 的要补上必选的 `open()`（US-221）
- **rxdb-adapter-miniprogram:** 往库里写大量数据（大 BLOB、批量导入）时，库文件缓冲每追加一页就整块重新分配、把整库拷一遍，耗时随库大小平方增长。改为换缓冲时多留余量（至少 1 MiB、至多当前大小的 1/8），追加写的拷贝量随库大小线性增长；支付宝探针的 dist 冒烟写满 50 MiB 从约一分钟降到约两秒（US-209）
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
