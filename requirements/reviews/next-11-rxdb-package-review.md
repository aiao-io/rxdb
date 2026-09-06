# next-11 分支 `packages/rxdb` 包深度评审

- **分支**：`next-11`（领先 `main` 32 个提交，不落后）
- **范围**：`packages/rxdb`（`@aiao/rxdb` 0.0.25）——源码 35,416 行 / 213 文件，测试 60,948 行 / 144 spec；不含适配器与框架绑定
- **日期**：2026-09-06
- **结论**：🟡 凑合。门禁全绿、架构与注释质量高，但有 **8 条已核实的静默数据分叉 / 静默过期缺陷**，以及一批「无兜底」铁律与公共 API 面失守；90% 覆盖率数字为真，其中相当一部分是替身踩出的行而非契约验证
- **修复状态**：修复中，进度见下方「修复进度」

## 评审方法

1. 机械扫描：lint / typecheck / test（含覆盖率）实跑；API 基线比对（`scripts/audit/api-surface.mjs`）；`any` / `eslint-disable` / `TODO` / `console.*` / `as unknown as` / `??` 计数；函数长度与嵌套深度启发式；TSDoc 缺口与注释语言扫描；dist 产物与依赖检查；上次 [next-1123 评审](next-1123-branch-review.md) 中 rxdb 三条项的修复复核。
2. 五个深度评审 agent 分片通读全部非测试源码：`entity + schema` / `repository + query` / `version` / 核心（`RxDB.ts`、插件生命周期、事件、事务、`system`、`gateway`、`network`）/ 测试套件质量。
3. 每条 🔴 由评审者本人对照源码复核，推测项剔除或标注「未验证」。

## 门禁实测

| 项目                                 | 结果                                                              |
| ------------------------------------ | ----------------------------------------------------------------- |
| `rxdb:lint`（`--max-warnings=0`）    | 通过                                                              |
| `rxdb:typecheck`                     | 通过                                                              |
| `rxdb:test`（chromium 浏览器模式）   | 144 文件 / 2674 用例全过，56 s                                    |
| 覆盖率 stmts / branch / func / lines | 96.36 / 92.00 / 97.82 / 97.23（≥ 90）                             |
| API 基线（427 个导出）               | 无漂移                                                            |
| 源码 `any` / `eslint-disable` / TODO | 0 / 4（均有说明）/ 0                                              |
| `as unknown as` / `??`               | 33 / 140                                                          |
| 函数 > 60 行 / > 100 行              | 37 / 11                                                           |
| next-1123 的 rxdb 三条项             | 已修（代次守卫、`finalize` 身份校验、回滚重放含远端失效事件）     |
| dist                                 | 304 KB / gzip 76 KB；`type-fest` 已被擦除为纯类型依赖；无深层导入 |

> 环境备注：本机 Playwright 1.62.1 的 chromium headless shell 缺失，首跑 vitest 报「no tests」且覆盖率 0%（退出码 1）。执行 `pnpm exec playwright install chromium` 后正常。仓库无改动。

---

## 修复进度

按下方「建议的修复顺序」推进。每条修复都先写红测试，再改实现，并用变异（把实现改回旧行为）确认测试真的能打红。

| 步骤 | 内容                                       | 状态                                                   |
| ---- | ------------------------------------------ | ------------------------------------------------------ |
| 1    | 🔴 #1 / #7 / #8 活查询与本地编辑的静默丢失 | ✅ 已修                                                |
| 2    | 🔴 #3 / #4 / #5 同步分叉三件套             | ✅ 已修                                                |
| 3    | 🔴 #2 / #6 各一行修复                      | ✅ 已修                                                |
| 4    | 测试基建                                   | ⬜ 未开始                                              |
| 5    | 协议一致性                                 | ✅ 已修（六条全部落地，见下方清单）                    |
| 6    | 兜底清理与 API 面收敛                      | 🟡 进行中（必填字段上的 `??` / `?.` 已随各条修复清理） |
| 7    | 拆长函数                                   | ⬜ 未开始                                              |

### 已落地的关键改动

- **#1**：`createEntityRef` 命中缓存时改走 `EntityStatus.applyExternal`，脏实体逐键避让本地编辑；策略判定收在一处。
- **#3**：`restoreEntity` 改走 `mergeChanges(actions, undefined, false)`，与 `merge_branch` 的 squash 出口同路，恢复会产生 change 行。
- **#4**：新增 `version/branch-change-id.ts`，分支 `fromChangeId` 跨本地 / 远端 id 空间双向翻译；翻译不出来时整条分支本轮跳过（`SyncBranchesResult.skipped`），不写错 id 也不写 `null`。
- **#5**：`pull()` 新增 `pullFilterRepositories`，批量那趟跳过的 filter 仓库单独补拉，结果并进同一个聚合。
- **级联 DELETE 相位**：阻断边随相位翻转。`dependencyEdgeForAction` 与排序方向同源于 `sortDirectionForAction`，DELETE 相位按 `requiredBy` 阻断、INSERT 相位按 `dependsOn`；`findBlockingDependency` 的 `edge` 参数**必填**，无默认值。跨相位被阻断的节点交出 `blockedPushProgress`，不再把已推送的条数抹成 0。
- **count 去重集**：`handleCountUpdate` 与树形的两个 count 出口统一传 `autoCache=false`。`QueryTask#next` 在 `autoCache=true` 时无条件清空 `resultEntityIds`，而 count 结果是 number、不会重新填充它 —— 一次计数更新就把跨批次去重集合抹干净，同一实体被重复计数。`merge_create` / `merge_remove` 早已传 false，update 侧三处漏传。
- **冲突解决器 / `RemoteSyncOptions`**：删掉 `RemoteSyncOptions`（零实现幻影类型，`SyncOptions` 里根本没有它的落点）；把 `conflictResolver` 接进 `PullOptions`，`pullBatch` 不再写死 `new LWWConflictResolver()`。此前同一个自定义策略走 `pullRepository` 生效、走 `pull()` 默认的批量路径静默失效，两条路径对同一份冲突给出不同结果。`ConflictResolution` 的 TSDoc 同步改诚实：运行时能自动应用的只有 `KEEP_LOCAL` / `KEEP_REMOTE`，`MERGE` / `DEFER` 整轮抛错回滚，`conflictsDeferred` 因此恒 0，并给出「应用侧合并后重 pull」的正确用法。
- **push 失败契约**：`pushRepository` 失败**一律抛**，`throwPushFailure` 是唯一出口。`pushed === 0` 抛裸错误，`pushed > 0` 抛 `RxDBPartialSyncError<PushRepositoryResult>`（这些条目已在远端且不回滚）。此前级联路径抛、单仓路径 resolve 出 `success: false`，`bulkSync` 只看抛不抛，于是单仓失败被记成成功、`BulkSyncResult.failed` 恒为 0。同时：失败改发 `RepositorySyncErrorEvent`（此前发 `Complete`，只订阅 Complete 的监听方把失败当成功）；`sync-repository.ts` 新增 `rewrapPushFailure`，push 已发出的进度不再被 `emptyPushResult` 抹平；`push.ts` 与 `pull.ts` 同口径解包嵌套 partial error。
- **分支口径**：新增 `version/pull-ancestor-changes.ts`，`pullRepository` / `pullBatch` / `checkRepositoryUpdates` 统一「逐祖先分支拉 + 按 id 全局排序后截断到 limit」。此前 `pullRepository` 与 `checkRepositoryUpdates` 只看当前分支，父分支上的变更永远拉不到、且 `hasUpdates` 谎报 false。

### ⚠️ 破坏性 API 变化（需在 PR 说明）

移除 `RemoteSyncOptions`（`@aiao/rxdb`，经 `export *` 出自 `version/VersionManager.interface.ts`）。

- **为什么删**：该接口的两个字段全无实现。`autoSync` 在整个仓库里没有任何读取点；`conflictResolver` 的真正落点是 `PullOptions` / `PullRepositoryOptions`。而 `RxDBConfig.sync` 的类型是 `SyncOptions` 联合，其成员没有一个能容纳这两个字段 —— 也就是说这个接口连**被传进来的位置都不存在**，纯粹是编译期的装饰。
- **迁移**：没有真实用法需要迁移（它无法被传给任何 API）。若类型被显式引用，改用 `PullOptions`；冲突解决器改为在调用点传入 `pull({ conflictResolver })` 或 `pullRepository(..., { conflictResolver })`。
- **基线**：`requirements/api-baseline/rxdb.json` 已同步（净减 1 个符号）。

---

## 🔴 必须修（8 条，已逐条核实）

### 1. 缓存命中时 `replace()` 无条件丢弃本地未保存编辑

- **文件**：`packages/rxdb/src/entity/entity-manager.ts:246-248`
- **现象**：`createEntityRef` 命中缓存即 `getEntityStatus(entity).replace(data)`；`replace`（`entity-status.ts:371-386`）重设 `_origin`、`_modified=false`、清空 `_patches`。
- **可达路径**：`repository/QueryManager.ts:290`（跨 tab / 远端 UPDATE 事件只挡 stale，不挡「新鲜但本地脏」）；`RepositoryBase.ts:100 updateEntity` ← pglite / sqlite-core 的活查询整批回填。
- **后果**：脏实体的本地编辑被静默清空，随后 `save()` 变 no-op。`query/merge-update.utils.ts:57-67` 已实现 `modified ? mergeExternal : replace`，同一策略两套口径。
- **修复**：判定收进 `createEntityRef`（`status.modified ? mergeExternal(data) : replace(data)`），`RepositoryBase.updateEntity` 同改。

### 2. 继承的 `m:n` 关系不生成中间表

- **文件**：`packages/rxdb/src/schema/SchemaManager.ts:95-96, 143`
- **现象**：中间表生成只遍历 `metadata.relations`（仅本类声明，见 `metadata-transition.ts:261`）；同文件 `:212` 反向查找已特意改用 `relationMap` 并注释了原因，正向漏了。
- **后果**：父类声明的 `MANY_TO_MANY` 既无中间表也不写 `junctionEntityType`，运行时 `relation-cache.ts:120/199` 的 `junctionEntityType!` 走到 `getEntityMetadata(undefined)` 抛裸错。specs 无继承用例。
- **修复**：`:96` 改 `metadata.relationMap.forEach`；`:143` 同时给反向端 `junctionEntityType` 赋值。

### 3. `restoreEntity` 不产生 change 行，远端永远认为已删除

- **文件**：`packages/rxdb/src/version/restore-entity.ts:74-75`
- **现象**：经 `adapter.switchBranch` 落库，而 sqlite-core（`version/switch_branch.ts:116-118`）与 pglite（`version/switch_branch.ts:107-108`）的 switch_branch 第一步就是 `remove_all_triggers_sql`。
- **后果**：与 TSDoc（`restore-entity.ts:18-19`、`VersionManager.ts:848-849`「可被 push」）直接矛盾，恢复的行进不了 push / pushableCount / undo，本地与远端分叉。`VersionManager.spec.ts:609-645` 只断言 `switchBranch` 被调用。
- **修复**：改走 `adapter.mergeChanges(actions, undefined, false)`（与 `merge-branch.ts:151` 同路），补「restore 后 pushableCount +1」测试。

### 4. 分支 `fromChangeId` 跨本地 / 远端 id 空间不翻译

- **文件**：`packages/rxdb/src/version/push-branch.ts:29`、`sync-branches.ts:121`
- **现象**：本地 `RxDBChange.id` 与远端 id 是两条序列（`remoteId` / `changeIdMapping` / `lastPushedChangeId` vs `lastPullRemoteChangeId` 即为此而设），`fromChangeId` 却原样透传；supabase 端（`RxDBAdapterSupabase.ts:558`）也不翻译。
- **后果**：落到本地后被 `switch-branch-actions.ts:83-89`、`find-switch-branch-step.ts:66-67`、`merge-branch.ts:64-66` 当本地 id 消费，他端来的分支分叉点是垃圾值，切换 / 合并应用错误区间。
- **修复**：pull 侧按 `remoteId` 反查本地 change id，查不到拒绝落库；push 侧发 `change.remoteId`。

### 5. `pull()` 永远跳过 filter 类型仓库且报告完整

- **文件**：`packages/rxdb/src/version/pull.ts:35-40`、`pull-batch.ts:168`
- **现象**：无 `repositoryFilter` 时走 `pullBatch`，它对 `syncType === 'filter'` 直接 `continue`，再无补拉路径。
- **后果**：`pull()` / `sync()` 对 filter 仓库不拉，却返回 `hasMore:false, failures:[]` → `isCompletePull` 为真 → `pullableCount` 归零（`VersionManager.ts:937-940`）。
- **修复**：`pullBatch` 之后对 filter 仓库补 `pullRepository` 并合并结果；至少把跳过的仓库放进结果。

### 6. `#shutdown()` 不作废在飞的 `connect()`

- **文件**：`packages/rxdb/src/RxDB.ts:946-973`（对照 `disconnectAll` `:767` 有做）
- **现象**：`disconnect(A)` 只作废 A 的纪元，`#connected_adapters.size===0` 即进 `#shutdown()`；此时仍在引导的 `connect(B)` 的 `#assert_connect_alive` 全部通过。
- **后果**：B 静默 resolve 进一个已拆掉的纪元，`#clear_adapter_connected()` 抹掉其标记但实例留在 `#adapter_map`；停机窗口内新进的 `connect()` 因 `#rxdb_initialized` 仍为 true 在 `init()` 早退。`disconnect-race.spec` 全是单适配器场景。
- **修复**：`#shutdown()` 首行 `for (const n of this.#connect_promise_map.keys()) this.#invalidate_connect(n)`；`init()` 里 `if (this.#shutting_down) throw`。

### 7. 一个查询的合并异常让整个仓储的活查询静默过期

- **文件**：`packages/rxdb/src/repository/QueryManager.ts:388-412`；`packages/utils/src/@browser/perform-chunk.ts:85-87`
- **现象**：`performChunk` 的 consumer 一抛就 `fail(error); return`，同一批后续 task 都收不到这条事件；抛错的 task 也不 `refresh()`，只 `console.error`。
- **修复**：consumer 内按 task try/catch，失败即 `task.refresh()` 并继续；外层 `.catch` 只兜真正意外。

### 8. 触发器路径的日期 patch 是字符串，规则匹配对 `Date` 恒 false

- **文件**：`packages/rxdb/src/query/query-matching.utils.ts:69-80, 119-125`；`query-rules-builder.ts:142`
- **现象**：sqlite-core 触发器用 `json_object(NEW.col)` 写 patch（`table/trigger_sql.ts:113`），日期是 ISO 字符串；`handle_rxdb_change.ts:45` 原样透传；`DateRules` 强制规则值是 `Date`。`compareRuleValues` 用 `(left as string) > right`，字符串对 Date 走 `ToNumber` 得 NaN 恒 false，`=` 走 `isEqual(Date, string)` 亦 false。
- **后果**：带日期区间 `where` 的活查询对新行既不重算也不刷新，无日志。同根因：`EntityStatus.replace` 的 `Object.assign` 会把缓存实体的 `createdAt/updatedAt` 改写成字符串。
- **修复**：`compareRuleValues` / `=` 分支把两侧归一成毫秒；或 gating 前按实体元数据解码 patch。

---

## 🟡 主要问题

### 「无兜底」铁律违反（必填字段上的死默认，覆盖率报告证明分支跑不到）

- `entity.utils.ts:194-200` `foreignKeyNames ?? []` / `foreignKeyColumnNames ?? foreignKeyNames` 掩盖了 `normalizeUpdateEntity` 依赖两个数组按位对齐的隐患（`metadata-transition.ts:306-310` 的 `.filter` 一旦过滤即错位写错列）。
- `SchemaManager.ts:212` `relationMap?.values() ?? relations ?? []`（正是把 🔴 #2 遮住的那种兜底）；`:198` 未知 kind 返回 `undefined`。
- `find-switch-branch-step.ts` 15 处 `fromChangeId ?? 0`，`:194,237,252` `nextChangeId ?? 0` 是死代码；`push.ts:59-62` 四处 `pushed ?? 0`；`sync-repository.ts:148-153` 六处 `?? 0`。
- `LWWConflictResolver.ts:36-37` `createdAt?.getTime() ?? 0`：缺时间戳时两侧都变 epoch 0 → 平局 → 由 clientId 决胜，赢家静默改变。
- `RxDB.ts:425` `sync || {}`，同一字段在 `rxdb.private.ts:77` 直接解引用。
- `entity-manager.ts:268-303` `#get_entity_cache_map(...)?.`（方法必返回）；`relation-cache.ts:38-40`、`relation-helper.ts:275` 对 `ENTITY_MANAGER` 兜底会把「未注册 / 多库歧义」变成静默用错类。

### 协议与语义不一致

- `push-repository.ts:831-842` vs `:267-272`：单仓失败 resolve `{success:false}`，级联失败 throw；`bulk-sync.ts:155-162` 把前者记成成功，`BulkSyncResult.failed=0`。
- `push-repository.ts:315-327` + `cascade-contract.ts:164-178`：级联 DELETE 相位只看 `dependsOn`，子删除失败不阻断父删除；被阻断节点用 `emptyPushProgress()` 定案，把已推的 `pushed` 报成 0。
- `pull-repository.ts:523-529` vs `pull-batch.ts:154`：一个只拉当前分支，一个拉祖先分支，同一仓库两条路径数据集不同；`check-repository-updates.ts:124-128` 计数口径又是「仅当前分支」。
- `push.ts:54-66`：失败按仓库计 1 不按变更计，丢掉 `RxDBPartialSyncError.result` 里的部分进度，打破 `originalCount = pushed + failed + compacted`。
- `diff-metadata.ts:90`、`QueryCacheRepository.ts:406`：按字典序比 ISO 字符串，本地是 `.000Z`（`QueryCacheRepository.ts:191`），Supabase 给 `+00:00`，HTTP 后端常给无毫秒 `Z`，`'…00Z' > '…00.000Z'` 为 true → 每次全判 stale 永久重拉。spec 只测统一 `Z`。
- `QueryCacheRepository.ts:701-716` `#evictOrphans` 与出站队列无隔离：恢复联网时 `find` 与 `flushQueryCacheOutbox` 竞争，离线新建行被当孤儿删除、离线删除行被拉回复活（机制已验证，时序命中率未验证）。
- `query-cache-primary.ts:335-365`：SWR 有缓存时 `#runSync` 首发即 resolve，`remember()` 在远端校验前写入，校验失败被 `QueryCacheRepository.ts:549` 吞成 `EMPTY` 后记忆仍在。
- `merge-update-basic.ts:176`（同 `merge-update-tree.ts:465,626`）`task.next(newCount)` 默认 `autoCache=true` 清掉 count 去重集，而 `merge_create.ts:155` 特意传 false 并写了长注释；同 INSERT 双派发时 count 多 1。
- `VersionManager.interface.ts:187-206 RemoteSyncOptions`（`autoSync` / `conflictResolver`）公开导出但零实现，`pull-batch.ts:281` 写死 `new LWWConflictResolver()`；`ConflictResolution.MERGE / DEFER` 在 `pull-conflict-utils.ts:257-264` 一律抛错回滚，`conflictsDeferred` 恒 0。
- `history-scope-api.ts:175`：只调 `history(entity).undo()` 不订阅时 `history_cache` 条目永不释放，按 entity id 分键会无界增长。
- （未实测，中置信）`undo-redo-apply.ts:114-186` vs `HistoryManager.ts:465-472`：push 事务外等远端往返窗口内一次 `undo()` 回滚变更 X 而随后 commit 把 X 标成已推，本地 ≠ 远端且推不回去。
- `QueryTask.ts:313-327`：runner 抛错终结整条 `refresh$`，一次瞬时网络失败永久杀掉活查询，无重试无 `catchError`，TSDoc 未说明。
- `rxdb.transaction.ts:68-69`：实体事件用裸 `forEach`，第一个监听器抛错后同事件其余监听器（网关转发、查询刷新）全部收不到；事务事件路径用 `runIsolated`，保证不一致。
- `dependency-scheduler.ts:244-252`：顺序 `await connect('local'); await connect('remote')` 时 local 落地即对 `inject:['adapter:remote']` 的插件喊「not installed」，误报。
- `rxdb.plugin-lifecycle.ts:71-77` + `RxDB.ts:523-524`：已连接后 `use()` 的安装失败只剩 `console.error`，文档说「由后续 connect() 传播」但 `connect(name)` 命中缓存直接返回旧 promise。
- `rxdb.plugin-lifecycle.ts:176-189`：`scope` 为 `undefined` 的 legacy 插件仍被调 `destroy()`，无 `install()` 配对。
- `query-cache-outbox.ts:494-498`：全部待推 id 塞进一个 `in` 无分批；batch 中途失败后第二轮已成功的 UPDATE 被判 `KEEP_REMOTE` 报成假冲突。

### 公共 API 面（46 条 `export *` 撑出 427 个导出）

- **`any` 泄出**：`proxy.ts:25` 泛型返回类型写成构造器类型，连锁到 `dist/entity/entity-manager.d.ts:59` `createEntityRef(...): any`，`QueryManager.ts:290` 因此要写 `!`。
- **公开签名引用未导出类型**：`EventListener` / `RxDBConfig` / `MergeQueryTaskOptions`（`rxdb.types.ts`）、`QueryManager`（`Repository.queryManager`）、`EntityStatus`、`BulkSyncOptions/Result`、`RepositorySyncStatus`、`DependencyGraph`、`SyncRepositoryOptions/Result`；`VersionManager` / `TreeRepository` 类本身不可具名。
- **死代码进公共面**：`system/types.local.ts` / `types.remote.ts` 整文件零引用，`types.local.ts:105` 「仓库接口继承适配器基类」，`:147` `export declare class` 在运行时模块里导出不存在的类；`RxDB.ts:1148` 与 `system/types.ts:476` 两处 `declare module '@aiao/rxdb'` 幻影增强，`rxdb.RxDBChange` 类型是类、运行时 `undefined`；`system/types.ts:65,79,216,228` 手写规则联合混入他表字段，`RxDBSync.find({ where: { field: 'parentId' } })` 编译通过运行时撞不存在的列；`version.utils.ts`、`dependency-graph.ts` / `topological-sort.ts` 多个导出只有测试引用。
- **内部实现漏出**：`cleanupExpired(vm,…)` / `syncBranches(vm)` 经 `export *` 公开，而 `index.ts:88-89` 以同样理由拒绝导出 `checkRepositoryUpdates`；`setSafeObjectKey` 系列、`fillDefaultValue`、`getEntityMutations`（参数字段 `need_save_entities` snake_case）全部公开；`QueryTask` 含 `serialize/onClean/depEntityTypeMap` 内部管线整体导出且已被 `rxdb-plugin-graph` 依赖。
- **命名**：`merge_create.ts` / `need_refresh_*.ts` / `entity_type_dependencies.ts` 与 `merge-update-tree.ts` 两套文件名风格；`query_need_refresh_*` 在 barrel 处改名；`isRuleGroup` 公开的是宽松版，`QueryTask.ts:24` 另有严格私有副本。
- **TSDoc 缺口**：699 个导出声明中 113 个无 TSDoc，集中在 `rxdb-events.ts`（25 个事件常量 + 7 个 `*EventData`）、`rxdb-adapter.ts`（`IRxDBAdapter` 全部成员）、`system/migration.ts`、`property-types.interface.ts`；`entity-base.ts:81-97` 类 TSDoc 写在装饰器之后被挂错位。
- **文档漂移**：`change-codec.ts:270-288` 说「字符串 ID 走原始通道」，代码对所有 id 包信封；`:372` 把 identity 版本塞进 `UnsupportedRxDBChangeVersionError` 的 codec 参数；`VersionManager.ts:640` 示例用不存在的 `pull?.pulled`；`QueryCacheRepository.ts:288` 示例用不存在的 `operator: 'eq'`；`scope-selection.ts:118-119` 指向 private 的 `historyManager`。

### 体量与嵌套（AGENTS.md 要求 < 3 层）

| 函数                                                      | 行数 | 备注                                                                                                            |
| --------------------------------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------- |
| `pull-batch.ts:139 pullBatchOnce`                         | 274  | 事务回调 100 行                                                                                                 |
| `pull-repository.ts:458 pullSingleRepository`             | 230  | 与上者 `:570-647` / `:297-395` 是同一段逻辑两份手抄                                                             |
| `find-switch-branch-step.ts:61`                           | 205  |                                                                                                                 |
| `HistoryManager.ts:145 constructor`                       | 161  |                                                                                                                 |
| `push-repository.ts:573 planRepositoryPush`               | 145  |                                                                                                                 |
| `metadata-transition.ts:101 transitionMetadata`           | 220  | 4 层                                                                                                            |
| `SchemaManager.ts:58 init`                                | 120  | 4 层，且直接 `push` 进调用方的 `rxdb.config.entities`                                                           |
| `switch-branch-actions.ts:122 get_switch_version_actions` | 100  | `if→for→switch→case→if→if` 6 层                                                                                 |
| `entity_type_dependencies.ts:159 processRules`            | 81   | 7 层，同一段「加 mappedEntity + 中间表」复制三份                                                                |
| `RxDB.ts:593 connect`                                     | 105  | 4 层；`adapter as unknown as RxDBAdapterLocalBase` 后用 `?.()` 对具体方法可选调用，非基类适配器静默跳过系统迁移 |

### 资源与生命周期

- `Repository.ts:166-172` `destroy()` 不调 `#syncMemo.clear()`，`query-cache-sync-memo.ts:131-134` 定时器未 `unref`。
- `reachability.ts:151-153` + `RxDB.ts:314,406-412`：每个 `new RxDB()` 在 `globalThis` 挂 `online/offline` 监听并订阅 `SyncStateHub`，无终态 `destroy()`，多实例 / HMR / 测试按实例数线性累积。
- `sync-listeners.ts:263-265` `.subscribe()` 无 error 处理，一次逃逸拒绝永久杀死自动回推；`HistoryManager.ts:292` `catchError(() => EMPTY)` 吞掉 count 流错误且不进 `errors$`。
- `entity-manager.ts:173-196`（未验证，低置信）PROXY 工厂把 `addEntityCache` 放进微任务，同一 tick 内 `new User({id})` 后 `createEntityRef` 会造第二个实例。

### 测试套件

- 🔴 `__tests__/fixtures/test-db-setup.ts:47-119` `createMockAdapter()` 实现了 `IRxDBAdapter` 根本没有的 `create/update/remove/findOne/findMany/count`，缺 `name/version/saveMany/removeMany/mutations` 与 `RxDBAdapterLocalBase` 全部抽象方法，`:119` 用 `as unknown as IRxDBAdapter` 关掉 tsc；11 个 spec 直接依赖，`createTestDB` 再传导 7 个。这是「对真实适配器不存在的行为全绿」的根源。
- 🔴 9 个 `.coverage.spec.ts` 按行数写：`VersionManager.coverage.spec.ts:66-165` 用 19 个 `vi.mock` 把 `HistoryManager` 与 17 个协作模块全换掉后再「覆盖」`VersionManager.ts`。
- 🔴 7 份 merge_* spec 各自复制 90 行 `createMockQueryTask`，手写 `result$` 管道自管 `observerCount/run/clean`，生产上 `result$` 由 `QueryManager.ts:150` 装配。9.7k 行测试验证的是测试作者写的流，`QueryManager` 的 share / replay / 清理语义怎么改都绿，副本已开始分叉。
- 50 处固定 `setTimeout(100)` 做否定断言（累计 ≥ 5 s 墙钟，高负载下迟到的第二次发射静默通过）；`sync-undo.spec.ts:112-118` 200×5ms 轮询。
- 自证测试：`contracts/filter-sync.spec.ts:110-135, 193-237`（自己声明接口断言自己，从未 import `cleanup-expired.ts`）、`version/filter-sync.spec.ts:63-80`、`conflict.spec.ts:187-249`。
- 空断言：`HistoryManager.spec.ts:928-933` `expect(true).toBe(true)`；`bulk-sync.spec.ts:135-150` 「默认并发数应该是 3」只 `toBeDefined()`；`entity-status.spec.ts:232-247,496-510` 标题说 clear 但只 `toBeDefined()`。
- 绑私有状态：`HistoryManager.spec.ts:297-298` cast 后直写 `isUndoRedoInProgress`；`entity-status.spec.ts:83-85`、`relation-helper.spec.ts:495` `Reflect.set` 私有字段。
- 拆卸：`test-db-setup.ts:174-179` `cleanup` 从不 `rxdb.disconnectAll()`，18 个文件 `new RxDB(` 零 after-hook，今天不炸只因 browser mode `isolate:true`。
- 无专属 spec 的活代码约 2,000 行：`undo-redo-apply.ts`、`pull-conflict-utils.ts`、`history-scope-api.ts`、`restore-entity.ts`、`pushable-repository-rules.ts`、`rxdb.transaction.ts`、`rxdb.plugin-lifecycle.ts`、`migration-runner.ts`、`need_refresh_*.ts`（公开导出）、`many-to-many-entity.ts`、`json-safe.ts` 等。
- 覆盖率低于 90 的文件：`merge_remove.ts` 81/65（`find/findOne/get` 的删除刷新分支 `:30-51` 全未测）、`merge_update.ts` 81/83、`change-codec.ts` 84/76（版本不匹配与非法输入恰是最该测的抛错路径）、`RxDBTabsGateway.ts` 分支 82；`rxdb-adapter.ts` 0%（基类默认实现无人执行）。
- 测试普查：2,431 个 `it` / 0 skip·only·todo / 0 `any` / 330 处 `as unknown as` / 74 处 `setTimeout` / 5,332 个 `expect`；merge_* 系列断言密度 1.1–1.5 expect/it，对照 `HistoryManager.coverage` 3.3。

---

## 值得保留的设计

- 双代次守卫（`QueryCacheRepository.#invalidationGeneration` + `QueryCacheSyncMemo.generation`）分工清晰，判定放在 `#pull` 响应之后、写之前；`finalize` 置于 `shareReplay` 之前并按身份删 inflight。上次评审的竞态修干净了。
- push 三段式（plan / push / commit）+ 分相位级联（DELETE 子先、INSERT 父先）+ 事务内水位线；`persistedProgress` / `historyInvalidated` 双信号比计数可靠；commit 失败回滚内存中的 `remoteId`。
- `HistoryManager.ts:624-628 #runSerialized` 的 `.catch(() => undefined)` 只挂在队列指针上，调用方仍拿到原 rejection，不是吞错。`RxDB.ts:680` 的 `connectPromise.catch` 同理。
- 纪元仲裁（`#connect_epochs` / `#assert_connect_alive`）+「中止链只抛错不清理、连接一律由 disconnect 关」的单一交接点；`PluginDependencyScheduler` 不认识 RxDB、可独立喂假宿主；`LifecycleScope` 逆序拆卸与 `init()` 失败路径逐条对称。
- `EntityIdentityCache` WeakRef + 惰性清理 + 阈值随存活规模上浮；`EntityStatus` 的 `#generation` 与 `#content_revision` 两个计数分工明确；`mergeExternal` 逐键避让本地编辑是正确模型（🔴 #1 只是没用全）。
- `migration-runner.ts` 整批事务 + 唯一索引认领 + 冲突回滚重读，不会留半迁移库。
- 一致的 fail-closed：`primary-adapter.ts` 混批 / 缺适配器抛结构化错误；`getOrCreateSyncRecord` 竞态重读；`sortBranchesParentFirst` 缺父 / 成环整批放弃；`cleanupExpired` 事务内复核并保护未推送行。
- `contracts/` 从公开入口取类型 + `expectTypeOf` / `@ts-expect-error`，`project.json` 显式把 spec 纳入 typecheck 哈希，是真门禁；`contracts/local-adapter.spec.ts:43-57` 的替身写法是全套应统一的范本。
- 注释语言合规：非代码块的英文注释全包只有 2 行；`sideEffects:false` 诚实，无模块级全局注册表。

---

## 建议的修复顺序

1. **🔴 #1 / #7 / #8**：活查询与本地编辑的静默丢失，用户最先撞上。#1 把 `modified ? mergeExternal : replace` 收进 `createEntityRef`；#7 consumer 内按 task 隔离并 `refresh()`；#8 规则比较两侧归一成毫秒。
2. **🔴 #3 / #4 / #5**：同步分叉三件套。`restoreEntity` 改走 `mergeChanges`；分支 `fromChangeId` 跨端翻译且 fail-closed；`pull()` 补拉 filter 仓库。
3. **🔴 #2 / #6**：各一行修复（`relationMap.forEach`；`#shutdown` 首行作废在飞 connect）。
4. **测试基建**：mock adapter 改 `extends RxDBAdapterLocalBase`；抽 `fixtures/query-task-harness.ts` 经 `QueryManager` 拿生产 `result$`；`.coverage.spec` 改回行为命名并删掉非 I/O 的 `vi.mock`；`cleanup` 统一 `disconnectAll()`；固定 sleep 改 fake timers 或 spy。
5. **协议一致性**：`pushRepository` 失败契约统一为 throw；级联 DELETE 相位按 `requiredBy` 阻断；`pullRepository` 与 `pullBatch` 定一个分支口径；`diffMetadata` 改比 `Date.parse()`；count 路径统一传 `autoCache=false`；`RemoteSyncOptions` 要么接进去要么删。
6. **兜底清理与 API 面收敛**：删必填字段上的 `??` / `?.`（确需守卫处改 `throw`）；`index.ts` 改具名导出并补上述缺失类型；删 `types.local/remote`、幻影模块增强、`*InitData`；修 `proxy.ts:25` 泛型消掉 `createEntityRef: any`；补 TSDoc。
7. **拆长函数**：`pullBatchOnce` / `pullSingleRepository` 抽共用 `applyRepoRound`；`get_switch_version_actions` 按 case 拆 `applyForward{Insert,Update,Delete}`；`transitionMetadata` / `SchemaManager.init` / `RxDB.connect` 各拆三段。
