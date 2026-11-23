# `supabase-log-access-baseline` 相对 `origin/main` 的深度评审

评审日期：2026-11-23

## 评审对象与范围

- **评审分支**：`origin/supabase-log-access-baseline`，HEAD `7c3bf582d`。本地同名分支 `0e03919e2` 落后 origin 5 个提交，其中「123」式 WIP 提交（`4b84ec32e`、`92b5d2c4d`）携带实质改动，故以 origin 上的分支为准；最终 diff 已覆盖这些提交的全部内容。
- **基线**：`origin/main`，`fd8cdfa4a`。
- **差异规模**：138 个文件，新增 8,881 行，删除 607 行。
- **覆盖范围**：docker 参考 SQL 与生产权限/升级脚本、rxdb 核心（身份绑定、命名门禁）、rxdb-plugin-sync（分区拉取、范围清理、身份守卫）、rxdb-adapter-supabase（caller identity、Realtime、变更计数）、demo 应用、迁移与需求文档。
- 本评审**未修改任何业务代码**，发现的修复均未实施。

## 方法

按 code-review skill 的 max 档（recall 优先）执行：

1. **6 路独立 finder**：逐行扫描、删除行为审计、跨文件追踪、语言/框架陷阱（SQL 注入、search_path、复合类型按位置匹配、NULL 三值语义、bigint 精度）、包装器/代理正确性、CLAUDE.md 规范核对。
2. **逐候选验证（1 票 3 态）**：24 个候选分 6 组由独立验证 agent 裁决，结果 19 条确认、3 条 plausible、2 条证伪（核心 `#recordIdentityBinding` 死循环不成立——唯一冲突重试后必见对方已提交的绑定行；快照分页的「插入位移漏行」不成立——插入只造成重复读取，真正漏行的是删除位移）。
3. **带已验证清单的 sweep 补漏**：另得 3 条新候选，其中「未推送行守卫键编码不匹配」与「旧客户端 count/pull 口径分歧」经就地核实确认，进入主报告。
4. 全程并发控制在 3 个 agent 以内（避开网关 503）。

## 结论

15 条缺陷全部确认，均为**合入前应修**级别，集中在两条线：

- **升级与部署路径**（#1、#5、#8、#9、#13）：`RETURNS SETOF` 复合类型按列位置匹配 + 升级脚本把 bucket 列追加到表尾，升级库上分区拉取从第一天起整体失败，且回归套件对这条路径结构性失明；历史正文清理是空操作、升级前带敏感列的正文对所有登录用户可读；无 Realtime 服务的纯 Postgres 部署写路径全挂；旧客户端对分区实体永久空拉。
- **身份与数据隔离**（#2、#3、#4、#7、#10、#12、#15）：错误会话先写绑定行、后核对声明身份，一次登错号永久毒化本地库且无解绑路径；未推送行保护守卫是死代码，离线编辑在退出租户/规则收窄时被静默删除；同一令牌在两条身份编码路径下得到不同身份。

---

## 发现列表（15 条，按严重度排序）

### 1. 升级库上 `rxdb_pull_bucket_changes` 复合返回整体失败（HIGH）

- **位置**：`docker/sql/02-rxdb-sync-functions.sql:738`（`RETURNS SETOF public.rxdb_change`，SELECT 列表 800-818）；`docker/sql/production/rxdb-sync-access-upgrade.sql:17`
- **问题**：函数按全新安装时 `rxdb_change` 的物理列序（bucket 第 4 位）手写输出列，而 PostgreSQL 对复合类型**按列位置**匹配（列名被忽略）。升级脚本用 `ALTER TABLE ADD COLUMN` 把 bucket **追加到表尾**（第 17 位）。任何按迁移指南从旧版升级的生产库，第一次调用该 RPC 就把 `effective_type::varchar` 按位置塞进 `patch`(jsonb) 属性，`invalid input syntax for type json` 整体报错（第 4-6 列先静默错位）。全新 docker 栈 bucket 恰好在第 4 位，CI 因此全绿。
- **触发**：旧版 01 建库 → 按迁移指南执行升级 → 客户端拉任一分区实体 → RPC 报错，分区同步在升级库上不可用。
- **修复**：函数改 `RETURNS TABLE(...)`（按 OUT 参数序匹配，与物理列序解耦），或让升级脚本重建列序；升级回归用例应复刻旧列序后调用一次 `rxdb_pull_bucket_changes` 断言返回形状——当前 `prepare_sync_access_upgrade`（`supabase-sql-security-regressions.sql:4189`）不还原旧列序（测试栈 bucket 本来就在第 4 位，ADD COLUMN 是 no-op），`test_sync_access_upgrade` 只断言权限面、从不调用拉取 RPC，套件对这条路径结构性失明。

### 2. 未推送行守卫键编码恒不匹配，离线编辑在退区/收窄时被删（HIGH）

- **位置**：`packages/rxdb-plugin-sync/src/bucketed-scope-cleanup.ts:101`
- **问题**：`findRowsWithoutMappings` 的守卫 `pending.has(scopedEntityKey(scope, entityId))` **恒为假**：`queryPendingLocalChanges` 的 map 键经 `getRxDBChangeKey` 恒带 `rxid1:` 前缀（`getRxDBEntityIdentityKey` 编码），而 `scopedEntityKey` 只是裸拼 `namespace:entity:entityId`，两侧编码永远不相等。远端 DELETE 路径（`bucketed-pull.ts:484`）两侧都用 `getRxDBChangeKey` 才正常，现有测试只覆盖那条路径；清理路径零覆盖。
- **触发**：用户离线编辑一行（本地 change `remoteId=null`）→ 管理员把该用户移出租户（`removeBucketScope`），或实体规则收窄触发重快照的陈旧行清理（`applyScopedBatch`）→ 本地实体行被 `mergeChanges` 删除、离线编辑丢失，孤儿 change 行残留。违反 US-033 AC#8「还没推送的行保留」。
- **修复**：用 `getRxDBEntityIdentityKey(entityId)` 构造查找键与 map 键同口径，并补一条覆盖清理路径的回归。

### 3. 错误会话先写绑定行，声明身份核对滞后，本地库被永久毒化（HIGH）

- **位置**：`packages/rxdb-plugin-sync/src/SyncManager.ts:700`（机制在 `remote-backend.ts:95-143`）
- **问题**：`verifyRemoteBackend()` 先用**会话**身份 B 写死 `rxdb_sync_identity_binding` 指纹，之后 `bindRemoteBackend` 里的 `assertRemoteIdentity` 才核对**声明**身份并抛错。等用户把会话改回 A，`bindScopedIdentity` 比较 fingerprint(A) 与已存的 fingerprint(B) 永远抛 `IdentityMismatchError`；全仓库没有任何解绑/改绑路径（`rebindRemoteBackend` 只重置 `RxDBSync` 系列），这个库只能删库重建。
- **触发**：声明 identity={A} 的库第一次同步时登错号为 B → 绑定行写入 fingerprint(B) 后被正确拒绝 → 用户改回 A 再同步 → 永久 `IdentityMismatchError`。既有测试「会话换回声明身份」只 mock 了 `callerIdentity`、用内存库每用例新建，绕过了缺陷本身。
- **修复**：把声明身份核对（`assertRemoteIdentity`）移到 `bindScopedIdentity` 之前，或在声明了 `RxDBOptions.identity` 时用声明身份的指纹做绑定。

### 4. 新 RPC 无服务端能力门控，客户端先升级即拉取与状态 API 抛错

- **位置**：`packages/rxdb-plugin-sync/src/pull-batch.ts:202`；同源问题在 `check-repository-updates.ts:130-168`
- **问题**：`pullBatchOnce` 对每个实体无条件调用新 RPC `rxdb_entity_sync_info`（sync 关闭的实体也在内，`isRepositorySyncEnabled` 检查在调用之后），旧服务器上 PostgREST 返回 PGRST202 → `assert_postgrest_ok` 抛出，无 try/catch、无服务端版本门控，连非分区实体也拉不了。同源的 `checkRepositoryUpdates` 分区分支裸调 `getEntitySyncInfo`/`getCallerBuckets`/`getBucketSnapshotPoint`，使 `getRepositorySyncStatus` 等公共只读 API 从返回计数变成抛异常（含调用者刚被撤销 bucket 的 42501 竞态）。每轮 pull 每个实体还要重复打 2-3 次同一 RPC（`pull.ts:94`、`bucketed-pull.ts:76` 各自再调，无缓存）。迁移文档只承诺旧客户端对新服务器可用，反向组合没有任何降级。
- **触发**：升级 `@aiao/rxdb-adapter-supabase` 但未跑升级 SQL → 第一次 `pull()` 在第一个实体上抛 `SupabaseDataError`，整轮失败；demo 状态面板查询同样抛错。
- **修复**：增加服务端能力探测（版本 RPC 或对未知函数 404 探测一次后按实体缓存），跳过逻辑放到 sync-enabled 判断之后，并给状态查询的分区分支加错误处理。

### 5. 升级脚本历史正文清理与空表 JOIN 零删除，敏感正文仍可读

- **位置**：`docker/sql/production/rxdb-sync-access-upgrade.sql:45-49`
- **问题**：脚本注释声称「历史正文与 NULL bucket 都必须清掉」，但清理 DELETE 与**同一脚本刚创建**的 `rxdb_sync_entity`（升级时刻必然为空表）JOIN，实际一行都删不掉；真正的清理只在之后重新对实体执行 `rxdb_enable_sync_for_table` 时发生，而迁移文档没有任何一步要求重登记。升级前带完整业务正文（patch/beforeData/afterData 含敏感列）的旧日志行因此升级后继续按 `authenticated AND bucket IS NULL` 策略（`rxdb-change-grants.sql:54-68`）对任意注册用户可读，与脚本注释和 epic-015「正文由业务表裁决」的定案相悖。
- **触发**：生产库按迁移指南升级 → 清理匹配 0 行 → 历史敏感正文持续可读，直到（若有）后续重登记实体。
- **修复**：升级脚本内无条件清掉无法归属分区的历史正文（或明确要求操作者在同一事务里重登记分区实体），并把这一步与残留窗口写进迁移文档。

### 6. 快照 OFFSET 分页遇并发删除会永久漏掉被挤位的幸存行

- **位置**：`docker/sql/02-rxdb-sync-functions.sql:881`；客户端 `bucketed-pull.ts:278-317`（`rows.length < limit` 判完成、:566-573 完成后 cursor 跳到 snapshotPoint）
- **问题**：快照对实时业务表 `ORDER BY id OFFSET ... LIMIT ...` 分页、每页一个语句快照；快照点却在翻页前读取。精确交错：第 k 页之后、第 k+1 页之前删除一个低 id 行，原第 k+1 页边界首行左移到 OFFSET 之前，从此每页都跳过它；该行日志 id ≤ snapshotPoint 且此后不再变更，增量 `id > since` 永远不会重发，本地永久缺这一行直到重快照或该行再变更。插入只造成重复读取（无空洞），被删行自身的墓碑会经增量到达——漏的是被挤位的**幸存**行，与「快照+快照点后增量」一致性模型冲突且无补偿路径。
- **触发**：大 bucket 多页快照期间，另一客户端删除一个低 id 行 → 边界幸存行永久缺失。
- **修复**：改 keyset 分页（`WHERE id > :lastId ORDER BY id LIMIT n`），或快照完成后对快照点前范围做兜底校验。

### 7. 快照点水位不分分支，非祖先分支写入令 hasUpdates 恒真

- **位置**：`docker/sql/02-rxdb-sync-functions.sql:405`；客户端 `check-repository-updates.ts:152-160`
- **问题**：`rxdb_bucket_snapshot_point` 对 bucket 取**全部分支**的 MAX(id)，而客户端进度游标只随祖先链分支的拉取推进（`bucketed-pull.ts:79` 逐祖先分支传 branchId，服务端按分支过滤）。用户在非祖先分支（如 dev）对分区实体写入后，`remotePoint` 持续增长而 cursor 不动，`hasUpdates`/`pendingCount` 恒为「有更新」，且这些变更按分支过滤永远拉不下来，形成拉不空、清不掉的死账。US-033 把非 main 分支分区化列为 Out of Scope，但已交付的水位不尊重这条边界；#11 的伪造 bucket 还能远程触发此状态。
- **触发**：main 客户端已同步完毕，用户在 dev 分支对同 bucket 写入 → main 客户端状态检查永远显示 pendingCount≥1。
- **修复**：水位 RPC 按祖先链分支过滤（或返回按分支的 max id），状态查询与拉取使用同一分支口径。

### 8. scope 原始串与 origin 归一化严格比较，尾斜杠 URL 令同步全挂

- **位置**：`packages/rxdb/src/system/identity-binding.ts:252`；对照 `RxDBAdapterSupabase.ts:1382-1387`（`new URL(...).origin`）与 `apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts:41`（原样声明 config.url）
- **问题**：核心 `assertCallerIdentity` 用严格 `===` 比较 scope，适配器报告 origin 归一化值，demo 把只 trim 过的 `VITE_SUPABASE_URL` 原样声明为 `identity.scope`。env 带尾斜杠（或显式端口、路径段、大小写差异）时，同一项目被判成「换了身份」，pull/push/QueryCache 全部抛 `RxDBIdentityMismatchError`；库名按原始 scope 哈希所以打开正常，只有守卫比较炸，错误信息不提示是格式差异。无任何测试覆盖尾斜杠 URL。
- **触发**：`VITE_SUPABASE_URL=https://project.supabase.co/` → 每次同步被拒，用户已正常登录。
- **修复**：比较前对两侧 scope 统一归一化为 origin（或 demo 与文档用 origin 声明 scope），并补尾斜杠 URL 的回归。

### 9. 02 无条件建 realtime.send 触发器，无 Realtime 部署写路径全挂

- **位置**：`docker/sql/02-rxdb-sync-functions.sql:298`（触发器）、`:290`（函数体 `realtime.send` 调用）
- **问题**：02 无条件创建 AFTER INSERT 触发器 `rxdb_change_broadcast`，函数体硬调 `realtime.send(...)`。在没有 Realtime 服务的纯 Postgres + PostgREST 部署上（旧版 01-04 完全支持、旧 01 自己建 publication），每次日志插入（每个推送、每次经同步触发器的业务写）都以 `function realtime.send(...) does not exist` 整体回滚。docker 路径靠 init-db.sh 的等待兜住，文档化升级路径靠 grants 脚本报错，但裸跑 01-04 的部署没有任何守卫；注释声称「通知发不出去不会让推送失败」只对函数存在时成立。
- **触发**：自建栈只执行 01-04 → 第一次 push 即整个事务回滚，同步写路径全挂。
- **修复**：建触发器前用 `to_regprocedure` 探测 realtime.send，缺函数时不建触发器或函数体运行时跳过。

### 10. 同一令牌两套身份编码：service_role 被 syncIdentity 记成 anon

- **位置**：`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:558`（`syncIdentity` 的 accessToken 分支走 `identityFromAccessToken`，:1371-1374 只读 sub、读不到静默回退 anon）；对照 `callerIdentity()`（:247-250 走 `identityOfAccessToken`，service_role 返回 'service_role'、无 sub 的自定义 role 抛错）
- **问题**：`bindScopedIdentity` 消费的是 `syncIdentity()`，于是 service_role 客户端把自己同步下来的库绑成 fingerprint(anon)——同一设备上后续任何匿名访客打开同一库名都能通过身份守卫，读到管理员同步的数据（正是该特性要防的混库）。caller-identity.spec.ts 钉死的 service_role 口径恰好证明两条路径分叉。
- **触发**：管理端以 service_role 令牌（accessToken 配置、未声明 identity）同步 → 库绑定 anon → 匿名访客同设备打开同一库名 → 守卫通过。
- **修复**：`syncIdentity()` 的 accessToken 分支改走 `identityOfAccessToken`（与 `callerIdentity()` 同一编码器），保证一个令牌只有一个身份。

### 11. 写路径 bucket 信任客户端兜底，可伪造分区通知并远程卡死状态

- **位置**：`docker/sql/04-rxdb-utils-functions.sql:824`（COALESCE 链最后一档 `v_change->>'bucket'`）
- **问题**：`rxdb_insert_changes` 的 bucket 归一化在行读不到时（DELETE、行不存在、未登记实体的非 main 推送）落到客户端载荷里的 bucket，认证用户可以给自己的日志行盖上任意 bucket（如 `user:B`、`public`）。后果有界但真实：伪造行抬高受害者私有频道的虚假元数据通知，并抬升水位远程触发 #7 的「永久有更新」死账；拉取本身按分支过滤、正文由业务表在 RLS 下重派生，所以不能注入数据。全 SQL 写路径没有任何 bucket ∈ caller_buckets 校验，注释却自称「不能信任客户端自行填入的元数据」。
- **触发**：用户 A 在自己的非 main 分支推送 DELETE（行读必落空）、载荷带 `bucket='user:B'` → 日志行落入 B 的分区流。
- **修复**：删掉客户端 bucket 兜底档，或对最终 bucket 做 `= ANY(rxdb_caller_buckets())` 校验。

### 12. 分区拉取事务缺主检出守卫，换挂中途落库写错表集

- **位置**：`packages/rxdb-plugin-sync/src/bucketed-pull.ts:469`（`applyScopedBatch`）、`bucketed-scope-cleanup.ts:32-34`
- **问题**：legacy 拉取路径在每轮写业务表的事务内复查 `assertSyncOnMainCheckout`（`pull-repository.ts:608`，US-314 B1.4），新分区路径的 `applyScopedBatch`（写业务表 + bucket 行 + 进度）与 `removeBucketScopeInTransaction`（删业务行）事务内都没有这个复查。多页快照跨大量 await 期间用户把实例换挂到可写检出位，后续落库就写进检出位的表集，主检出位数据与检出位混写；入口检查只在开始瞬间生效。
- **触发**：大分区仓库多页快照进行中，用户切换到可写检出位 → 远端行、bucket 映射与进度写进检出位表集。
- **修复**：两处事务体首行各加一次 `assertSyncOnMainCheckout(executor.tableSet, 'pullRepository')`。

### 13. count 查询不过滤 bucket 而拉取过滤，旧客户端永久空拉

- **位置**：`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:596`（`getChangeCount` 的 REST count 查询无 `bucket IS NULL` 过滤）；对照 `docker/sql/02-rxdb-sync-functions.sql:709`（`rxdb_pull_changes` 加 `AND change.bucket IS NULL`）
- **问题**：RLS 策略（`rxdb_change_read_by_bucket`）让认证用户能看到自己 bucket 的行——旧客户端每轮 count>0、拉取 0 行、游标不动、`pullableCount` 随每次写入增长，空拉循环不止。迁移文档（`supabase-sync-access.md:97`）称旧客户端「拉取与推送不受影响」，对已登记分区的实体不成立。
- **触发**：服务端升级并把实体登记为分区 → 仍跑旧 bundle 的手机每次 checkRepositoryUpdates 都得到 count>0 → pull 返回 0 行 → 永久显示有更新。
- **修复**：count 查询与拉取同口径（bucket IS NULL），或对分区实体把计数路由到新 RPC；文档补上旧客户端对分区实体的限制。

### 14. accessToken 模式监听器静默失效，Realtime 身份不随令牌轮换

- **位置**：`packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:1247`（`auth.onAuthStateChange` 抛错被裸 catch 吞掉）
- **问题**：用 `accessToken` 回调配置的客户端（文档支持的 JWT 注入方式）永远不会轮换 Realtime 身份：supabase-js 该模式下 `auth` 是访问即抛的 Proxy，监听器安装失败后静默 return，而 `#updateRealtimeIdentity`/`#rotateRealtimeChannels` 只由这个监听器触发。令牌从匿名换成用户 A、或 A 换成 B 而不重新 connect 时，私有频道仍按旧身份加入（频道授权在加入时裁决）、`#realtimeIdentityKey` 不更新，通知停留在旧身份的 bucket 上；socket 层令牌虽由 supabase-js 自刷新，适配器的频道集合与身份键从不重建。
- **触发**：应用传 `{ client, accessToken: async () => latestToken }`，用户换会话不重连 → 通知停留在旧身份。
- **修复**：对 accessToken 模式在每轮 Realtime 周期比对当前令牌身份并轮换，或安装失败时显式告警并改为按 connect 轮换。

### 15. 身份不匹配抛两套互不兼容错误类，应用必漏处理一半

- **位置**：`packages/rxdb-plugin-sync/src/scoped-sync.ts:55`（插件 `IdentityMismatchError`）；对照核心 `identity-binding.ts:158`（`RxDBIdentityMismatchError`）
- **问题**：同一个「会话与库身份不符」事故会抛两种互不继承的错误类（字段也完全不同），两者都从 `syncManager.pull()/push()` 裸抛，文档分别教应用 catch 各自一个。应用按文档只处理其中一类时，同一事故在首次毒化同步（核心类）与之后每次重试（插件类）之间切换，错误处理必漏一半。
- **触发**：A 的会话过期、B 在同一浏览器登录后对 A 的库 pull → 应用只 catch `RxDBIdentityMismatchError` 时插件类裸抛导致崩溃或泛化报错。
- **修复**：让插件错误继承核心错误类（或统一为一个类），或让 `bindScopedIdentity` 抛核心类并保留插件字段。

---

## 补充观察（未入 15 条上限）

以下条目已核实或部分核实，但严重度/触发概率低于主报告，因 15 条上限未入列：

| # | 观察 | 结论 |
| --- | --- | --- |
| S-1 | `check-repository-updates.ts:153` 状态查询按 bucket `find` 任意取一条 progress，同 bucket 多指纹并存（单桶失败时旧指纹行滞留）时读数可双向失真 | 确认，机制成立；触发需「filter 指纹变化 + 某桶拉取失败」组合，窄 |
| S-2 | bucketed pull 每页 3 次 `verifyRemoteBackend`（未缓存的 backendId RPC + `RxDBSync` 全表读），大首拉放大到分钟级 | 确认，属有意安全取舍；每页 3 次中约 1 次（post-apply）冗余可删 |
| S-3 | 自定义 role、无 sub 的 JWT 会让 auth 监听回调在 generation 递增前抛错，Realtime 轮换卡死且无重试定时器 | PLAUSIBLE；报错响亮、下一次合法 auth 事件自愈，触发窄（手工注入 `setSession()`） |
| S-4 | `.env.example` 默认开匿名登录（`ENABLE_ANONYMOUS_USERS=true`），匿名用户拿 authenticated 角色可读全部未分区日志 | 技术事实成立，但分支内四处文档明示这是 demo 取舍并警告生产关闭；仅同行注释措辞有误导性 |
| S-5 | `bindScopedIdentity` 事务竞态分支抛错时漏写 `syncState.lastError`，与事务外分支口径不一 | 确认，低危，下一次尝试会走报告分支 |
| S-6 | `removeBucketScopeInTransaction` 返回值恒真（`progress.id.length > 0`），无法表达「什么都没删」 | 机制确认，但后果被 `bucketed-pull.ts:203` 的无条件 `persistedProgress = true` 抵消，无害异味 |
| S-7 | 规范类：`scoped-sync.ts` 10 个公开导出、`scoped-sync.entity.ts` 3 个实体类、adapter 6 个新方法与 2 个新接口类型全部缺 TSDoc（违反 CLAUDE.md「新包/新导出必须补齐 TSDoc」）；`RxDB.ts:2362` 嵌套 4 层（违反「嵌套 ≤ 3 层」）；核心包 4 个新导出（`RXDB_ANONYMOUS_SUBJECT`、`RxDBIdentityMismatchError`、`getRxDBIdentityDatabaseName`、`type RxDBIdentity`）不符合「只许 Commit\*/WorkingTree\*」命名门禁，且 `scripts/audit/api-surface.mjs` 的例外清单由本 PR 同步扩写（自查自放）；US-035 故事仍标 Backlog、AC 全 ⬜ 而实现已随本分支落地；`#createRealtimeChannels` 里 `getCallerBuckets` 失败被静默 catch（「无 fallback 兜底」边缘） | 确认；其中命名门禁与 US-035 状态需要用户裁决口径 |
| S-8 | `project.json` 与 US-225-evidence.md 的用例计数「45」与实际 CASES 数组 46 个用例不符 | 元数据陈旧，无行为影响 |
| S-9 | 已证伪：核心 `#recordIdentityBinding` 的 `for(;;)` 死循环风险（唯一冲突重试后必见对方已提交的绑定行，会 return 或抛错）；快照分页的「插入位移漏行」（插入只右移，造成重复读取而非空洞） | 不构成缺陷 |

## 与上一轮评审的关系

上一轮评审文档（曾提交在本分支 `0e03919e2`、后被 WIP 提交 `92b5d2c4d` 删除）针对旧快照 `47e1e531a`，列出 R-01~R-16。当前 tip 经 `4b84ec32e`（1,074 行 SQL/插件重写）等提交大幅演进：

- 方案 M 的**元数据化**已落地：正文剥离触发器（`02:191-210`）、拉取时按调用者身份从业务表重派生（`02:774-824`）、按 bucket 的 RLS——旧 R-01（日志带正文泄露）的设计前提已被替换。
- 但方案 M 的**「单独成表」没有做**：分区日志与旧日志共用 `rxdb_change`（加 bucket 列），这成为本报告 #1（升级列序）、#6（水位分支）、#13（旧客户端 count/pull 分歧）的共同载体。
- 本报告未逐一复核 R-01~R-16 每条在当前 tip 的关闭状态；建议先修 #1~#15，再按旧清单做一次关闭复核。

## 附：验证执行记录

- Finder 阶段：6 路 agent（A 5 候选 + 3 观察、B 4、C 7、D 5、E 4、Conventions 7），全部在 /tmp 分区的 diff 文件与导出树（`git archive origin/supabase-log-access-baseline`）上只读执行，未运行任何构建或测试。
- 验证阶段：6 组验证 agent 覆盖 24 个候选（19 确认、3 PLAUSIBLE、2 证伪）；Conventions 7 条与 sweep 2 条由主会话就地核实。
- 未执行：`test-all`、coverage gate、真栈 SQL 回归复跑。SQL 相关发现基于对 SQL 文本、PostgreSQL 语义（复合类型位置匹配、ADD COLUMN 追加、RLS）与既有测试套件的静态推演；#1、#5、#6、#9、#11、#13 建议在隔离栈上用动态探针做最终确认。
