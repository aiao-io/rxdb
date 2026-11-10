## Unreleased

### ⚠️ Breaking Changes

- **rxdb-adapter-supabase:** 直写事务的 UPDATE 与级联删除日志修复需要配套参考 SQL：先在同一数据库事务中按 02 → 04 更新 `docker/sql/02-rxdb-sync-functions.sql`、`docker/sql/04-rxdb-utils-functions.sql` 并一起提交，再升级客户端；本次不改 `01-rxdb-system-tables.sql`。不能原子更新时须在维护窗口禁止写入，避免新触发器与旧 RPC 的中间状态。推送与原 `rxdb_batch_update` 继续使用无 RETURNING 的计数模式，保留原有权限与可见性语义。→ [supabase-update-push](https://rxdb.aiao.io/docs/migration/supabase-update-push)（US-223 / US-224）

- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 系统表结构升至 8，`RxDBChange` 新增可空的 `tableSetSuffix`，固定变更写入时的表集来源，避免迟到事件污染其他检出位。旧库自动补列并重建触发器；升级后旧客户端会拒绝打开该库，需一起升级。

- **rxdb-adapter-sqlite-core / -pglite / -sqlite / -sqlite-wasm / -sqliteai / -wa-sqlite:** 推导物理表名、生成建表 / 读写 / 触发器 SQL 的公开函数多了必填的表集参数（`WorktreeTableSet`），如 `get_table_name_by_metadata(metadata, tableSet)`、`getTableNameByMetadata(metadata, tableSet)`、`create_tables_sql(adapter, tableSet, …)`，触发器生成选项的 `tableSet` 必填。可写检出位在同一个库里各有一套业务表，不说哪一套推出来的永远是主检出位那一套，挂在别的检出位上会静默读写错表。只有主检出位的代码补 `WorktreeTableSet.MAIN` 即可，物理名与之前逐字相同，库文件无需迁移。→ [table-set-parameter](https://rxdb.aiao.io/docs/migration/table-set-parameter)（US-314）
- **rxdb-adapter-sqlite-core:** 去掉 `switch_transaction_id`，改用 `generate_table_set_trigger_sql(adapter, tableSet, branchId, transactionId?)`：按表集重建变更触发器的唯一入口，表集与分支都显式给（US-314）
- **rxdb-adapter-sqlite-core:** `readCurrentBranchId(tx)` 改为 `readCurrentBranchId(tx, tableSet)`：挂在可写检出位上时读那套表持有的分支（US-314）
- **rxdb:** `TransactionExecutor` 多了必填的只读成员 `tableSet`：本事务落在哪一套业务表上（发起它的实例挂的那一套）。自己实现事务执行器的适配器要补上，取适配器的 `tableSet` 即可；两个内置适配器已带（US-314）
- **rxdb-plugin-search:** `FtsInstallPlan` 的 `namespace` 换成 `schema`（PostgreSQL 里表所在的 schema），由新的 `SearchBackend.bindPlan(plan, metadata, tableSet)` 经适配器的表名解析器填；`SearchBackend` 还多了 `installForTableSet()`。自己构造计划、直接调 `createPgTsvectorBackend().install()` 的，先 `bindPlan(plan, metadata, WorktreeTableSet.MAIN)`，否则表不按 schema 限定（US-314）
- **rxdb:** `UpdateDataCache.getSerializedBefore(id, inversePatch)` 去掉第二参，改为 `getSerializedBefore(id)`：同批同 id 的多条 UPDATE 在构造时已合成一条，前态按 id 缓存、只算一份，另给的旧值只会拿到先算出来的那份。删掉第二个实参即可（US-032）
- **rxdb:** `HistoryScopeAPI` 多了两个必填成员 `undoBarrier$` / `redoBarrier$`：撤销 / 重做栈停在子分支分叉点时给出原因（`{ reason: 'inherited_by_branch', branchIds }`），否则 `null`。自己实现 `HistoryScopeAPI` 的（如测试替身、没装历史插件时的兜底对象）要补上这两个成员，没有分支的实现发一个 `null` 即可（US-315）

- **rxdb:** 实体注册期新增 `reservedName` 规则（`MetadataValidationRule` 多了 `'reservedName'`）：属性名、关系名或 `columnName` 为 `__proto__` 时 `init()` 报错（此前写入时静默丢列）。实体命名空间、public 实体名占用 RxDB 实例自身成员（`destroy`、`context`、`schemaManager` 等原型方法 / 访问器 / 构造期字段，或实例上同名的函数 / 原始值）时同样在注册期报错，不再覆盖实例方法或污染共享原型；插件按约定挂在实例上的服务对象（如 `rxdb.storage`）仍可作为同名命名空间的容器。
- **rxdb:** 子类重声明字段不再误删父类显式声明、与字段同名的实体级 CHECK。此前按旧元数据建过子类表的库，升级后 `connect()` 会报约束漂移，需要写迁移补上这条约束。
- **rxdb-plugin-sync:** 本地回执提交失败而远端已应用过条目时，`pushRepository` / `syncRepository` 改抛 `RxDBPartialSyncError`（`cause` 是原错误，`result.pushed` 是远端已应用的条数），不再记 0 并抛裸错误。
- **rxdb-adapter-wa-sqlite:** 拒绝会折叠到别的 VFS 文件的库名（字面 `%20` 这类转义、`?`、`#`、`\`、制表 / 换行、开头空白、`.` 段、像 scheme 的前缀）：此前这些库名能打开，却与别的名字共用同一个物理文件。`%20` 一类可改用解码后的名字打开原数据，`?`、`#` 一类需手工迁移。
- **rxdb-adapter-wa-sqlite / -sqlite-wasm:** 含 NUL 的字符串绑定参数改为报错，此前在 NUL 处静默截断、写成另一个值。
- **rxdb:** `RxDBBackupCompatibility` 多了必填的 `constraintFingerprint`。自己实现备份恢复的适配器要补上，取 `getRxDBBackupConstraintFingerprint(rxdb)` 即可；内置适配器都已补。
- **rxdb-adapter-pglite / -supabase:** QueryCache 与同步的实体标识统一为「裸名即 public」，与 sqlite-core 和 `queryCacheEntityIdentifier` 一致。PGlite 的 `getMetadataByIds` / `upsertMany` / `deleteByIds`，以及 Supabase 的 `fetchMetadata` / `findByIds` / `pullChanges` / `getChangeCount` / `pullChangesBatch`，收到裸名时只在 `public` 命名空间里找，不再在全部命名空间里找唯一匹配。直调这些方法、用裸名指只配在非 public 命名空间下的实体（如 `'Item'` 指 `shop:Item`、`'RxDBBranch'`）的，此前能解析，现在抛 `RxdbAdapterPGliteError` / `SupabaseConfigError`；改写成 `namespace:entity`（`'shop:Item'`、`'rxdb:RxDBBranch'`）即可。`PullBatchRequest` 省略 `namespace` 时同样按 public 解析。经 QueryCache 仓储和同步插件发起的调用不受影响。
- **rxdb / rxdb-adapter-pglite / rxdb-adapter-sqlite-core:** `bigint` 区间维 + `bounds: '[]'` 的区间排他，上端点等于 int8 最大值（`9223372036854775807n`）时，PG 表达式改为按上方无界构造。此前这样的合法行在 PGlite 上，没有任何竞争行也写不进去（规范化时上界加一，抛 `22003 bigint out of range`）。表达式参与约束名的哈希，所以**含这类区间维的排他换了名**：PGlite 的 `EXCLUDE` 约束和 SQLite family 的 `_i` / `_u` 两个触发器都按新名查找。已有的库（包括从旧归档恢复出来的）在 `connect()` 时抛 `RxDBConstraintDriftError`，`extra` 里是旧名，`missing` 里是新名，需要在 `migrations` 里删掉旧的、按新名重建（步骤与两个后端的示例见文档「存储约束」的「升级：`bigint` `'[]'` 区间维的排他换名」一节）。其余排他（`date`、`integer`、`bigint` 的 `'[)'` 维）名字不变。PGlite 的冲突键里，「上端点 = 最大值」和上方无界显示成一样，违约时 `ranges` 这一端报 `null`；SQLite 报原值，两者是同一组取值。

### 🚀 Features

- **rxdb:** `QueryTaskOptions` 新增可选 `onError(cacheKey, task)`，`onClean` 多了第二参数 `task`（按任务身份摘除缓存项；只收一个参数的旧回调仍可赋值）。
- **rxdb:** `EntityStatus` 新增 `writeMark()` / `applyWriteResult()`：写入开始时记下提交的值与编辑序号，成功后只把基线推进到提交值，提交之后才改的字段保留为未保存改动。
- **utils:** `PersistedStateRegistry` 新增 `find(namespace, name)`：只查已登记的状态入口，不读盘、不登记、不做类型标签校验，没登记过时返回 `undefined`。
- **rxdb / rxdb-adapter-sqlite-core / -pglite / -electron:** 备份清单新增可选的 `constraintFingerprint`（实体级 CHECK、条件唯一索引、区间排他的约束名指纹），恢复前与目标比对，只差这些约束的归档在写目标之前就以 `incompatible_archive` 拒绝，不再恢复出缺约束的库。旧归档没有这一项，照常恢复；旧版本读到新归档会忽略这个键，格式版本不变。新增 `getRxDBBackupConstraintFingerprint(rxdb)`。
- **rxdb-adapter-electron:** `@aiao/rxdb-adapter-electron/host` 转出 `isDesktopHostTemporaryName`（宿主未提交写入的临时产物判据：点 + UUID + `.rxdb-tmp`），宿主应用的启动清扫按它识别遗留产物。
- **三端 demo:** Worktree 下拉、新建、改名、删除确认与分支右键检出；分支可选，失败可重试，换挂重读 Changes / History，写入期间禁止换挂，支持键盘与明暗主题（US-314 C2.2）

- **rxdb:** 新增 `WorktreeTableSet`：一套业务表，`WorktreeTableSet.MAIN` 是主检出位那一套；两个适配器新增 `adapter.tableSet`（本实例挂的表集），sqlite-core 新增 `get_storage_object_name`，PGlite 新增 `getSchemaName` / `getChangeTriggerFunctionName`。业务实体的物理名只从两个适配器的表名解析器出，`pnpm audit:table-name-resolver` 守着解析器之外不推物理名（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 分支持有模型：`rxdb_branch.activeKey` 除了主检出位的哨兵，还可以是可写检出位的持有键。新增 `WorktreeBranchHeldError`（码 `worktree_branch_held`）：`switchBranch()` 切到被可写检出位持有的分支时，两个适配器在切换事务里、动第一行之前拒绝；零 active 时点亮 `main` 与系统迁移回填哨兵同样先查，被占就拒。系统迁移只清旧哨兵，不再抹掉持有键（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 按表集建表与重建触发器：`WorktreeTableSet.holderKey` / `suffixOfHolderKey`（持有键由表集推出），两个适配器新增 `createWorktreeTableSet()` / `dropWorktreeTableSet()`；`remove_all_triggers_sql` 对影子表集只删成员的触发器；系统迁移给每一套现存的影子表集按持有分支重建触发器，认不出的持有键整条回滚（US-314）
- **rxdb-plugin-working-tree:** 可写检出位：`checkouts.add(branchId, { name?, owner? })` 一笔事务里登记、持有分支、建一套影子表并播种，`mount(id)` / `mountMain()` 让主实例挂上 / 挂回，`release(id)` 交出认领，`remove(id)` 删表、放开分支、删登记（未提交的改动留在分支上）。一条分支只能被一个检出位持有，被占时抛 `WorktreeBranchHeldError`。登记表 `Worktree` 加 `mode` / `tableSetSuffix` / `name` 三列、`dbName` 可空；`prune()` 与启动清理也回收会话归属的、持有的分支已不在的可写检出位，不需要配快照库（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 适配器可选槽位 `createWorktreeTableSet(executor, tableSet, seed)` / `dropWorktreeTableSet(executor, tableSet)`：在调用方的事务里建表并播种（主表集的行原样复制、自增序列对齐、叠上增量，都不记变更日志）、按目录删；新增 `WorktreeTableSetSeed`；`convertSwitchResultToSql` 的选项多了 `tableSet`；PGlite 新增 `getTableSetSchemaSuffix`（US-314）
- **rxdb / rxdb-plugin-working-tree / -history / -sync:** 当前分支贯穿捕获、历史与同步：工作树捕获、状态、提交按本实例挂的那套表持有的分支走，变更记在别的分支名下时整笔拒绝；挂在可写检出位上建分支，父分支是持有分支；重做栈失效只认记在本实例当前分支上的变更；挂在可写检出位上的实例不同步，九个同步入口一进门就抛，写业务表的同步事务里再核对一次，QueryCache 自动回推等挂回主检出位再跑（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite / rxdb-plugin-history:** 实例挂可写检出位：`rxdb.mountWorktreeTableSet()` 换挂一套表（核对持有、清实体缓存、重跑活查询），`rxdb.worktreeTableSet` / `worktreeTableSet$`；当前分支统一成挂的那套表持有的分支（`WorktreeTableSet.heldBranchWhere`），历史插件的撤销 / 重做跟着走；挂在可写检出位上不能真切分支（US-314）
- **rxdb-adapter-sqlite-core / -pglite / rxdb-plugin-history / -working-tree:** 可写检出位里切分支：`switchBranch()` 放开原来持有的分支、持有目标分支，这套表按增量改过去，改动留在原分支，登记行的分支跟着走；目标被主检出位或别的检出位持有时抛 `WorktreeBranchHeldError`，本地只有元数据的远端分支报 `branch_not_materialized`。激活版本号按表集：每个可写检出位一行，检出位里切分支不再让主检出位手上的提交凭据失效（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite / rxdb-plugin-search:** 实体事件按表集路由：本地实体事件多了可选的 `tableSetSuffix`（写在可写检出位影子表上的带那套表的后缀，主表集上的不带、形状不变），`WorktreeTableSet#accepts()` / `ownerSuffixOf()` / `eventTagOf()`；查询管理器的增量合并与搜索插件只收本实例挂着那套表读得到的事件，多个标签页可以一个挂主检出位、一个挂可写检出位。`worktreeTableSet$` 改在清空实体缓存之后才发（US-314）
- **rxdb-plugin-workspace:** 草稿缓存按检出位分区：挂在可写检出位上新建的草稿只在这个检出位上看得到（IndexedDB 键前面加表集后缀，主检出位的键不变、不用迁移），`list()` / `discard()` / 跨标签页同步只看本实例此刻挂的那一套；换挂时先把排队的写落盘、再换成新挂那一套的草稿（US-314）
- **rxdb:** 换挂之后旧的实体对象写不进另一套表：`EntityStatus.tableSet` 记下建出、读出实体时挂的那套表，公开写入口发出写之前核对，不符抛 `WorktreeTableSetMismatchError`（US-314）
- **rxdb / rxdb-plugin-working-tree:** 插件的建表集钩子 `IRxDBPlugin.worktreeTableSet?.created(executor, tableSet)`（`WorktreeTableSetHooks`）与 `rxdb.notifyWorktreeTableSetCreated()`：`checkouts.add()` 建完表、播完种之后在同一笔事务里按 `use()` 的顺序调，抛错整笔回滚，插件借它给每套影子表建自己的附属对象（US-314）
- **rxdb-plugin-working-tree-angular / -react / -vue:** `useWorktrees()` 接上可写检出位：`add()` / `mount()` / `mountMain()` / `release()` / `remove()` / `rename()` 与各自一格状态（共十格），以及 `mounted`（本实例此刻挂的那套表，取自 `worktreeTableSet$`）；三端同名同 API。工作树插件新增 `readMountedWorktreeTableSet()`，`./testing` 新增 `createWorktreeHookStubs()`（US-314）
- **rxdb / rxdb-plugin-working-tree / rxdb-plugin-search:** 可写检出位按指纹自动重建：开检出位时记下这套表的指纹（`rxdb.worktreeTableSetFingerprint(tableSet)`：成员实体的结构指纹 `WorktreeTableSet.schemaFingerprintOf()`，在备份清单的键之外还看 `checks` / `exclusions` / `log`，并上插件钩子的 `WorktreeTableSetHooks.fingerprint(tableSet)`）。`checkouts.mount()` 发现不符就在挂载的那笔事务里整套重建、重跑插件的建表集钩子，未提交的改动随播种回来；失败整笔回滚，抛 `WorktreeUnavailableError`（`schema_rebuild_failed`，带 `cause`），检出位原样。可写检出位挂载不再报 `schema_mismatch`（US-314）
- **rxdb / rxdb-adapter-sqlite-core / -pglite / rxdb-plugin-working-tree:** 孤儿表集回收：适配器可选槽位 `listWorktreeTableSetSuffixes(executor)` 按目录列出现存的表集（配置里实体的主表恰好长成后缀形状时不算），`WorktreeTableSet.isSuffix()`；`checkouts.prune()` 与启动清理回收没有登记行的表集、持有键与激活态行，`prune()` 交回它们的表集后缀（US-314）
- **rxdb-plugin-search / rxdb-adapter-pglite:** 全文检索按表集：可写检出位的影子表各有一份全文索引，开检出位时在同一笔事务里建好并回填，删检出位时一起删；查询按实例此刻挂着的那套表走，换挂之后已有的 `SearchHandle` 自动重查，挂上一套还没有索引的表时头一次搜先补建。PGlite 的 `./fts` 子路径新增 `getSchemaName`（US-314）
- **rxdb-plugin-working-tree:** `checkouts.rename(id, name)` 给可写检出位改名（`invalid_name` / `name_taken` / `not_found`）；`add()` 同样校验名字，没给名字时取分支 id、被占了加 `-2`、`-3`；登记表 `name` 加唯一索引。`WorktreeUnavailableError` 的文案改为「检出位操作被拒（reason）」（US-314）
- **rxdb-plugin-history:** 挂在可写检出位上合并：合进它持有的分支、落在那套影子表里，只合进得了这套表的实体（QueryCache 同步的这类只在主检出位那套表里的实体不合），`previewMerge()` 同一口径；挂在可写检出位上可推送计数为 0（US-314）
- **rxdb:** `getCurrentBranch(rxdb, tableSet?)` 与 `findCurrentSyncRecord(…, tableSet?)` 多了可选的表集参数：读哪一套表持有的分支，缺省是本实例挂的那套（US-314）
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
- **rxdb-model / -angular / -react / -vue:** 实体列表的撤销 / 重做按钮因子分支分叉点停用时，`title` 说明是哪条分支继承了下一步；文案在 `describeHistoryBarrier()`（US-315）
- **rxdb-react:** 新增 `useHasRxDBProvider()`（`makeRxDBProvider()` 返回的每一套也带一份）：只回答组件树里有没有同一套 context 的 Provider，与数据库是否就绪、是否创建失败无关；配合 `useRxDBOptional()` 区分「没有 Provider」与「有 Provider 但还在解析」。只加在 React 端：Vue 已有 `injectRxDBRef(true)`，Angular 注入时库已就绪（RV-084）
- **rxdb-adapter-http:** 实验性 `changeFeed` 新增诊断回调 `onOpen`（新导出 `HttpChangeFeedOpenHook` / `HttpChangeFeedOpenReport`）：每次接通（首次连接与每一次重连）报一次，排在该次接通的全量失效之后；与 `onUnavailable` 同一口径，同步调用、抛错丢弃、不影响通道。两者合起来才答得了「此刻通没通」，`changeFeedEnabled` 仍只是启停意图。

### 🩹 Fixes

- **rxdb-adapter-supabase:** `mutations()` 的修改改走普通 UPDATE，修复 owner 型与共享编辑型 RLS 下被 INSERT 策略误拒的问题；批量直写仍按序列化整实体更新，不引入逐列脏追踪，`createdBy` 保持不变。`mutations()` 返回服务器实际写入的行，供调用方读取 `updatedAt` 等字段；推送保留原计数模式。本次不改变普通单实体 `save()` 的 PostgREST UPDATE 路径，也不将批量 RPC 返回值自动合并到 `save()` 的原实体。被拒与目标已删除分别报 `42501` / `RX001`，直写失败整批回滚（US-223）
- **rxdb-adapter-supabase:** 推送父行删除时，触发器捕获实际级联删除，RPC 在源日志之后统一写入完整隐式 DELETE，所有客户端（包括推送端）均可拉取；同批 INSERT / UPDATE 子行后删除父行，拉取不再因日志顺序把子行复活。显式删除保留原映射并去重（与实际删除按 id 列类型的等值关系配对、按分区根表归并：uuid 大小写、`numeric` 的 `1` 与 `1.00`、分区表都只记一条），最终回执按实际删除结果修正，最后一条显式 DELETE 的快照取实际删除的 `OLD`。日志沿用触发器模式现有的读取边界，业务表 RLS 不提供日志的逐行授权隔离（US-224）
- **rxdb / rxdb-plugin-tree:** 修复跨 Tab 增量 UPDATE 在冷缓存或残缺缓存下让 count / find 系与树查询静默过期：补丁改了查询读取的列（树查询含父列）而缓存补不齐、或缓存比事件新时回 SQL，只改无关列的补丁不再多打查询；同批同 id 的多条 UPDATE 合并判定、每条补丁都落到缓存，脏实体按已持久化的值判定，增量合并不再混入同批的其他实体类型；findAll 新匹配结果不再缺少未改的持久列；JSON 路径的 `= null` 与 SQL 的 `IS NULL` 一致；增量判定走到认不出的 where 条件（如大写组合子 `'AND'`）时报带原文的 `RxDBError`，不再是指不到条件的 `TypeError`（US-032）。

- **rxdb / rxdb-adapter-pglite / -sqlite-core:** 公开仓库写入在 COMMIT 失败时恢复实体状态、变更基线与身份缓存，并保留等待期间的本地编辑，修复延迟外键失败后重试漏写。
- **rxdb-plugin-history / rxdb-adapter-pglite / -sqlite-core:** 切分支在事务内生成 SQL，并拒绝计算增量或排队期间已改变表集、当前分支的旧计划，防止切换可写检出位时误改主检出位。
- **rxdb / rxdb-plugin-working-tree:** `destroy()` 先停止检出位命令，等适配器退出在飞事务后释放全部可写检出位认领锁；普通断连继续保留认领。

- **rxdb / rxdb-adapter-pglite / rxdb-adapter-sqlite-core:** 公开仓库的 SQL 生成、表集校验和实体回填共用事务，换挂排队期间的单条写入拒绝旧实体，查询只读取并回填当前表集。断连等待连接关闭后再复位挂载，并清掉事务收尾期间回填的实体，避免影子事务改写主表。

- **Angular demo:** 文件管理页销毁时取消全部延时滚动任务，并拒收销毁后到达的请求，避免回调在页面卸载后访问 document。

- **rxdb-adapter-sqlite-core / -wa-sqlite / -sqlite-wasm:** SharedWorker 传输下多个标签页共用 worker 里那一个客户端：事务按库名在一把跨标签页的 Web Lock 里排队，不再落进别的标签页开着的事务（此前另一个标签页的 `BEGIN` 当场报「事务里不能再开事务」，普通语句随别人的事务一起提交或回滚）；拿到锁先回滚死在事务中间的标签页留下的事务；一个标签页断开只交还自己那一份、只摘自己的监听，不再把别的标签页还在用的连接关掉，最后一个断开时才关库、之后还能再连。客户端新增 `release(owner)` / `rollbackOrphanTransaction()`，`init()` 与 `addEventListener()` 多了可选的持有者键；SharedWorker 传输需要 Web Locks（US-314）
- **rxdb-plugin-history:** 被可写检出位持有的分支删不掉：`removeBranch()` 抛 `WorktreeBranchHeldError`，合并带 `deleteSource` 遇到被持有的源分支时合并照常、源分支留着。此前持有分支的 `activated` 为假、照删不误，检出位里没提交的改动跟着一起没了（US-314）
- **rxdb-adapter-sqlite-core / rxdb-plugin-sync:** 挂在可写检出位上时，QueryCache 的回填不再记进变更日志，出站队列也按主检出位的分支取待推行。此前回填摘的是检出位那套表的触发器、照样记进主分支的日志，挂回主检出位后被当成离线写推回远端；待推集合读成检出位的分支、是空的，对账会删掉离线新建的行（US-314）
- **rxdb-adapter-pglite:** QueryCache 的回填与删除不再记进变更日志（主检出位上同样如此），写入期间摘掉触发器，提交之后补刷实体缓存、补发实体事件，与 sqlite-core 同口径；此前每次回填都会被出站队列当成离线写推回远端（US-314）
- **rxdb-adapter-pglite:** 开可写检出位时增量带来比主表序列大的整数 id，影子表的序列推到它们之上，检出位里之后的插入不再撞主键（US-314）
- **rxdb-plugin-graph:** 边表按边实体自己的元数据解析，节点与边只有一个进可写检出位的影子表时图查询直接拒绝；边实体随节点继承 `log: false`，与多对多中间表同一条规则（US-314）
- **rxdb-adapter-sqlite-core / -pglite:** 撤销 / 重做、重做栈失效与拉取回填不再写分支表。此前它们每次都对当前分支跑一遍「熄灭 + 点亮」：撤销 / 重做派出一条「activated 翻转了」的 RxDBBranch 更新事件，PGlite 上每批拉取再经 NOTIFY 派一条谁都没做过的更新。现在只重挂触发器（US-314）
- **rxdb-adapter-sqlite-core / -pglite:** 关掉变更日志的实体（`log: false`：分支表、迁移与同步水位、插件系统表、`StorageFileMeta` 等）删行之后，活查询立刻不再有它。此前这些表的删除派不出事件：分支表与迁移表只有行号通知，删除时按行号回查不到行，其余的表连通知都没有。三端 demo 删掉一条分支，分支列表照旧列着它。现在批量写入与单删两条删行路径删完就直接派删除事件；行号回查不再处理这些表的删除，它只会撞上缓存里的旧实体或复用行号的新行，派出过期的删除。变更日志表本身不在其列（US-222）
- **rxdb-plugin-history:** 父分支上已被子分支继承的变更（不晚于子分支分叉点的）不能再撤销 / 重做。此前父分支撤销了子分支分叉时继承、子分支随后又改过的变更，切到子分支再切回来，父分支读到撤销之前的值且不报错，对比与合并预览跟着失真。撤销栈现在停在分叉点，`undo()` / `redo()` 撤到那一步什么也不做；写事务里再按事务内读到的子分支复核一次。删掉继承它们的子分支之后限制解除（US-315）
- **rxdb:** 多对多解绑后保存，中间行留在根实体的待删集合里；切走再切回来那一行被切换插回，下一次哪怕只改一个标量的 `save()` 都会把它再删一遍。两端都不记日志（`log: false`）时，生成的中间表也不再记日志（US-313）
- **rxdb:** 只读实例与可写实例共用一个实体类时（核心系统实体每个实例都登记），`RxDBBranch.find()` 这类静态调用落到可写的那个，不再报多实例；两个可写实例共用一个类照旧报错（US-313）
- **rxdb-adapter-pglite:** 断开时关掉 IdbFs 留着的 IndexedDB 连接，此前之后的 `deleteDatabase` 会一直卡在 `blocked`（US-313）
- **rxdb-adapter-sqlite-wasm:** 断开与初始化失败时关掉打开库的 VFS，IndexedDB 系 VFS 的连接此前一直留着（US-313）
- **rxdb-adapter-sqlite-wasm / -wa-sqlite:** OPFS 库整页刷新后偶发打不开（上一个页面的 Worker 还占着库文件的同步访问句柄，应用起不来也不报错）：打开失败为 `SQLITE_CANTOPEN`、或新建 VFS 时删旧临时目录撞上没关的句柄（`NoModificationAllowedError`）时有界退避重试（合计约 3 秒），每次重试前交出失败那次留下的句柄与临时目录，用尽后仍被占用就报占用。sqlite-wasm 的 `opfs` 档与 wa-sqlite 的 `OPFSCoopSyncVFS` 是同一个 VFS，一并覆盖；wa-sqlite 的其余 VFS 不重试。自己实现 `WaSqliteClientRuntime` 的要补上必选的 `open()`（US-221）
- **rxdb-model:** 实体表格接键盘焦点的隐藏输入框补上可读名，此前 axe 判 `label`（critical），读屏只念「编辑框，只读」（US-313）
- **rxdb-plugin-workspace:** 草稿缓存不再收系统表与关闭变更日志（`log: false`）实体的草稿。此前系统表名单只认核心四张表，插件登记的系统表（如工作树插件的提交表）与 storage 插件的 `StorageFileMeta` 每次构造都留下一条永远清不掉的草稿：它们出现在 `list()` / `cacheCount` 里、广播给其他标签页、每次启动被恢复。`install()` 会删掉 IndexedDB 里已有的这类草稿（US-311）

- **rxdb:** `disconnectAll()` / `destroy()` 遇到在途的适配器工厂失败时不再跳过整个拆卸：先等全部工厂结算，断开已建好的适配器、释放插件作用域，全部走完再抛出首个错误。此前一个工厂拒绝，其余适配器一个都没断开，`destroy()` 已置终态也补不回来。
- **rxdb-adapter-sqlite-core（及 -sqlite / -sqlite-wasm / -sqliteai / -wa-sqlite / -miniprogram / -electron / -tauri）:** 没有外键的实体上声明的 `*Id` 属性（如加密的 `secretId`）按声明类型转换并加密，不再按 `Id` 后缀猜成外键原样写入。此前这类加密列写入后解密回填失败、整笔回滚，合法属性存不进去；未声明的 `*Id` 键与其他未声明键一样忽略。
- **rxdb-adapter-sqlite-wasm:** 只传 `sharedWorkerInstance`、不写 `sharedWorker: true` 时同样进跨标签页事务锁，断开只交还本标签页那一份。此前事务不排队，断开时还会关掉其他标签页正在用的共用连接。
- **rxdb-adapter-http:** 浏览器里同源相对 `baseUrl` 可以配 `changeFeed`：普通请求与 SSE 走同一个地址出口，按文档基准地址补成绝对地址（此前构造期就抛 `HttpConfigError`）。条件读的 single-flight 只在同一代次内合流：`create` / `update` / `delete` 结算（成败都算）或变更通知上报失效之后发起的读，不再并进写之前的在飞请求、刚写完读回旧值。
- **rxdb-adapter-supabase:** `exists` 子查询里的 OR（及 `notBetween`）改在关系作用域内表达（`<嵌入路径>.or=(…)`），不再拆成 AND 静默漏行；两层 `exists` 的嵌入按当前层实体解析关系名，此前第二层进不了 select、整个查询被 PostgREST 拒绝；同一层几条 `exists` / `notExists` 指向同一关系时各用独立的嵌入别名，「有一笔满足 A 的、也有一笔满足 B 的」不再被并成「同一笔同时满足 A 与 B」。
- **rxdb-adapter-supabase:** 不指定 `entityId` 的 `findAncestors` 返回全部根节点（翻页取全、按主键升序，开 `hasChildren` 特性时带 `hasChildren`；起点不过 `where`、不受 `level` 限制），全树 `countAncestors` 为根节点数，只在指定 `entityId` 时扣掉当前节点，与 sqlite-core / PGlite 及树插件的实时 merge 同口径。此前全树 `findAncestors` 恒为 `[]`、`countAncestors` 恒为 0，同一个活查询首查为空、增量合并后又冒出新根（RV-084）
- **rxdb-adapter-tauri:** JSON 编解码把 `__proto__` 等数据键作为自有属性往返，不再丢键、也不再把结果对象的原型换成载荷。
- **rxdb-adapter-pglite:** `changeErrors$` 随适配器实例存活：`disconnect()` 不再完成它，同一实例重连后的变更管线失败照常送达（此前重新订阅时它已经完成）。
- **rxdb-plugin-graph:** 节点物理表名含双引号时，`findNeighbors` / `countNeighbors` / `findPaths`（含节点回填）正确转义，不再报 SQL 语法错误。
- **rxdb-plugin-graph:** 图实体把主键 `columnName` 改成别的物理列（如 `pk_id`）时，`findNeighbors` / `countNeighbors` / `findPaths` 不再因写死 `id` 报 `no such column: id`：锚点、JOIN、排序与路径节点回填改按实体的主键物理列引用，返回的节点记录以属性名为键，门面查询按 `id` 认回同一个实体（RV-084）
- **rxdb-plugin-tree:** 实时树查询的起点（全树查询的各根、指定 `entityId` 时的目标）与 SQL 同口径不过 `where`：新建或删除不匹配 `where` 的起点时列表与计数即时更新，`findAncestors` 全树收得到新根，目标新建而祖先链在本地拼不全时回 SQL；全树且带 `where` / `level` 时，节点改父跨进或跨出根层回 SQL；带 `level` 的 `findDescendants` 里结果中的节点改父也回 SQL（此前上移漏补被 `level` 截掉的子孙、下移漏删越界的子孙）。
- **rxdb-plugin-history:** 挂在可写检出位上时，`compareBranches()` 只对比这套表的成员，与 `previewMerge()` / `mergeBranch()` 用同一份判定。此前它照样列出不进影子表集的实体（QueryCache 同步的这类只在主检出位那套表里的实体），而检出位里切分支不动它们，对比结果与切过去读到的对不上（US-312）
- **rxdb-plugin-querycache:** 同一行在线写的回执反序到达时按发出顺序落缓存：迟到的更新回执不再把已删除（含离线删除）的缓存行写回来，两次更新的回执反序也不再让旧值覆盖新值。`QueryCacheEngine`（experimental）新增 `supersedeInflightWrites(ids)`。
- **rxdb-plugin-sync / -querycache:** 非 `public` 命名空间的离线写重放与缓存修复按 `namespace:entity` 定位，不再打到同名的公共实体、也不再在错误目标上推进水位；标识函数 `queryCacheEntityIdentifier` 由 sync 新导出，querycache 的在线读写复用同一个。
- **rxdb-plugin-storage:** 远端拉取在本地写流打不开时先取消未消费的响应体、再抛原始错误，不留后台下载；复制式目录重命名删源目录半途失败时，先用目标里的完整副本补齐源目录、确认无误再撤回，补不齐时保留全部副本并抛出点名路径的 `AggregateError`，不再删掉唯一的完整副本。
- **rxdb-plugin-workspace:** 换挂恢复窗口里，新挂那套表上同 UUID 的新草稿（含跨标签页收到的）不再顶掉旧分区还没落盘的草稿：待写队列按带分区的完整键记账。
- **rxdb-react:** 换 `db` 的首个提交起，子树只拿得到新 source 的结果，不再先读到旧库或旧 source 的创建异常；`<Activity>` 隐藏后重显时工厂重新建库，Promise source 报明确的错误，不再把已销毁的实例当就绪库交出去（工厂交回已被销毁的实例同样报错）；`useAction` 在本次提交的 layout effect 与提交途中同步派发的事件里也调用最新回调。
- **code-editor-react:** 放在 `<Activity>` 里隐藏再显示，编辑器的文本、选区与撤销历史都保留；隐藏期间 `value` 若有变化，重显时按差量补同步。
- **rxdb-model-angular / -react:** `EntityDetail` 切换编辑目标期间不再把输入保存到旧记录（与 Vue 同口径）：目标未就绪时只留取消并拦截提交，加载失败原因进错误面板，换目标、取消或卸载之后迟到的保存结果不再关闭对话框或发事件。Angular 编辑模式下输入之后再跑一轮变更检测，表单不再被重置回实例旧值（此前界面仍显示输入，提交出去的却是旧值）。
- **rxdb-model-react:** `EntityDetail` 区分「没有 Provider」与「有 Provider 但库未到」，与 Vue / Angular 同口径：有 Provider 但库未到（含 source 创建失败）时，create 的保存禁用并拦截提交，不再把表单数据当透传交出、记录不落库；等待期间先显示宿主初始值，期间的输入并进库到之后的草稿；没有 Provider 时带 `entityId` 的编辑照常透传表单数据，不再只留取消；带关系的实体在库未到或没有 Provider 时不再因关系列表读库而抛错（RV-084）
- **rxdb-model-react:** `EntityDetail` 的 create 草稿保存在取消、换库、草稿被换之后到达的成功 / 失败不再关闭对话框、不写错误面板、不清掉新草稿；换库时把旧草稿移出旧库的实体缓存，清掉输入与错误面板，按新库补建草稿并重新装配关系列表；草稿经当前库的 `entityManager.instantiate()` 建，两个库共用同一实体类时不再无从选库（RV-084）
- **rxdb-model-react:** `SubqueryBuilder` 传了 `initialQuery` 时挂载只发一次 `queryChange` / `validationChange`，值为载入后的查询与校验结果，不再先发临时的 `undefined` 查询与临时的 `{ valid: true }`，与 Angular / Vue 同口径（RV-084）
- **rxdb-model-angular:** `EntityDetailComponent` 的 create 草稿保存进行中取消、或取消后重建了草稿时，旧草稿迟到的保存结果不再生效：成功不再以 `'saved'` 关闭对话框、不再清掉新草稿（此前新草稿被清后再点保存，会退化成只发 `formSubmitted`、不落库），失败不再写进错误面板。判定沿用 edit 模式的编辑代次，与 Vue 同口径（RV-084）
- **rxdb-model-vue:** `QueryBuilder` / `SubqueryBuilder` 挂载时各发一次 `queryChange` / `validationChange`，内容是当前查询与校验结果（载入的 `initialQuery`；没有时 `QueryBuilder` 发空查询、`SubqueryBuilder` 发 `undefined`），与 Angular / React 同口径。此前挂载时不发，`EntityList` 筛选弹层关闭不应用后再打开，「确定」仍按上次未应用的条件与校验状态（RV-084）
- **rxdb-model / -angular / -react / -vue:** 列级只读贯穿键盘与批量入口：Enter / Space 切换、内部 / 系统剪贴板粘贴、Delete 清空都不再写只读属性列、计算列、id / 时间戳列、操作列与选择列，只读开关也不再被刷成关；`QueryBuilderService.setFields()` 之后已订阅的 `validation$` 立即按新字段重算；三端 `QueryBuilder` / `SubqueryBuilder` 把清空后的字段列表也同步给服务；React `QueryBuilder` 在 `<Activity>` 重显时保留用户查询，不再先对外发一个空查询（首次挂载带 `initialQuery` 时只发一次 `queryChange`）。
- **rxdb-client-generator:** 输出目录尚未创建、经父目录软链指向同一物理目录的多个配置，在 CLI 加载配置与 Vite 插件创建时即被拒绝，不再首次生成时互删产物；判据统一为从最近存在的祖先解析物理路径，大小写不敏感的文件系统上只差大小写的已存在目录同样判为重复。
- **rxdb-devtools:** database provider 在运行期换实例后自动换绑事件订阅：旧实例在切换后发出的事件不再转发，新实例的事件不必重新调用 `events` 就能收到。
- **utils:** `toPlainObject` 把 `__proto__` 数据键写成自有属性，不再改写结果对象的原型；`plainObjectToFlattenPathObject` 遇到末位是空洞的数组（含 `new Array(n)`）改为抛 `TypeError`，不再静默缩短或丢弃（中间空洞、显式 `undefined` 与密集数组不变）。
- **rxdb:** `disconnect()` / `disconnectAll()` 拆卸期间，同名 `connect()` 改为等拆卸结束后重新引导，不再返回正在关闭的旧适配器；同一实例的并发 `disconnect()` 共用一次拆卸；被 `disconnectAll()` 接管后，旧调用不再清理新连接的缓存、也不再泄漏已连接的适配器。`reset()` 之后，插件旧的释放 / 安装任务作废，不再反复拆装新纪元的插件。
- **rxdb:** 查询增量合并：换挂表集或任务被清理后，排队的分片在执行时重新核对任务身份并按当前挂载的表集筛选，不再把旧表的事件写进新表的查询与实体缓存；普通实体的本表 CREATE 不再被误判成关系变更而整查；只改 `updatedAt` 的关联实体变更在查询读到它（关系路径或 EXISTS 子查询）时生效；findAll 的成员资格、前后态分类与排序按数据库里的持久化值计算，不再因未保存字段把仍匹配的行移出结果；日期 `in` / `notIn` 按时间点比较；撤销等场景下迟到的 CREATE 批不再把已删除的行加回结果；合并 / 拉取路径派发的实体事件载荷里的日期（变更记录里的 ISO 字符串）并入活查询时还原成 `Date`，订阅者读到的 `updatedAt` 不再是字符串；新建事件的载荷缺查询条件要读的列时回库重查，不再静默丢弃，缺 `orderBy` 要读的排序列时同样回库重查，不再让缺的列按 `undefined` 参与增量排序（顺序与 `limit` 窗口错到下一次整查）；共享查询在错误分发期间调用 `retry()` 会重新执行，结果回调里新增的订阅者只收到一次结果。
- **rxdb:** 多实例网关出站负载可结构化克隆：外部更新通知不再因直接传实体实例抛 `DataCloneError`。跨 tab 广播只带普通字段，值是实体实例的关系属性不随事件跨 tab；关系变化要同时给出外键列，契约写进了 `notifyExternalUpdate` 的文档。
- **rxdb / rxdb-adapter-sqlite-core / -pglite:** 保存等待期间的新输入不再被成功回填覆盖：提交之后才改的字段保留为未保存改动，`modified` 按 patch 重算（PGlite 批量回填不再无条件清 `modified`）；批量回填命中缓存里同 id 的另一个实例时按外部数据合并，保留它的未保存编辑与编辑历史；sqlite-core 批量保存遇到只改了只读字段的实体时按无可写差异跳过，不再整批抛 `Empty patch`（与 PGlite 一致）；一对多 `remove()` 解绑后保存所属实体，会写出子实体的外键置空；批量保存对 `{ type: SyncType.None }` 覆盖的主适配器判定与单条保存一致，缺适配器时逐个点名实体。
- **rxdb:** CHECK 与条件唯一索引的字符串区间端点按码点比较，与 SQLite 和 PGlite 的排序一致；字段描述解析、值校验以及 `enum` / `schemes` / `manualOrder.groupBy` 一律拒绝稀疏数组的空位；`parseEntityFieldValue('boolean', 1)` 返回 `true`；`parseEntityRecordValues` 的结果原型固定为普通对象并丢弃 `__proto__` 键；`__decorateClass` 的返回类型按 `kind` 分支；生成实体或多对多中间表撞上用户实体时，不论注册顺序都报命名冲突。
- **rxdb-adapter-sqlite-core:** 批量删除不再丢掉主键中的 NUL（含 NUL 的字符串写成 `char(0)` 拼接），不会误删另一个实体；查询 SQL 不再整串压缩空白，字符串字面量里的空白保持原样；嵌套 EXISTS 按层分配别名，内层关系不再关联到顶层实体；默认事务先 `BEGIN` 再读当前分支，并发切换分支后写入不会记进旧分支；加密列的建表语句不再写入明文 `DEFAULT`（单条 INSERT 在加密前补默认值；0.0.28 及更早版本建出的表仍留着旧的明文默认值文本，升级不做自动迁移，需要自行重建该表，说明见加密适配器文档）；OO1 路径上只读查询与 DDL 返回的 `rowsAffected` 不再沿用上一条写入的计数；OO1 加载指纹纳入 `locateFile` 回调，后续客户端不再加载错误的 WASM；漂移检查不再把建表注释里的伪 `CHECK` 当成真实约束；批量写回查按目标主键类型还原外键，bigint 外键不再回填成 number；桌面客户端同步订阅失败时关闭已打开的 host 会话。
- **rxdb-adapter-sqlite-wasm:** 共用客户端按身份校验 `init`（库名、VFS、只读、资源与锁配置），第二个逻辑库不再静默访问首库；关闭数据库失败时仍释放 VFS，两步都失败时两个错误都抛出。
- **rxdb-adapter-encrypted:** 再次解锁清除旧密钥时取消在途解密，锁定后不再返回明文。
- **rxdb-adapter-pglite:** 加密列的建表语句不再写入明文 `DEFAULT`，与 sqlite-core 一致：缺省值由适配器在加密前补齐、随整行封成信封，覆盖单条与批量 INSERT、`saveMany` 的 UPSERT 与 QueryCache `upsertMany` 的新行（补的默认值只进新行，命中冲突时不改写本地已有的值）。此前缺省加密列时库端把明文默认值落进密文列、读取时解密失败，明文默认值还留在 `pg_attrdef` 里；0.0.28 及更早版本建出的表可对相应的列执行 `ALTER TABLE … ALTER COLUMN … DROP DEFAULT` 清掉旧默认值，说明见加密适配器文档。
- **rxdb-adapter-pglite:** QueryCache 拉取与写回执回填按外部数据合并，不再覆盖未保存的草稿；`saveMany` 的 `updatedAt` 与单条写入同样单调递增，没有可写差异的实体不发 UPDATE；主键属性 `id` 经 `columnName` 改到别的物理列的实体可以写了：变更触发器按主键物理列记 `entityId`，仓库与批量写的 UPDATE / DELETE、`findByRowIds` 与版本切换（撤销 / 重做、切分支、拉取回填）的 UPDATE、DELETE、upsert 都按主键物理列定位行，与 sqlite-core 同口径。此前记日志的这类实体第一次写就报 `record "new" has no field "id"`，`log: false` 的只能建不能改删（`column "id" does not exist`），只在本地改了主键列名的同步实体拉到更新也失败。旧库的变更触发器在系统表迁移、切分支或拉取回填时按新代码重挂，无需另行迁移；`generate_trigger_sql` 遇到没有 `id` 属性的元数据改为直接抛 `TypeError`。
- **rxdb-adapter-pglite / -supabase:** public 与别的命名空间注册了同名实体（如 `public:Todo` 和 `tenant:Todo`）时，public 实体的 QueryCache `find` / `count`、本地缓存读写和离线重放，不再在请求发出前报 `configured in multiple namespaces`。
- **rxdb-plugin-history / -sync:** 撤销在写事务里按当时的推送认领与已推水位线复核，推送先认领、再按同一口径复查，认领前已被撤销的变更不再上行；压缩合并不再丢掉对分叉前已存在行的删除（删除、同 id 重建、再删除）；历史项指纹带上变更 id，同毫秒同实体的两次变更不会被一次 redo 一起出栈。
- **rxdb-plugin-workspace:** `flush()` 跨断连重连时拒绝，不再拿新纪元的队列报成功。
- **rxdb-react / rxdb-vue:** `usePersistedState` 在 SSR 下不再跨请求共享状态：React 服务端与 hydrate 快照恒为本次调用的 `initialValue`，hydrate 不再因盘上值产生 mismatch；React 服务端渲染也不再在进程内注册表里登记，同 key 跨请求换值类型（如上一个请求传 `null`、这一个传对象）不再整页抛错，初值也不再随请求留在进程里；Vue 按 SSR 上下文为每个请求单独建注册表。Vue 客户端 hydrate 的首帧仍是盘上值，与服务端初值不同时会报 hydration mismatch，规避办法见 Vue 文档。
- **rxdb-react / rxdb-vue / rxdb-angular:** 无限滚动修了两处：用户发起的下一页首值未到时被活查询重锚、或上一页清空时被丢弃，`isLoading` 不再永远卡在加载中；React 还修了换筛选或换库后的首个提交仍把旧列表报告为已加载的问题。
- **rxdb-vue:** `provideRxDB(ref)` 换库后，`useSyncState` 跟随新库并释放旧库订阅。
- **rxdb-plugin-working-tree-react:** Provider 换库后再切回同一个库（A→B→A）时，第一次 A 的迟到结果不再覆盖新结果。
- **rxdb-taro:** realm 绑定语句插在整段指令序言之后（兼容 banner、注释、前置指令与无分号换行），抖音入口对 banner 之后的 `use strict` 同样拒绝。
- **rxdb-model:** JSON 值里自有的 `__proto__` 键在表单克隆、快照与提交中保留；宿主传入的 ±Infinity 与超出安全范围的整数被表单校验拒绝；布尔字段把数字 `1` 解码为 `true`；系统剪贴板粘贴拒收非有限数与超出安全范围的整数；单元格编辑器在原值为 `null` 时不再改用编辑上下文里的值；`parseYmdToLocalDate` 遇到不存在的日期返回 `null`。
- **rxdb-model-vue:** headless 表单与详情撤下 `mode` 后恢复默认的 `edit`，与 Angular / React 一致。
- **utils:** `numberStep` 按十进制计算，已对齐的小数不再多进一步（`numberStep(0.28, 0.01)` 得 `0.28`）；`canBeDate` 遇到 bigint、Symbol 或无法转换的对象返回 `false`，不再抛错（行为收窄：数组、带 `valueOf` 的普通对象、函数这类声明之外的值原来碰巧返回 `true`，现在一律 `false`）；`once` 与 `throttle` 在回调同步重入时不再多执行；`parseChineseNumber` 把显式写出的零当真（`零万`、`0亿` 得 0）；`urlJoin` 不再改写查询串与锚点里的内容：`.` / `..`、末尾的 `/`、值里的 `/&` `/#` 与字面的 `?` 一律原样保留（此前 `?next=/a/&b` 得 `?next=/a&b`、`?r=/s?q=1` 得 `?r=/s&q=1`、`#/route/` 丢掉末尾的 `/`），多段查询串只把各片段开头的 `?` 改以 `&` 接上。
- **rxdb-client-generator:** 实体元数据里的枚举按绑定符号解析，同名局部对象或别的模块的同名枚举不再被静默换成核心值，`PropertyType` 等的别名导入可用；枚举或实体装饰器所在的 import 解析不到时（`@aiao/rxdb` 没装、或从该文件的 tsconfig 解析不到），报错点明解析失败的模块说明符与所在文件；保留的 getter 若引用 getter 之外的模块绑定，生成前报错并点名绑定（此前生成成功、读取时才抛 `ReferenceError`）；实体名与 `EntityBase`、`ENTITY_STATIC_TYPES` 或所继承的基类同名时生成前报撞名；split 模式下实体名含 `$` 或 Unicode 时补上对端 keyValue 接口的导入，空 schema 的 keyValue 统一声明为核心 `KeyValue` 并导入；实体 glob 改用 glob 自身的解析，支持 `@(…)` / `+(…)` / `!(…)`，不成对的 `[` 按字面文件名处理，Vite watch 根同一口径。
- **rxdb-admin:** `aqua` 归为深色主题；命令面板注销来源时中止它的请求，迟到结果与失败不会进入同名新来源，旧注销函数不再误删新来源；`destroy()` 关闭命令面板并取消搜索；mac 上快捷键冲突按 Command 计算；带路由的父菜单的子页面也能在命令面板里搜到。
- **rxdb-admin-angular / -react / -vue:** 命令面板忽略输入法组合中的回车（含 Safari 确认候选时的 `keyCode 229`）；React、Vue 的模态对话框在同一轮关闭再重开时不再丢掉打开请求；Vue、Angular 在当前页面不在菜单里时，页面一级标题会随语言切换。
- **rxdb-devtools-extension:** 同源导航的旧权限查询不再覆盖刚成功的授权，面板不会重新要求授权。
- **三端 demo:** 文件搜索按「名称.扩展名」命中；全折叠时搜索会展开命中路径；懒加载树折叠后重新展开不再出现「标成已展开却没有子项」；「展开全部」后批量添加不再丢失全部监听；批量添加失败或中途离开页面时订阅收尾正确；远程缓存页离开后回收迟到的预览地址；Angular 的 OPFS / storage 路由不再二次解码目录名；生成器页的 Menu（TreeRepository）示例三端都能生成，输入无效时显示错误、不能下载；Angular Todo 的撤销 / 重做按 Task 作用域执行；Angular / Vue 分支切换被拒后选择器显示真实分支；React 主题在多个组件间同步；Vue 详情页保存 / 取消后回到实体列表。
- **Electron demo:** 启动清扫不再删除以 `.rxdb-tmp` 结尾的已提交用户文件，清扫结束前不建本轮临时文件；首页离开路由时摘掉分支监听。
- **HTTP 参考后端:** token 翻页改按 `(createdAt, id)` 作 keyset，翻页途中被更新的行不再漏掉；旧 token 回 400。
- **P2P demo:** 举报归档失败回 502 并可重试收尾，举报提交失败不再标「已举报」；删设备登记或删账号时一并清掉寄给该设备的信封（线上需重放 `p2p-schema.sql`）。
- **aiao:** `docker/init-db.sh` 不再把本地 `start.sh` / `reset.sh` 起的默认栈初始化发给 `supabase-ci` 项目，隔离 CI 栈由 `supabase-ci-up.sh` 显式传 `-p/-f`，并等 Kong 通过健康检查才结束（Apple 芯片上 amd64 镜像靠模拟运行，端口先于 Kong 监听发布，原先紧接着连上去会被重置），隔离回归脚本在没有默认栈容器的机器上不再误判失败；入库 `docker/.env.example`，干净检出可照 `docker/README.md` 的快速开始操作；Supabase 参考 SQL 给 `menu_large` 补上 `(parentId, title)` 的 normalized 唯一索引，与本地适配器一致（已有开发库里若残留重复的同级菜单，需先清理或 `./reset.sh`）；`test-all:log` 的默认范围改为 `--base=main`，与 `pnpm test-all` 一致；e2e 静态服务与覆盖率首页在文件或目录被并发删换时不再崩溃；git-stats 合并时不再丢掉普通代码行；affected-ci 的 full 模式直接调用 `pnpm test-all`；评审脚本与审计门禁的判据修正：覆盖日志截断续写、`range=branch` 遇到被删项目、`--since` 同秒覆盖、覆盖率按源位置合并、API 基线的 type-only 转出、文档别名按代码块、惰性后端门禁的不可达 chunk、需求清单与 AC 继承。
- **文档:** README 与网站的 `create` 示例改为先建实体实例；rxdb-react / -vue 的树查询 hook 改为指向 tree 插件包；Vue `useEntityChange` 的示例改为解构写法；working-tree-react 示例的 effect 依赖改为稳定的方法引用；search 的 React / Vue README 改为 `useSearch`；history 快速示例改为先切回 `main` 再合并；`bulkSync` 的仅 pull 示例改为 `operation: 'pull'`；rxdb-model 的查询构建器示例对齐 `addRule` 签名；图查询文档按 Promise 静态 API 修正；Angular 编辑器 README 删去已不存在的命令式 setter；架构页的客户端生成命令改为 `npx @aiao/rxdb-client-generator`；`getRepository` 的 TSDoc 订正为不自动归属当前事务。
- **HTTP demo:** 顶栏变更通知徽标不再把启用意图当连接状态：连不上或断线退避时不再显示「已接通」，改为 已关闭 / 连接中 / 已接通 / 重连中 四态，只认适配器报来的接通与故障，重连成功即回到「已接通」；新增通道故障计数与最近一次故障说明。

## 0.0.28 (2026-10-24)

本版把系统表结构从 3 升到 7，实为一次迁移发布；发布时按普通版本声明、漏写了下面前四条，事后补记。

### ⚠️ Breaking Changes

- **rxdb:** 系统表结构从 3 升到 7（4～6 来自工作树与提交历史，7 来自 Supabase 推送回执）。用 0.0.28 打开过的库，0.0.26 及更早的客户端会拒绝打开（`UnsupportedRxDBSystemVersionError`），所有客户端须一起升级，没有降级路径。在本机开过工作树提交能力、又早于工作树拆包的开发库，删库重建，不要带着它升级。→ [v1](https://rxdb.aiao.io/docs/migration/v1)
- **rxdb-adapter-supabase:** 推送本地修改改走普通 `UPDATE`（`rxdb_mutations` 新参数 `p_updates`），推送路径改为逐实体回执（`RemoteMergeResult` 改形状）；须先升级参考 SQL，再升级客户端。→ [supabase-update-push](https://rxdb.aiao.io/docs/migration/supabase-update-push)、[supabase-push-receipts](https://rxdb.aiao.io/docs/migration/supabase-push-receipts)
- **rxdb:** 工作树与提交历史拆成 `@aiao/rxdb-plugin-working-tree`，树结构拆成 `@aiao/rxdb-plugin-tree`（三框架 hook 随 `-angular` / `-react` / `-vue` 子包）；不涉及数据迁移，要改依赖、import 与 `use()`。→ [working-tree-split](https://rxdb.aiao.io/docs/migration/working-tree-split)、[tree-split](https://rxdb.aiao.io/docs/migration/tree-split)
- **rxdb / rxdb-plugin-querycache:** 接口成员与函数参数的九项变化（`SwitchBranchOptions.prepare` 必填、SQL 生成函数的 `branchId` 必填、`getEntityMutations` 入参改 camelCase、`@aiao/rxdb` 改放 `peerDependencies` 等），逐项见 [v1「0.0.28」](https://rxdb.aiao.io/docs/migration/v1)
- **aiao:** `@aiao/*` 包间 peer 依赖统一为 `workspace:^`（发布时改写为 `^0.0.28`），替换此前混用的 `*` / `workspace:*` / `^0.0.26` 写法（US-602 A2）

### 🩹 Fixes

- **rxdb-adapter-miniprogram:** 往库里写大量数据（大 BLOB、批量导入）时，库文件缓冲每追加一页就整块重新分配、把整库拷一遍，耗时随库大小平方增长。改为换缓冲时多留余量（至少 1 MiB、至多当前大小的 1/8），追加写的拷贝量随库大小线性增长；支付宝探针的 dist 冒烟写满 50 MiB 从约一分钟降到约两秒（US-209）

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
