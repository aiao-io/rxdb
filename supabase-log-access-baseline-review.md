# `supabase-log-access-baseline` 相对 `main` 的全量深度评审

## 评审结论

当前提交 `47e1e531a15fa641fbb7f4139d7e22b46d915814` 相对 `main` `fd8cdfa4aa126a0e883ab7d1d16a33933d0a37ed` 的实现，已经覆盖分区同步、身份绑定、生产权限、快照分页、Realtime 频道和 QueryCache 守卫的大部分骨架，但授权边界仍未闭合。

结论是 **不可按当前实现宣称 US-033 已完成，也不可把 US-035 / US-036 当成已具备可验收实现**。

最高优先级问题是分区日志仍保存并返回完整业务正文。业务表上的 RLS 和列权限无法约束已经写进 `rxdb_change.beforeData` / `afterData` 的敏感列。未授权 bucket 还可以调用快照点和快照 RPC，形成存在性探测和潜在数据读取路径。

本报告记录当前快照的证据和验证结果，没有修改业务实现。

## 快照与范围

- 评审分支：`supabase-log-access-baseline`
- 评审 HEAD：`47e1e531a15fa641fbb7f4139d7e22b46d915814`
- 基线：`main`，`fd8cdfa4aa126a0e883ab7d1d16a33933d0a37ed`
- 工作区：`/Users/jimmy/.codex/worktrees/9dd2/rxdb`
- 差异规模：137 个文件，新增约 8,386 行，删除约 607 行
- `git diff --check main...HEAD`：通过
- 旧评审文件：`pr-226-review.md`，对应旧快照 `a81b9081ae13eee8d4478f44dafa8208568212db`

覆盖范围包括需求与验收状态、参考 SQL、生产权限、迁移、身份绑定、分区同步插件、Supabase adapter、Realtime、QueryCache、Supabase demo、文档和已运行测试。

## 严重问题摘要

| 编号 | 严重度 | 状态 | 结论 |
| --- | --- | --- | --- |
| R-01 | P0 | 动态确认 | 分区日志保存完整业务正文，绕过业务表 RLS 与列权限 |
| R-02 | P1 | 动态确认 | 快照没有按调用者可读列构造正文，部分列权限直接失败，表级权限返回敏感列 |
| R-03 | P1 | 动态确认 | 未授权 bucket 可以调用快照点和快照 RPC |
| R-04 | P1 | 静态确认 | bucketed entity 配成 `SyncType.Full` 时绕过分区同步路径 |
| R-05 | P1 | 静态确认 | 一个 bucket 失败时仍推进传统全局游标，可能永久漏拉 |
| R-06 | P1 | 静态确认 | `rebindRemoteBackend()` 没有处理分区进度与本地分区行 |
| R-07 | P1 | 静态确认 | 快照分页期间没有持续核对 remote backend identity |
| R-08 | P1 | 静态确认 | QueryCache 远端身份守卫只比较 subject，不比较 Supabase scope |
| R-09 | P1 | 静态确认 | plugin 的数据库名没有包含 Supabase backend scope |
| R-10 | P1/P2 | 静态确认 | 核心身份系统与同步插件身份系统不一致，匿名语义也不一致 |
| R-11 | P1 | 静态确认 | 两个不同身份首次绑定同一旧库存在双绑定窗口 |
| R-12 | P1 | 动态确认 | PostgreSQL view 被 RLS 自检误判为不存在或未启用 RLS |
| R-13 | P2 | 动态确认 | SQL filter 的 NULL 语义与核心求值器不一致 |
| R-14 | P1/P2 | 静态确认 | 迁移保留历史正文和 NULL bucket，没有完成清理或回填契约 |
| R-15 | P1 | 动态确认 | 复用同一个 adapter 切换 token 时旧 Realtime 频道仍然存活 |
| R-16 | P1/P2 | 待验证风险 | Repository destroy 没有作废 QueryCache primary 的迟到响应 |

## R-01：分区日志仍保存完整业务正文

**严重度：P0。动态确认。**

### 影响

分区同步的定案是日志只保存授权元数据，正文通过调用者身份读取业务表。当前触发器和推送入口仍把完整 `NEW` / `OLD` 转成 JSON 写入 `patch`、`beforeData` 和 `afterData`。调用者即使只能读取业务表的部分列，也可以从自己有权读取的 `rxdb_change` 分区日志中拿到敏感列。

这使业务表的 RLS、列级 SELECT 权限和“看不见的行等于不存在”全部失去边界。敏感字段一旦进入历史日志，后续撤销业务表权限也不能消除已经存在的泄露。

这直接违反 Epic-015 的正文裁决和 US-033 的分区日志契约。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:80-90`：INSERT 触发器把 `pg_catalog.to_jsonb(NEW)` 同时写入 `patch` 和 `afterData`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:96-110`：换 bucket 时新区 INSERT 日志仍写完整 `NEW`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:114-151`：UPDATE 通过遍历整行 JSON 构造 patch、inverse patch、beforeData 和 afterData。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/04-rxdb-utils-functions.sql:782-800`：推送入口把载荷中的正文写进 `rxdb_change`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/production/rxdb-change-grants.sql:26-60`：生产脚本只对日志表做分区 RLS 和 SELECT 授权，没有移除正文列或阻止正文进入日志。

真栈探针在业务表增加 `secret` 列、只授予调用者部分业务列权限后得到以下结果。

```text
业务表直接读取看不到 secret
change_secret=TOP-SECRET-COLUMN
```

业务表的列权限没有作用到日志表 JSON 内部字段。该结果是动态确认，不是推测。

### 修复方向

将分区日志改为独立 metadata log，至少只保存 namespace、entity、entityId、bucket、type、branchId、cursor 和时间等元数据。增量拉取只返回元数据，正文由调用者使用业务表查询并接受该表的 RLS 与列权限。删除事件只返回删除元数据。

已有 `rxdb_change` 正文必须有明确迁移方案，包括历史正文清理、旧客户端兼容窗口、NULL bucket 回填和部署顺序。不能只在新触发器中停止写正文而保留旧正文继续可读。

## R-02：快照没有按调用者可读列构造正文

**严重度：P1。动态确认。**

### 影响

快照 RPC 直接对业务表做 `SELECT table_data.*`。当调用者只有部分列权限时，快照会整体失败。当调用者有表级 SELECT 权限但应用逻辑只允许部分字段时，快照会把完整敏感列返回。

这与“正文由业务表裁决”的要求不兼容，也没有覆盖 view、无可读列、无可读主键等边界。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:588-632`：`rxdb_pull_bucket_snapshot()` 使用动态 SQL。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:616-628`：内层查询是 `SELECT table_data.*`，之后整体 `to_jsonb(row_data)`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:480-530`：adapter 直接接受 RPC 返回的完整 JSON 行。

动态结果分为两类。

- 部分列权限：RPC 报 `permission denied for table`。
- 表级 SELECT：快照返回敏感列。

US-033 的 spike 已经要求通过 `has_column_privilege()` 动态构造可读列列表，但当前实现没有落地该策略。

### 修复方向

快照 RPC 需要根据调用者角色和目标表动态计算可读列，至少保证主键、bucket 列、同步实体需要的字段和实体 schema 所需字段的契约。没有足够列权限时返回明确错误。对 view 要按 view 的可读列执行，不要假设所有对象都是普通表。

需要补充部分列、无可读列、无可读主键、view 和过滤字段不可读的真栈回归。

## R-03：未授权 bucket 可以调用快照点和快照

**严重度：P1。动态确认。**

### 影响

调用者可以传入不在 `rxdb_caller_buckets()` 返回集合中的 bucket，探测该 bucket 的最大变更 ID，并调用快照 RPC 查询对应业务表。快照 RPC 是 `SECURITY INVOKER`，因此当业务表权限宽松时会直接返回私有数据，当业务表权限收紧时至少泄露存在性和水位信息。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:334-350`：`rxdb_bucket_snapshot_point()` 是 `SECURITY DEFINER`，只按 namespace、entity、bucket 求 `MAX(id)`，没有校验 bucket 授权。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:588-632`：`rxdb_pull_bucket_snapshot()` 只校验实体是否 bucketed，没有校验 `p_bucket` 是否属于调用者。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/production/rxdb-change-grants.sql:112-120`：生产脚本把这两个 RPC 对 `anon` 和 `authenticated` 都开放。

真栈探针中，调用者的 buckets 为 `{public}`，但请求私有 bucket 得到。

```text
anon caller buckets = {public}
unauthorized_point=11393
unauthorized_snapshot=[{"id": "private-row", "value": "PRIVATE-VALUE", "visible": false, "rxdb_bucket": "tenant:private"}]
```

### 修复方向

所有以 bucket 为参数的 RPC 必须在服务端显式验证 `p_bucket = ANY(rxdb_caller_buckets())`。快照点和快照都必须拒绝未授权 bucket。日志 RLS 只能保护日志查询，不能替代 RPC 参数授权。

需要补充 anon、用户 A、用户 B、未授权租户、授权变化和不存在 bucket 的差异化回归，避免把“空结果”错误地当成授权通过。

## R-04：bucketed entity 可能绕过按区 pull

**严重度：P1。静态确认。**

### 影响

批量 pull 只在 `syncType === 'filter'` 时跳过实体。它不会预先查询远端实体是否 bucketed。bucketed entity 配成 `SyncType.Full` 时进入传统批量路径，不调用 bucket snapshot、bucket changes 或 bucket progress。

结果是同一实体可以一边拥有服务端分区授权，一边走不带分区语义的传统游标。客户端可能拿不到正确的分区快照，也可能把分区进度写进错误的 `RxDBSync` 记录。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/pull.ts:48-63`：无 repository filter 时优先调用 `pullBatch()`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/pull-batch.ts:176-205`：批量枚举只跳过 `filter`，没有判断远端实体 `bucketed`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/pull-repository.ts:529-541`：只有逐仓库路径才调用 `pullBucketedRepositoryIfSupported()`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/apps/dev-rxdb-supabase/src/app/setup_rxdb_wa-sqlite.ts:57-65`：demo 当前配置的是 `SyncType.Full`。

当前 demo 的 Todo 没有 bucket 列，因此 demo 本身不能证明该问题已经触发。问题在同步路由上已经成立。

### 修复方向

统一批量与逐仓库路径的远端能力判定。至少在发现远端实体是 bucketed 而本地路径不会执行 bucket pull 时 fail-fast，不能静默回退到全局同步。更稳妥的做法是将 bucketed entity 从批量请求中分离并交给按区 pull。

## R-05：一个 bucket 失败后仍推进传统全局游标

**严重度：P1。静态确认。**

### 影响

一个授权 bucket 拉取失败时，代码把失败放进 `failures` 后继续处理其它 bucket。随后从所有分区进度中取最大 cursor，写回传统 `RxDBSync.lastPullRemoteChangeId`。健康 bucket 的较大 cursor 可能越过失败 bucket 的日志。

后续传统路径或状态判断使用这个全局 cursor 时，失败 bucket 的变更可能永久被跳过。文档声称失败分区下次从自己的进度继续拉，但实现仍维护一份会覆盖分区语义的全局水位。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/bucketed-pull.ts:148-176`：每个 bucket 单独捕获错误并继续。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/bucketed-pull.ts:194-209`：所有分区结束后取 `cursors.reduce(... Math.max(...))` 并写 `repoSync.lastPullRemoteChangeId`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/check-repository-updates.ts:113-145`：状态查询继续读取传统 `RxDBSync.lastPullRemoteChangeId`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/website/docs/adapters/supabase.md:183-185`：文档承诺失败分区保留自己的进度并从自己的进度续拉。

已有测试 `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/__tests__/bucketed-pull.spec.ts:438-463` 只验证失败 bucket 后续恢复，没有断言失败后 `hasUpdates` 仍然为真，也没有验证健康 bucket 的大 cursor 不会覆盖失败 bucket。

### 修复方向

bucketed entity 的状态和下一轮拉取都必须以 `RxDBSyncBucketProgress` 为唯一进度来源。传统全局 cursor 至少不能在存在失败 bucket 时推进，`hasUpdates` 必须显式反映失败分区仍有未完成工作。补充“健康 bucket cursor 更大、失败 bucket 仍有变更”的回归。

## R-06：remote backend rebind 没有处理分区进度

**严重度：P1。静态确认。**

### 影响

`rebindRemoteBackend()` 只重置 `RxDBSync` 的传统同步记录。`RxDBSyncBucketProgress` 和 `RxDBSyncBucketRow` 也保存 snapshot point、offset、cursor、snapshotRunId、remoteBackendId 与本地分区行，但改绑时没有删除、重置或核验它们。

切换到重建后的远端后，新的远端可能复用旧分区的 snapshot point、offset 和 cursor，导致快照缺行、增量漏拉或旧远端本地行残留。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/remote-backend.ts:245-258`：事务只枚举 `RxDBSync` 并更新 `lastPullRemoteChangeId`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/scoped-sync.entity.ts:16-24`：分区进度和本地分区行拥有独立表与 `remoteBackendId` 字段。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/bucketed-pull.ts:238-274`：读取既有分区 progress 时没有核对 `progress.remoteBackendId`。

### 修复方向

rebind 必须在同一事务内处理分区进度和分区行。可以删除全部旧 backend 的分区 progress 与本地 scope rows，也可以保留后通过严格 backend 比对强制重新快照，但不能只重置传统同步表。为 rebind 增加旧远端、重建远端和 bucket snapshot 的真实回归。

## R-07：快照分页期间没有持续核对 backend identity

**严重度：P1。静态确认。**

### 影响

开始快照时记录了 `snapshotPoint` 和 `remoteBackendId`，但在之后的每一页请求和落库之间没有核对远端身份。远端在分页期间被重建或 adapter 切换时，新旧远端的快照页可能混入同一个本地 scope，并把错误 offset 持久化。

当前只在快照完成后进入增量阶段前调用一次 `sm.verifyRemoteBackend()`，无法保护已经落库的早期页。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/bucketed-pull.ts:248-275`：创建 progress 时记录 backend identity。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/bucketed-pull.ts:277-306`：分页调用 `pullBucketSnapshot()` 并立即 `applyScopedSnapshot()`，没有分页前后的 identity check。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/bucketed-pull.ts:308-323`：backend check 只出现在快照循环结束后的增量阶段。

### 修复方向

每个快照页请求前后都核对 backend identity，并把核对与本页落库放进同一可恢复协议。identity 变化时废弃当前 snapshotRun，清理本 run 的 rows 和 progress，重新从新远端建立快照。

## R-08：QueryCache 远端身份守卫只比较 subject

**严重度：P1。静态确认。**

### 影响

核心 `RxDBIdentity` 的身份是 `scope + subject`。`scope` 用于区分不同 Supabase project。QueryCache 的远端守卫却只要求 `callerIdentity()` 返回值等于 `identity.subject`。

同一个用户 subject 连接到另一个 Supabase project 时，守卫仍可能通过。QueryCache 的 metadata、findByIds、写入口会在错误的 backend 上执行，破坏跨后端的数据隔离。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/system/identity-binding.ts:30-48`：核心身份明确包含 `scope` 和 `subject`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/system/identity-binding.ts:230-248`：`assertCallerIdentity()` 只比较 `reported === identity.subject`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/repository/Repository.ts:692-700`：QueryCache 入口使用身份守卫远端。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:224-226`：Supabase adapter 的 `callerIdentity()` 只返回 JWT subject，不返回 project scope。

### 修复方向

远端身份接口必须同时报告 backend scope 和 subject，或者由 QueryCache 入口在 Supabase adapter 层明确核对 project identity。不要把 scope 只保存在本地 `RxDBIdentity` 而留在远端守卫之外。

## R-09：plugin 数据库名没有 backend scope

**严重度：P1。静态确认。**

### 影响

同步插件的 `scopedDatabaseName()` 只根据 `kind + userId` 计算 FNV-1a 摘要，没有包含 Supabase project scope。同一用户在两个 Supabase project 使用相同 base name 时得到同一个数据库名。

这与 US-035 AC#2 要求的“不同 backend 也隔离”冲突。核心 RxDB 的 `getRxDBIdentityDatabaseName()` 已经把 scope 纳入 SHA-256 identity key，但 demo 和同步插件文档仍使用另一套命名函数。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/scoped-sync.ts:2-5`：`ScopedSyncIdentity` 没有 scope。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/scoped-sync.ts:59-67`：数据库名只由 `kind` 和 FNV-1a fingerprint 组成。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/website/docs/adapters/supabase.md:187-210`：文档指导用户用该函数生成身份库名。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/system/identity-binding.ts:98-124`：核心命名函数的设计则明确包含 scope。

### 修复方向

删除同步插件的第二套数据库命名身份，统一复用核心 `RxDBIdentity`、scope、摘要算法和数据库命名函数。若保留兼容 API，必须显式增加 backend scope 并给旧名字提供迁移或拒绝策略。

## R-10：存在两套互不兼容的身份系统

**严重度：P1/P2。静态确认。**

### 影响

核心系统使用 `RxDBIdentity { scope, subject }`、SHA-256 和 `RXDB_ANONYMOUS_SUBJECT = 'anon'`。同步插件使用 `ScopedSyncIdentity { kind, userId }`、FNV-1a-64 和 `kind = 'anon' | 'user'`。

Supabase adapter 同时提供两套语义。`callerIdentity()` 对 JWT 返回 subject，`syncIdentity()` 对 `is_anonymous` 返回 anon。匿名登录、未登录 anon key、不同 project、刷新 token 和数据库命名的判断可能落在不同身份上。

这会让“核心库身份绑定通过”与“同步插件身份检查通过”出现不一致，尤其在 demo 这种同时安装核心和 sync plugin 的入口中。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/system/identity-binding.ts:30-48`、`:98-112`：核心 scope/subject/SHA-256 模型。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-sync/src/scoped-sync.ts:1-67`：插件 kind/userId/FNV-1a 模型。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:212-226`：caller identity 语义。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:532-543`：sync identity 语义。

### 修复方向

统一一套身份模型，明确 backend scope、匿名访问、匿名登录用户和 authenticated user 的语义。三框架入口、QueryCache、sync plugin、adapter 和文档必须使用同一个身份对象或同一转换函数。

## R-11：不同身份首次绑定同一旧库存在双绑定窗口

**严重度：P1。静态确认。**

### 影响

两个不同身份并发首次打开同一个未绑定旧库时，绑定行名称包含完整 identity key。A 写 `__rxdb_identity__:A`，B 写 `__rxdb_identity__:B`，唯一约束不会冲突。两边都可能在本次事务内读到“没有绑定”并成功连接，后续打开才发现 foreign binding。

这违反 US-035 “打开时核对身份、换账号不混数据”的即时阻断要求。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/RxDB.ts:2326-2331`：绑定行的 name 包含完整 identity key。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/RxDB.ts:2345-2361`：事务读取全部 migration 行后，按身份 key 创建不同名称的 binding row。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/system/identity-binding.ts:201-209`：只按行名收集已绑定 key，并不能把不同 key 的首次插入变成同一冲突点。

### 修复方向

使用固定 singleton binding row，通过数据库锁、原子 compare-and-set 或唯一固定 key 保证不同身份只能竞争同一行。补真实不同身份并发打开同一旧库的多标签页测试。

## R-12：PostgreSQL view 的 RLS 自检失败

**严重度：P1。动态确认。**

### 影响

US-036 要求公开 view 可以作为只读浏览实体，并且连接自检不能把 view 报成缺表或未启用 RLS。当前 `rxdb_check_rls()` 只接受 `relkind IN ('r', 'p')`，PostgreSQL view 的 relkind 是 `v`。

真实 view 探针返回 `exists=false`。adapter 默认 failure mode 会告警，`failureMode: 'throw'` 会拒绝连接。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/04-rxdb-utils-functions.sql:342-390`：RLS 自检查询限制 `c.relkind` 为普通表和分区表。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:1046-1056`：`exists !== true || rlsEnabled !== true` 统一视为 RLS 失败。
- US-036 验收表要求 view 在默认模式和 `failureMode: 'throw'` 模式均能连接，但当前测试未覆盖真实 PostgreSQL view。

### 修复方向

明确 view 的安全契约。若 view 的安全边界由底层表 RLS 提供，连接自检应识别 view 并按设计返回可验证状态。若要求 view 自身开启安全策略，则应在 SQL 和文档中明确 PostgreSQL 版本与部署限制。补 view、普通表和分区表三类真栈测试。

## R-13：SQL filter 的 NULL 语义与核心求值器不一致

**严重度：P2。动态确认。**

### 影响

核心内存求值器把 NULL/undefined 对 `!=`、`in`、`notIn`、比较和字符串操作统一先短路为 false。SQL 三值逻辑和当前 PL/pgSQL 实现对 `!=`、`notIn` 的 NULL 行返回 true。

相同的实体规则在快照和增量过滤中可能得到不同集合，造成本地行错误加入或未清理。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/query/query-matching.utils.ts:187-225`：`NULL_EXCLUDED_OPERATORS` 对非空集合和比较运算在 NULL 上返回 false。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/02-rxdb-sync-functions.sql:355-478`：SQL rule evaluator 对字符串和集合运算未统一实现核心的 NULL 短路。
- SQL 真栈探针得到。

```text
sql_notIn_null=true
sql_notEqual_null=true
```

### 修复方向

把 filter 编译成统一的 SQL 条件，或者使 SQL evaluator 严格复刻核心 NULL、空数组和嵌套 combinator 语义。补同一规则在核心、SQLite、PGlite 和 Supabase 快照/增量路径上的矩阵测试。

## R-14：迁移后仍保留历史正文和 NULL bucket

**严重度：P1/P2。静态确认。**

### 影响

新协议要求分区日志只保存元数据，但初始化和生产升级脚本会把旧 `patch` / `inversePatch` 回填到 `beforeData` / `afterData`，并保留旧日志中的 NULL bucket。生产升级说明没有提供历史正文清理、NULL bucket 回填、旧协议读取窗口和安全验收标准。

因此即使新触发器修正，升级后的生产库仍可能暴露历史完整正文，未分区旧日志也继续受旧的 authenticated 读取边界影响。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/01-rxdb-system-tables.sql:37-54`：初始化脚本从旧 patch/inversePatch 回填正文列。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/production/rxdb-sync-access-upgrade.sql:17-20`：升级只增加 bucket 列和索引，没有清理旧正文或回填 bucket。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/docker/sql/production/rxdb-change-grants.sql:38-60`：生产权限仍允许 authenticated 读取未分区旧日志。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/website/docs/migration/supabase-sync-access.md:47-64`：迁移说明强调事务顺序和权限，但没有正文清理和历史暴露的验收步骤。

### 修复方向

把历史数据迁移策略写进同一协议。至少明确 NULL bucket 的安全含义、旧日志是否继续支持、历史正文是否立即 NULL 化、旧客户端兼容期以及清理前后的权限测试。

## R-15：复用同一个 adapter 切换 token 时旧 Realtime 频道仍存活

**严重度：P1。动态确认，属于生命周期风险。**

### 影响

正常文档流程要求销毁旧 RxDB 实例后按新身份创建新库。当前 adapter 自身没有 token 变更监听，也没有在 token 变更时自动撤销旧频道。若调用方复用同一个 Supabase client 和 adapter，只切换 access token，旧用户的私有频道仍然可以收到旧 bucket 的广播。

这会把旧身份的变更元数据送进新身份生命周期。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:151-178`：频道只在 adapter close 时统一移除。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:1075-1098`：创建频道时按当前 token 获取 buckets，但没有 token 变更后的撤销机制。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-adapter-supabase/src/RxDBAdapterSupabase.ts:1153-1173`：重连只重建当前数组中的频道。

真栈探针步骤。

1. A 建立 `user:A` 私有频道。
2. 只切换同一 client 的 token 到 B，不销毁 adapter。
3. 写入 A bucket。
4. 旧频道仍为 `SUBSCRIBED`，并收到 A bucket 通知。

### 修复方向

把身份变更纳入 adapter 生命周期。检测到 token subject 或 scope 变化时先移除全部旧频道，再按新身份重建，并使旧回调在 channel generation 不匹配时失效。即便产品要求销毁旧 RxDB，也应对复用 adapter 的错误调用提供隔离保护。

## R-16：QueryCache 迟到响应可能在 Repository destroy 后落库

**严重度：P1/P2。待验证风险。**

### 风险

QueryCache 只有在 `invalidateInflight()` 递增 generation 后，迟到响应才会跳过 `upsertMany()`。Repository 的 `destroy()` 当前只清理 QueryCache session 和 query manager，没有显式调用当前 primary 的 `invalidateInflight()`。

如果 destroy 后仍有一个旧 `findByIds` 响应返回，理论上可能把旧身份或旧生命周期的数据写入本地缓存。当前需要真实延迟响应测试确认 primary 的其它生命周期清理是否间接覆盖该路径。

### 证据与根因

- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts:334-338`：只有 `invalidateInflight()` 会递增 generation。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb-plugin-querycache/src/QueryCacheEngine.ts:864-875`：响应回来后仅在 `#isCurrent(generation)` 为真时跳过 `upsertMany()`。
- `/Users/jimmy/.codex/worktrees/9dd2/rxdb/packages/rxdb/src/repository/Repository.ts:235-243`：`destroy()` 没有调用 `#queryCachePrimary?.invalidateInflight()`。

### 修复方向

补充延迟 remote response、destroy、重新创建同一实体 QueryCache 的回归。若风险成立，在 Repository destroy 或会话清理路径作废当前 primary 的 inflight generation，并确保旧响应不再写入。

## 需求与实现状态错位

### Epic-015

`/Users/jimmy/.codex/worktrees/9dd2/rxdb/requirements/epics/epic-015-identity-scoped-sync.md:29-41` 已经明确以下定案。

- 正文由业务表权限裁决，分区日志只记元数据。
- 分区日志单独成表或至少独立于正文权限。
- 每个区独立进度，失败区从自己的进度续拉。
- 身份、scope、换号和迟到响应必须隔离。

但 Epic 状态仍是 `In Progress`，见 `/Users/jimmy/.codex/worktrees/9dd2/rxdb/requirements/epics/epic-015-identity-scoped-sync.md:1-6`。这与当前代码已经进入大量实现、但关键安全边界未闭合的实际状态相符。

### US-033

US-033 文件标记 `status: Done`，验收表大量标记 `✅`。但 R-01、R-02、R-03、R-05 已经直接否定其中的关键验收前提。

尤其是 `/Users/jimmy/.codex/worktrees/9dd2/rxdb/requirements/stories/core/US-033-identity-scoped-read-sync.md:58-60` 规定分区日志只按授权区提供元数据、正文受业务表 RLS 约束，当前实现违反该协议。

US-033 的“一个区失败、其它区照常推进”还需要重新定义为“其它区可推进，但失败区的独立进度和状态不能被全局 cursor 覆盖”。当前实现的 `lastPullRemoteChangeId` 与该语义冲突。

### US-035

`/Users/jimmy/.codex/worktrees/9dd2/rxdb/requirements/status-overview.md:239` 仍标记 US-035 为 `Backlog`，但当前分支已经实现了核心身份绑定、plugin scoped name、Supabase adapter caller identity 和 demo session 准备。

这不是简单的状态遗漏。US-035 的 backend scope、匿名语义和数据库命名要求在核心与 sync plugin 中实现不一致，尚不能把现有代码当成可验收完成。

### US-036

`/Users/jimmy/.codex/worktrees/9dd2/rxdb/requirements/status-overview.md:240` 仍标记 US-036 为 `Backlog`。当前已经有 QueryCache 入口、RLS 自检和文档骨架，但 R-12 说明真实 view 仍会被拒绝。

US-036 验收表要求 view 在两种 failure mode 下都能连接，且同步实体与浏览缓存互不清理。当前验收证据为“尚无”，不能用已有 adapter 单测替代真实 view 真栈测试。

## Realtime 旧问题的处理

旧 `pr-226-review.md` 报告的“所有 authenticated 用户共用 `rxdb:changes` 频道导致跨租户元数据泄露”针对旧快照 `a81b9081...`。

当前 HEAD 已经加入 bucket topic 和相应的生产 policy。当前报告没有把旧的统一频道问题重复登记为当前新问题。不过当前实现仍保留未分区旧日志的统一频道，并且 R-15 发现 adapter token 复用时旧频道生命周期没有隔离。两者需要分开处理。

## 已执行验证

以下任务已在当前工作区通过。

```text
pnpm nx test rxdb-plugin-sync --skipNxCache
pnpm nx test rxdb --skipNxCache
pnpm nx run rxdb-adapter-supabase:test-env
pnpm nx test rxdb-adapter-supabase --skipNxCache
pnpm nx run rxdb-adapter-supabase:sql-security-regressions --skipNxCache
pnpm nx run rxdb-adapter-supabase:test-env-down --skipNxCache
```

结果是 Supabase adapter 隔离测试栈的 15 个 Nx task 全部成功。Nx 曾报告 `rxdb-client-generator:build` 有 flaky task 提示，但本次任务成功。

以下门禁本轮没有运行，不能把需求文档里的历史数字当成本次证据。

- coverage gate
- 完整 affected CI
- `pnpm test-all`

已完成的动态探针包括分区正文泄露、未授权 bucket 快照点与快照、部分列权限快照行为、SQL NULL filter、view RLS 自检和 token 切换后的旧 Realtime 频道。R-16 的迟到 QueryCache 响应仍需要补真实延迟回归。

## 合入前必须完成的动作

1. 先修 R-01，停止向分区日志写业务正文，并定义历史正文清理策略。
2. 修 R-02 和 R-03，快照按调用者可读列构造，所有 bucket RPC 显式检查 caller buckets。
3. 修 R-04 至 R-07，统一 bucketed entity 的 pull 路由、独立 cursor、rebind 和分页期间的 backend identity。
4. 统一核心与 sync plugin 的身份模型，修 R-08 至 R-11。
5. 修 R-12 并加入真实 PostgreSQL view 的 US-036 验收。
6. 统一 SQL 与核心 filter 的 NULL 语义，补跨后端矩阵回归。
7. 明确 R-15 的 adapter token 生命周期契约，补 R-16 的延迟响应测试。
8. 更新 US-033、US-035、US-036、Epic-015 的状态和验收证据，不能只保留 `✅` 或 `Backlog` 的静态标记。

在上述 P0 和关键 P1 未关闭前，不建议把当前分支合入 `main` 或对外宣称身份隔离同步已经完成。
