# 发布计划

> 本文回答「下一次发布要做什么、按什么顺序」。版本策略本身见 [versioning-policy.md](versioning-policy.md)，排期见 [roadmap.md](roadmap.md)。

## 现在的处境（一屏）

- **发布已改为手工执行，由 owner 自己控制时点**：不进 CI、没有任何自动化触发，也没有自动门禁兜底——
  **发布前必须先跑绿 `pnpm test-all`**。仓库里不存在自动发布 workflow，不要再为「什么时候发」反复请示。
- **发布不是开发的闸门**：桥接发布只挡 [epic-006](epics/epic-006-working-tree-commits.md) 的**迁移发布**
  （`bridge.tag` 为 `null` 时 `kind=migration` 门禁必红），不挡任何故事的编码、测试与合入——epic-006 的代码已全部合入，
  挡住的只是把它发出去这一步。
- 历史桥接 tag `v0.0.25` 的 commit 已因后续 squash **脱离当前发布主线**（`git merge-base --is-ancestor v0.0.25 HEAD` 失败），
  不得移动或重打，也**不能再作为 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 migration bridge**。
- 因此下一次 schema migration 之前，**必须先重新发布一个 `kind=bridge` 的非迁移版本**。
- **桥接锚点已定案（2026-10-01）**：`main` 自 #55 起已是 schema 6、现有提交上无处可切，owner 选了
  **出路 1**——从 `de70a1a9`（`main` 上最后一个 schema 3 的提交）切发布分支，版本定为 **`0.0.26`**，
  用一次**真 merge**把 bump 提交并回 `main`；桥接版本的 changelog **如实声明**区间内六组破坏性改动。
  见[桥接锚点定案](#桥接锚点定案)。
- **桥接版本 `v0.0.26` 已发布（2026-10-01）**：tag 打在 B = `852f3b20`，经 merge commit `8597bddf` 并入 `main`、
  是 `main` 祖先；34 个包已发到 npm（6 个首发）。迁移发布从此有了合法锚点，
  证据与执行中踩到的坑见[线 A 执行记录](#线-a-执行记录v0026)。
- 已发布的 `@aiao/rxdb@0.0.25` 在报假版本号，且 `v0.0.25` 的 tag 树与已发布产物**内容对不上**，
  见下方[版本漂移开项](#开项0025-遗留的三条版本漂移)。
- **自动生成的 changelog 会同时多报和漏报，必须人工过一遍**：既会把 0.0.25 已发过的内容再写一遍，
  也会漏掉被 squash 进 `chore(aiao): update deps (#53)` 的 US-908 两条缺陷修复。见硬前提 2 的 ② 与 ④。
- 按 [roadmap 线 A](roadmap.md#线-a桥接版本发布owner-门控) 排期，桥接发布的执行**排在所有批次之后**；本计划在 owner 决定启动线 A 时执行，
  动手前重跑下方「硬前提 2」的当前状态实测。

## 开项：0.0.25 遗留的三条版本漂移

前两条**源码已修，已发布产物无法修**，都源自 0.0.25 的版本 bump 只改了 `package.json`，一度让 `pnpm test-all` 变红：

- `packages/rxdb/src/version.ts` 的 `RXDB_VERSION` 停在 `'0.0.24'`——**已发布的 `@aiao/rxdb@0.0.25` 在报假版本**；
- `packages/code-editor-angular` 的 peer `"@aiao/code-editor": ">=0.0.24"` 下界低于工作区版本。

两条各自都已有断言在守，**断言没坏，是没人跑绿就发了版**。源码已改、两个 project 恢复全绿；
但 npm 上的 0.0.25 产物改不了，`rxdb.version` 报错版本这件事要写进下一次发布的 release note。

第三条是**判据层面**的，比前两条更容易误导人：

- **`v0.0.25` 这个 tag 指向的树，和 npm 上实际发布的 `0.0.25` 产物对不上**。tag 落在
  `b31c7e2`（2026-08-14），而发布是从一个**晚得多**的工作树跑的 `pnpm publish`。
  两组对照：① 已发布的 `@aiao/rxdb-client-generator@0.0.25` 产物里**含**
  `unsupportedDefaultFactory`（[US-018](stories/core/US-018-generator-default-serialization.md) 的
  `BREAKING CHANGE` 实现），而 `git show v0.0.25^{commit}:…RxDBClientGenerator.utils.ts` 里**没有**；
  ② 已发布的 `@aiao/rxdb@0.0.25` 产物 `package.json` 写 `0.0.25`、打包进去的 `RXDB_VERSION` 却是
  `"0.0.24"`——正是上面第一条漂移的现场。
- **后果是一条判据纪律：本仓库「某个改动发没发过」不能用 tag 祖先链判断**
  （`git merge-base --is-ancestor <commit> v0.0.25^{commit}` 会给出错误的否定答案），
  也不能用提交日期推断。唯一可信的口径是 **`npm pack` 把产物拉下来在里面搜**。
  这条对裁剪桥接版本 changelog（硬前提 2 的后果 ②）与核对[排期约束 12](roadmap.md#排期约束) 都直接适用。
- 这条**无法修复、只能记住**：不得为了让 tag 与产物对上而重打或移动 `v0.0.25`。

## 开项：epic-006 抽包（`next-0912`）欠发布说明的四条

把工作树/提交历史抽成 `@aiao/rxdb-plugin-working-tree` 之后新增的发布约束。四条都**不影响今天的门禁**
（`pnpm check-migration-release-gate` 当前仍是绿的），但都必须在发布当下人工承接。
承接它们的是带 schema 6 的**迁移发布**，不是桥接 `v0.0.26`：桥接树 `de70a1a9` 上没有 epic-006。

### ① 系统 schema 号已到 6，这条路径**不能**当桥接锚点

以 `npm pack` 拉已发布产物实测（不是 tag 树，理由见上一节第三条）：

```text
已发布的 @aiao/rxdb@0.0.25  → RXDB_SYSTEM_SCHEMA_VERSION = 3，commit / working-tree 文件数各为 0
工作区 next-0912            → RXDB_SYSTEM_SCHEMA_VERSION = 6
```

即 **epic-006 一行都没发出去过**。号是 epic-006 自己走的 3 → 4 → 5，抽包再走到 6
（语义「`activeKey` 就位，且那十张表不再归核心管」）。

对发布计划的影响是**量变不是质变**：`next-0912` 早在 epic-006 抬到 4 的时候就已经不符合硬前提 1
（「桥接版本不得抬升系统版本常量」），抽包只是把数字从 5 改成 6。结论仍是本文已经写下的那条——
桥接锚点必须由**另一条不动系统版本常量的纯功能/适配器路径**落成，不能从这条分支上切。
⚠️ 这条**没有任何自动化防线**：门禁只比对清单里的布尔位、从不读源码（见「门禁 tag 钩子的状态」末段）。
这条分支已随 #55 合进 `main`，「另一条路径」在 `main` 上因此不复存在；定案是从 #55 之前的
`de70a1a9` 切发布分支，见[桥接锚点定案](#桥接锚点定案)。

### ② 有一类库「未认领能力守卫」**接不住**，必须写进 release note

抽包后由 `__rxdb_capability__:` 水位行裁决「这个库启用过哪些插件能力」，未装插件却开过能力的库会被拒绝连接。
但**抽包之前**就启用过提交能力的库接不住：它停在水位 4/5，十张表带着真实数据物理还在，
却**没有能力水位行**（那个行格式是抽包之后才有的）。于是新客户端即便不装插件也照常打开它，
写入不再经过捕获，而 `system/capability-watermark.ts` 的守卫只认得水位行、够不到这一种。

**不为它单开迁移**，理由就是 ① 实测的那条：这批库只存在于开发机上。但这是个**判断**而不是保证，
所以它进 release note——谁在本机开过 epic-006 的提交能力，删库重建，不要带着它升上来。

### ③ 三个框架绑定包的破坏性变更

`useWorkingTree` / `WorkingTreeResource` 已从 `@aiao/rxdb-{angular,react,vue}` 移出，
改由 `@aiao/rxdb-plugin-working-tree-{angular,react,vue}` 三端同名提供（三端符号集逐字相同）。

按本文开头「已发布产物」的口径这**不是**破坏性变更（这三个符号从未发布过，`main` 的 api-baseline
里 epic-006 公开导出数为 0），但升级说明仍要写：`next-0912` 上开发的下游要改 import 来源。

### ④ 已知影响：系统 schema 号抬升之后，旧客户端**打不开**升级过的库

发布说明必须带上这一条，用户侧的症状才有名字可查。

**判据是什么**：[`assertSupportedRxDBSystemVersions()`](../packages/rxdb/src/system/migration.ts#L196)
在建连时比对库里的水位与进程常量，`stored > supported` 即抛
[`UnsupportedRxDBSystemVersionError`](../packages/rxdb/src/system/migration.ts#L95)，消息形如
`Unsupported RxDB system schema version: stored=6, supported=3`。两个适配器家族各有一处调用点
（[pglite](../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L189)、
[sqlite-core](../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L811)），
都排在迁移阶梯之前。

**影响面恰好是一个方向**：升级过的库 + 旧客户端。反过来（旧库 + 新客户端）走 `<` 那一侧，由迁移阶梯
正常补齐，不受影响；同一个客户端反复打开自己升过的库也不受影响。

**为什么它不是 epic-006 新增的危险面**：这条守卫与它的错误类型早于 epic-006 就在
（`v0.0.24` / `v0.0.25` 的 `migration.ts` 里 `RXDB_SYSTEM_SCHEMA_VERSION = 3`，`assertSupportedRxDBSystemVersions()`
逐字节同形）。当年 2 → 3 的那次抬升，对停在 2 的客户端就是同一个拒绝；epic-006 改变的只是**数字**与
**触发它的人数**，不是机制。写进 release note 是为了让升级者提前知道「降级回旧版本客户端这条路已经关了」，
不是为了标记一个新风险。

**具体数字按发布当下的实况写，别抄这里**：epic-006 自己走的是 3 → 4 → 5，抽包后到
6（见上面 ①，`npm pack` 实测已发布的 `@aiao/rxdb@0.0.25` 仍是 3）。发布说明里应写「3 → 6」而不是
任何中间态——中间那两级从未发布，用户手里不存在停在 4 或 5 的客户端。

**没有缓解措施，也不该造一个**：让新库对旧客户端「看起来能打开」需要向下兼容地写系统表，那正是
fail-closed 要挡的事。说明里给出的动作只有一个——**升级客户端**。

## 桥接锚点定案

**已定案（2026-10-01，owner）：出路 1——为桥接开一次非 squash 的例外，锚点 `de70a1a9`，版本 `0.0.26`。**
本次只定案、改文档。切发布分支、改分支保护、推 tag、`pnpm publish` 都是线 A 的执行动作，排在所有批次之后，
执行时每一项仍需 owner 单独确认。

**定案前的处境**（2026-09-25 实测）：

```text
de70a1a9 (#61)  → RXDB_SYSTEM_SCHEMA_VERSION = 3，packages/rxdb/package.json = 0.0.25   ← main 上最后一个 schema 3 的提交
2132c30d (#55)  → RXDB_SYSTEM_SCHEMA_VERSION = 6，packages/rxdb/package.json = 0.0.25   ← 一次 squash 抬 3 → 6
origin/main     → RXDB_SYSTEM_SCHEMA_VERSION = 6，RXDB_CHANGE_CODEC_VERSION = 1，全历史 0 个 merge commit
```

`git log v0.0.24..origin/main -G"RXDB_SYSTEM_SCHEMA_VERSION = "` 只报 `2132c30d` 一条。原计划的顺序是**桥接先发、schema 升级后合**，
而 #55 把升级先合进了 `main`。迁移发布要求桥接 tag 同时满足三条，而 `main` 上的两类提交各缺一条：

| 条件                                                                                | `de70a1a9` 及更早（schema 3）                                       | `2132c30d` 及之后（schema 6）                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 是 `main` 祖先（`bridgeTagIsAncestor`）                                             | ✅                                                                  | ✅                                                                                                                                                                                                                                 |
| 包版本 = tag 版本，且严格新于 `0.0.25`                                              | ❌ 全是 `0.0.25`；bump 提交只能是它的子提交，squash 下进不了 `main` | 可以做到                                                                                                                                                                                                                           |
| 系统常量低于迁移版本（`bridgeTagVersionConstants`），且桥接本身不抬常量（硬前提 1） | ✅                                                                  | ❌ 桥接版本会把 3 → 6 直接发出去（门禁只看布尔位，**察觉不到**）；之后的迁移发布比对是 6 → 6，`systemSchemaUpgrade=true` 报 `did not advance`。旧客户端撞的 `UnsupportedRxDBSystemVersionError` 提前到桥接那一版，桥接的意义就没了 |

**三条出路的取舍**：

1. ✅ **选定：为桥接开一次非 squash 的例外**。左列唯一缺的那一格是「squash 下 bump 进不了 `main`」，
   用一次真 merge 补上：bump 提交 B 是 `de70a1a9` 的子提交，作为 merge commit 的第二父提交进入 `main` 祖先链。
   B 的树上 schema 3 / codec 1，与 `v0.0.24` 两端取值相等，硬前提 1 成立；包版本 `0.0.26` 严格新于 `0.0.25`。
2. ✗ 否决：**revert `2132c30d` 里的常量与迁移部分**，先发桥接再重新合入。3 → 6 连着十张表与抽包，
   revert 等于把 epic-006 从 `main` 拆出去，而且代价随 schema 6 之上的每一个新提交增长。
3. ✗ 否决：**承认这一轮没有桥接**。`bridge.tag` 必填，要走这条就得改清单协议与门禁，
   改的是 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 本身。

**定案时查出的三条执行约束**，都没有自动化兜底：

1. **分支保护要临时松一次**。`gh api repos/{owner}/{repo}/branches/main/protection` 实测（2026-10-01）：
   `required_linear_history: true`、`enforce_admins: true`，必过检查为 `ci / gate`；仓库设置 `allow_merge_commit: true`。
   线性历史会拒收任何 merge commit，`enforce_admins` 让管理员也绕不过。所以真 merge 前必须临时关闭
   「Require linear history」，合完**立即**恢复，再用同一条 `gh api` 复查并留证。
   另有一个名为 `main` 的 ruleset，其 `ref_name.include` 为空、不作用于任何分支，与此事无关。
2. **只有真 merge 保得住 B**。rebase merge 与 squash 都会重写 B，squash 的产物还带着 `main` 的 schema 6，
   tag 于是落不进 `main` 祖先链——`v0.0.25` 就是这样掉出主线的。PR 只能用「Create a merge commit」。
3. **先合入、验祖先、最后打 tag**。PR 合入后跑 `git merge-base --is-ancestor <B> origin/main`，成功了才在
   **B** 上打 `v0.0.26`（不是 merge commit 上），并从 B 的干净检出发布。tag 打在 merge commit 上，
   等于把 #55 之后的 schema 6 一起声明成桥接，回到上表右列。

**路径 1 的副作用**，执行时逐条承接：

- `main` 从此有了 merge commit，「全历史零 merge commit」不再成立。合入时产生的每个 merge commit
  标题都要写成规范形式，例如 `chore(aiao): merge bridge v0.0.26 into main`（scope 须在 commitlint 白名单内，`release` 不在）。否则下一次 changelog 会以
  `__INVALID__` 收进它，硬前提 2 ⑤ 的非规范标题检查也会报它。
- 桥接版本不含 `de70a1a9` 之后的任何功能，它只是锚点。**只在 `main` 上存在的 12 个包**——`rxdb-model`、
  `rxdb-plugin-tree`、`rxdb-plugin-working-tree` 的核心包及各自的 `-angular` / `-react` / `-vue`——在 B 上不存在，
  不会有 `0.0.26` 的产物；并回 `main` 时要把它们的版本对齐到 `0.0.26`，免得 `main` 上版本混杂。
- `packages/rxdb/src/version.ts` 的 `RXDB_VERSION` 不在 `nx release version` 的改写范围内，必须手改
  （`version.spec.ts` 断言它与 `package.json` 同值）。0.0.25 的假版本号就出在这一步。
- 桥接区间被冻结为 `v0.0.24..B`：`de70a1a9` 之后合入 `main` 的提交**不可能**再进这次桥接。
  下一次发布的 changelog 基准会前进到 `v0.0.26`（**推断**：`v0.0.26` 经第二父提交可达，`git describe` 应解析到它；
  执行后复测）。

### 约束 12 修订：破坏性改动如实声明

原[排期约束 12](roadmap.md#排期约束)「桥接版本不得对外宣告破坏性改动」在**任何锚点上都满足不了**：
区间 `v0.0.24..de70a1a9` 里已有六组**首发**的破坏性改动（`@aiao/rxdb` 导出删除三组 + 包级三组），它们在 `main` 上早于锚点，出路 1 也甩不掉。
owner 定案（2026-10-01）：**修订约束 12**——桥接区间可以带锚点之前已在 `main` 上的破坏性改动，但 changelog
必须逐条如实声明并附迁移说明；桥接的硬不变量仍然只有「不抬系统版本常量」。US-018 的定案（不宣告）不变。

证据口径按[版本漂移开项](#开项0025-遗留的三条版本漂移)第三条，只认 `npm pack`：下表每个名字在
`@aiao/rxdb@0.0.25` 的产物里都能从 `dist/index.d.ts` 触达，在 `de70a1a9` 的 `requirements/api-baseline/rxdb.json` 里都已不在。
区间内**没有**一条提交带 `!` 或 `BREAKING CHANGE:` 脚注，所以自动生成的 changelog 对这六组一个字都不会写，
只能人工补。

| 组                    | 移除提交          | 名字                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 去向                                                                                                                                                                                                        | 迁移说明                                                                                                                                             |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| writer lease（16 个） | `073ecb05`（#10） | `assertRxDBUpgradeClaimable`、`createRxDBActiveWriterLeaseError`、`readRxDBUpgradeGuard`、`readRxDBWriterLease`、`resolveRxDBWriterEpoch`、`RXDB_UPGRADE_GUARD_TABLE_NAME`、`RXDB_UPGRADE_OWNER_TTL_MS`、`RXDB_WRITER_HEARTBEAT_INTERVAL_MS`、`RXDB_WRITER_LEASE_TABLE_NAME`、`RXDB_WRITER_LEASE_TTL_MS`、`RXDB_WRITER_PROTOCOL_VERSION`、`RxDBUpgradeGuardSnapshot`、`RxDBUpgradeGuardState`、`RxDBWriterLeaseError`、`RxDBWriterLeaseErrorCode`、`RxDBWriterLeaseSnapshot` | 删除，无替代（US-304 取消）                                                                                                                                                                                 | [writer-lease-removal.md](../website/docs/migration/writer-lease-removal.md)：删掉调用即可；跨 realm 排他由发布系统承担；含 PGlite 残留两张表的处理  |
| 同步选项（1 个）      | `2cf208f5`（#52） | `RemoteSyncOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `conflictResolver` 挪进 `PullOptions`，`autoSync` 删除                                                                                                                                                      | [remote-sync-options.md](../website/docs/migration/remote-sync-options.md)：孤立类型，0.0.25 里没有 API 接收它                                       |
| US-025 抽包（13 个）  | `de70a1a9`（#61） | `BulkSyncOptions`、`BulkSyncResult`、`CheckRepositoryUpdatesResult`、`cleanupExpired`、`CleanupExpiredOptions`、`CleanupExpiredResult`、`DependencyGraph`、`RepositorySyncStatus`、`syncBranches`、`SyncBranchesResult`、`RxDBCrossScopeTransactionError`、`VersionManager`、`QueryCacheRepository`                                                                                                                                                                          | 前 10 个进 `@aiao/rxdb-plugin-sync`，`RxDBCrossScopeTransactionError` / `VersionManager` 进 `@aiao/rxdb-plugin-history`，`QueryCacheRepository` 改名为 `@aiao/rxdb-plugin-querycache` 的 `QueryCacheEngine` | [history-sync-plugins.md](../website/docs/migration/history-sync-plugins.md)、[querycache-plugin.md](../website/docs/migration/querycache-plugin.md) |

三个插件包在 npm 上都还没有任何版本（`npm view` 实测 404），会随 `0.0.26` 首发；声明时写「从 `@aiao/rxdb` 移出、改由插件包提供」，
不要写成「插件包的破坏性变更」。

**上表只覆盖 `@aiao/rxdb` 的导出面，不是全部。** 2026-10-01 执行线 A 时把 29 个已发布包的 0.0.25 产物与 B 的构建产物
逐包比对导出名、再按迁移页逐条核对，另有三组同样是**首发**、同样没有 `!` 脚注的破坏性改动，也要进 changelog：

| 组                    | 提交              | 影响                                                                                                  | 迁移页                                                                             |
| --------------------- | ----------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 桌面适配器拆包        | `39dba16f`（#29） | `@aiao/rxdb-adapter-desktop@0.0.25` 在 B 上已无此包，由 `-electron` / `-tauri` 两个首发包取代         | [desktop-split.md](../website/docs/migration/desktop-split.md)                     |
| 插件作用域契约        | `43d1a053`（#34） | `install()` 改收 `LifecycleScope`，插件自带 `destroy()` 拆卸改为宿主逆序释放；自写插件要改            | [plugin-scope.md](../website/docs/migration/plugin-scope.md)                       |
| Supabase 传输失败错误 | `a63321c9`（#39） | 连不上远端时从 `SupabaseDataError` 改抛 core 的 `NetworkOfflineError`；按旧类型捕获网络失败的代码要改 | [supabase-network-errors.md](../website/docs/migration/supabase-network-errors.md) |

writer lease 那组在 `@aiao/rxdb` 之外还带走两处：`@aiao/rxdb-adapter-sqlite-core/testing` 的 `rowsAffectedConformanceSuite`
与 `RxDBAdapterLocalBase.startWriterLease()`，都已写进 writer-lease-removal 迁移页。
`a63321c9` 里的 `http-page-token` 迁移页不算：`@aiao/rxdb-adapter-http` 本身就是 0.0.26 首发，对外没有旧名可迁。

## 下一次发布：桥接版本 `v0.0.26`

`v0.0.25` 已脱离主线，[US-305](stories/collaboration/US-305-commit-graph-head.md) 的迁移发布因此需要一个**新的** `kind=bridge` 锚点，
按上面的定案取 `de70a1a9` + `0.0.26`。整体是四段，**顺序不可交换**：

| 段  | 动作                                                                     | 为什么必须在这个位置                                                                                                           |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| 1   | 从 `de70a1a9` 切发布分支，只提交版本 bump、`version.ts` 与清单（提交 B） | 锚点树必须是 schema 3；bump 只能是 `de70a1a9` 的子提交。动了常量**门禁察觉不到**（它只比对布尔位），只能靠硬前提 1 的人工复测  |
| 2   | 以**真 merge** 并回 `main`                                               | squash 与 rebase 都会重写 B；只有真 merge 让 B 进入 `main` 祖先链，且要临时放开线性历史保护                                    |
| 3   | 验祖先后在 B 上打 `v0.0.26`，从 B 发布                                   | 桥接 tag 只有在 `main` 祖先链上，将来的 migration 发布才引用得了；tag 最后打，防止重演 `v0.0.25`                               |
| 4   | 在真实迁移发布上验证门禁                                                 | 门禁的四条 tag 钩子（存在/祖先/含迁移面/版本常量吻合）、`bridge.version` 下限与 `oldBundlePolicy` 只有在真实迁移发布上才验得全 |

桥接段**不能塞进** US-305：US-305 的范围含「已有数据库的一次性初始化」，属 schema 迁移，会强制
`kind=migration`，而 migration 要求 `bridge.tag` 指向一个**已存在**且在祖先链上的桥接发布——现在没有，直接死锁。

### 两条硬前提

先说两件会让整个计划作废的事，动手前必须确认：

1. **桥接版本不得抬升系统版本常量**。`bridge` 的定义就是「被声明为迁移锚点、但不改
   schema/codec，让所有实例先升到它」；门禁对 `kind=bridge` + `systemSchemaUpgrade|changeCodecUpgrade=true`
   直接报 `bridge releases cannot upgrade system schema or change codec`。所以随这一版发布的功能
   **不能动** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。若那个功能必须升 schema，
   它得排到桥接版本**之后**单独发——否则就会掉进「migration 需要先有 bridge tag，而 bridge tag 又被这次升级污染」的死锁。

   **⚠️ 复测必须用 `-G`，不能用 `-S`。** `-S` 统计的是**字符串出现次数的变化**：把 `= 3` 改成 `= 6`，
   `RXDB_SYSTEM_SCHEMA_VERSION = ` 这个串前后都出现 1 次，计数没变，`-S` 于是**恒空**，给的是假清白；
   `-G` 匹配 diff 文本，能正确报出每次抬升。**这是唯一一条人工防线**（门禁只比对布尔位、从不读源码常量，
   见执行顺序第 1 步），用错了它整条防线恒绿。区间的右端是**发布分支的 HEAD**（桥接定案后不再是 `main`），
   两条正确命令是：

   ```bash
   git log v0.0.24..HEAD -G"RXDB_SYSTEM_SCHEMA_VERSION = " -- packages/rxdb/src/system/migration.ts
   git log v0.0.24..HEAD -G"RXDB_CHANGE_CODEC_VERSION = "  -- packages/rxdb/src/system/change-codec.ts
   ```

   光看输出仍不够——`-G` 会把「抬上去又改回来」的两条都报出来。定论以**两端取值**为准，
   这一条比任何 `git log` 都直接：

   ```bash
   git show v0.0.24^{commit}:packages/rxdb/src/system/migration.ts | grep 'RXDB_SYSTEM_SCHEMA_VERSION = '
   grep 'RXDB_SYSTEM_SCHEMA_VERSION = ' packages/rxdb/src/system/migration.ts
   ```

   **当前取值**（2026-10-01 复测）：`v0.0.24` 与锚点 `de70a1a9` 上都是 `RXDB_SYSTEM_SCHEMA_VERSION = 3` /
   `RXDB_CHANGE_CODEC_VERSION = 1`，`v0.0.24..de70a1a9` 上两条 `git log -G` 均无输出——**锚点树满足这条前提**。
   `main` 自 #55（`2132c30d`）起是 **6** / 1、不满足，所以桥接不从 `main` 切，见[桥接锚点定案](#桥接锚点定案)。
   发布分支上若为跑绿补了提交，要在 B 上重跑这两条；两端取值相等时，清单里的
   `systemSchemaUpgrade` / `changeCodecUpgrade` 保持 `false`。

   抬到 **6** 的来历（原在 `next-0912` 分支上，已随 #55 进入 `main`）：3 → 4 是 epic-006 的 10 张工作树/提交图表；
   4 → **5** 是 `rxdb_branch.activeKey` 可空唯一列，FR-048 的「至多一个 active」那一半；5 → 6 是抽包后
   `activeKey` 就位、十张表不再归核心管。
   这些都是**单向操作**：标成 6 的库再打开于旧客户端会按 `UnsupportedRxDBSystemVersionError` 拒绝
   ——不是新增的危险面（2 → 3 同样如此），但**必须进发布说明**。两条实际后果：

   - **#55 之后的 `main` 不能充当桥接版本**（见本条第一段：`kind=bridge` 撞上
     `systemSchemaUpgrade=true` 会被门禁直接拒）。桥接从 #55 之前的 `de70a1a9` 切出（见[桥接锚点定案](#桥接锚点定案)），
     这次 schema 升级随其**之后**的迁移发布出去，清单切 `kind=migration`。
   - 迁移发布时清单里的 `systemSchemaUpgrade` 必须置 `true`，而不是沿用「保持 `false`」。

   `activeKey` 是在 v4 水位线**之后**才进 schema 的，而版本号是升级路径唯一的触发条件、列本身不是——
   已被标成 4 的库（开发机上的那批）不 bump 就永远补不出这一列。它是补记，不是新增能力；v4 从未发布，
   代价只是一个数字。

2. **版本号是算出来的，不是选的**。`conventionalCommits: true`，`nx.json` 只自定义了 `cleanup` /
   `__INVALID__` 两个类型（均 `semverBump: none`），其余走 nx 23.2.1 的
   `DEFAULT_CONVENTIONAL_COMMITS_CONFIG`：**只有 `feat:` → minor、`fix:` → patch，
   其余全部 `none`**（`perf` / `refactor` / `docs` / `build` / `types` / `chore` / `examples` / `test` / `style`）。
   两个推论：

   - 非规范提交信息（`123` / `up` 这类）nx 解析不到，一律记为 `none`；**一批非规范提交等于零 bump 量，发不出版本**。
     这也意味着算出来的版本号反映的是**提交信息的形态，不是改动的份量**——0.0.25 就是一个全新可发布包
     以 patch 发出去的例子，changelog 上看不出来。
   - 若要指定版本号，需显式传参覆盖推算结果。无论取哪个，**清单、tag、`packages/rxdb/package.json` 三处必须同为那个实际值**。
   - **当前状态实测（跑 `pnpm nx release version --dry-run`）**：
     `v0.0.25` 已脱离主线，`git describe --tags --abbrev=0` 解析到的基准 tag 因此**回退成 `v0.0.24`**。
     **桥接定案后，区间在发布分支上量，且固定为 `v0.0.24..de70a1a9`**：B 是 `de70a1a9` 的子提交，
     `de70a1a9` 之后合入 `main` 的提交不会进这次桥接，区间因此**不再随仓库增长**。实测（2026-10-01）42 条：
     23 `feat` + 3 `fix`，非规范标题检查零输出，`git log --merges v0.0.24..de70a1a9` 为空。
     specifier 仍是 `minor`、仍被 `adjustSemverBumpsForZeroMajorVersion` 降级，默认推算落在禁用且已被
     registry 占用的 `0.0.25` 上，**线 A 必须显式传版本号 `0.0.26`**。发布分支上为跑绿补的提交会进区间，
     补了就要重跑本节全部检查。特性分支上量没有意义：`next-0912` 同区间有大量 `123` / `213213` 类中间提交和
     merge commit，它们会在 squash 时消失，量出来的是噪声。
     以下后果必须在动手前确认：

     ① **默认推算结果是 `0.0.25`，正好是禁用值，且 npm 上已被占用——不能直接用**。
     dry-run 的原话是「Resolved the specifier as "minor" … Applied semver relative bump "minor" …
     to get new version **0.0.25**」：specifier 确实是 `minor`，但 nx 的
     `adjustSemverBumpsForZeroMajorVersion` **默认为 `true`**
     （`nx/dist/src/command-line/release/config/config.js` 的 `?? true`），major 为 0 时把
     `minor` 降级成 `patch`、`major` 降级成 `minor`，于是 `0.0.24 --minor--> 0.0.25` 而**不是 `0.1.0`**。
     两个后果叠在一起：该值撞上[线 A 关闭判据 ①](roadmap.md#线-a桥接版本发布owner-门控)的
     `release.version ≠ 0.0.25`，且 `@aiao/rxdb@0.0.25` **已在 registry 上**（`npm view @aiao/rxdb versions` 实测），
     `pnpm publish` 会以版本重复被拒。**所以线 A 必须显式指定版本号**（`nx release version <显式版本>`），
     不能听任推算。**已定案取 `0.0.26`**（2026-10-01，owner），`0.1.0` 未采纳。
     若改用 `adjustSemverBumpsForZeroMajorVersion: false` 让它算成 `0.1.0`，那是改全仓库版本策略、影响此后每一次发布，
     属独立决定，不要顺手夹在桥接发布里做。

     ② 该区间**包含已随 0.0.25 发布过的内容**，**changelog 会把 0.0.25 已发的东西再写一遍**，需人工裁剪。
     注意这里不能按 tag 祖先链判断「发没发过」，原因见上方[版本漂移开项](#开项0025-遗留的三条版本漂移)的第三条。
     2026-10-01 实测（逐提交取 `packages/*/src` 新增导出名，到对应包的 0.0.25 产物里搜）：**只有 `0123e127`
     （`feat(aiao): 优化代码，添加 rxdb-adapter-desktop 包`）是整条已发**（43/43 命中），changelog 删掉它；其余提交命中率为 0
     或只是 `cleanup` 搬文件带出的旧名，按新内容保留。US-018 那条不走导出名，按 ④ 单独处理。

     ③ `cleanup(...)` 已加进 `nx.json` 的 `release.conventionalCommits.types`：`semverBump: none`、changelog 单列一节，
     这 4 条对版本号仍贡献为零但不再从 changelog 消失；`__INVALID__`（非规范标题）同样只进 changelog 不 bump。

     ④ **反过来还有「漏报」：真活被埋在错标题下，changelog 里一个字都不会有**。已推送的
     `f4e0778 chore(aiao): update deps (#53)` 是一次 squash 合并，标题写的是升级依赖，实际带走的是
     2026-09-11 夜里（原始提交 `83b5e0d`，标题 `12312323123`，仍可在 `origin/next-0910` 上查到）交付的
     [US-908](stories/future/US-908-devtools-transfer-session-defects.md) **两条缺陷修复**——
     `packages/rxdb-devtools/src/v2/transfer.ts` 的 `cancel()` 排空在途写入、`apps/dev-rxdb-electron` 的
     `pagehide → dispose()`——外加 [US-906](stories/future/US-906-electron-devtools-developer-path.md) 的交付、
     三份新测试与 `scripts/audit/requirements-consistency.mjs`。因为标题是 `chore`，
     **这两条 `fix` 既不贡献 bump，也不会出现在 changelog 的 Bug Fixes 里**；实测该区间被识别出的 3 条 `fix`
     （`2bc4f6a` / `5e129fc` / `5044dad`）全是 8 月的 CI 与打包修复，**与 US-908 这两条无关**。
     `f4e0778` 已在 `origin/main` 上，**不得重写**——只能在 changelog 生成后**人工补写**这两条。
     ② 是多报、④ 是漏报，定稿前两边都要人工过一遍；判断某条到底发没发过，仍按上方开项第三条只认 `npm pack`。
     反方向的一条：`a63321c`（标题 `feat(rxdb): 添加 rxdb-adapter-http 适配器 (#39)`）同样埋着 US-018 的
     `BREAKING CHANGE` 实现，但它已随 0.0.25 的产物发出，**不补**——定案见 [roadmap 排期约束 12](roadmap.md#排期约束)。

     ⑥ **还有一类漏报是破坏性改动：六组首发的破坏性改动，自动 changelog 一字不提。**
     区间内没有一条提交带 `!` 或 `BREAKING CHANGE:` 脚注，nx 因此既不写 Breaking Changes 一节、也不因它们抬 bump。
     按修订后的约束 12，定稿时必须逐条声明并附迁移说明，清单与证据见
     [约束 12 修订](#约束-12-修订破坏性改动如实声明)；`@aiao/rxdb` 之外另有三组（桌面拆包 / 插件作用域 / Supabase 错误类型），六组都已有迁移页（writer lease 与 `RemoteSyncOptions` 两页 2026-10-01 补写）。
     ④ 与 ⑥ 的方向相反：④ 不补 US-018，⑥ 必须补这六组——区别只在「是否已随 0.0.25 发出」，一律以 `npm pack` 为准。

     ⑦ **`@aiao/rxdb@0.0.25` 报假版本号要写进 release note**，见[版本漂移开项](#开项0025-遗留的三条版本漂移)第一条。

     ⑤ **非规范标题会以 `__INVALID__` 原样进 changelog，且本仓库在持续产生新的。**
     非规范提交（`123` / `213213` 这类）nx 解析不到、一律记为 `none`，一批非规范提交等于零 bump 量、发不出版本；
     特性分支上的中间提交经 squash 后不进 `main`，只在 `main` 上量才有意义。所以这里不列清单——
     **这不是一次性清理，而是每次推送前必跑的例行检查**——
     未推送的可以 `git commit --amend` 只改信息、不动树，已推送的（如 `f4e0778`）没有这个机会。
     推送前跑：
     `git log --format='%h %s' v0.0.24..main | grep -vE ' (feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert|cleanup)(\(.*\))?!?:'`
     应当无输出。

   - **`preVersionCommand` 会先跑 `nx run-many -t build --projects='packages/*'`，它红了 dry-run 就跑不到版本计算那一步**，
     报错只有一句 `The pre-version command failed`。2026-09-12 实测撞到过一次：`code-editor-angular:build` 因
     `node_modules` 里残留 `@codemirror/state@6.7.2` / `@codemirror/view@6.43.10` 的旧副本而报 TS2322
     （lockfile 里只有 6.7.4 / 6.43.11，是**本机安装态漂移**，不是仓库缺陷；`chore: update deps` 之后没重装就会这样）。
     `pnpm install --frozen-lockfile` 会判定「已是最新」直接跳过，**必须 `pnpm install --frozen-lockfile --force`** 才会重建链接。
     动手前确认 dry-run 真的输出了版本号，别把 pre-version 的红当成「没有可发布的变更」。

### 执行顺序

0. **门禁的 git 钩子面已挂进 PR CI**（不依赖发布）：`migration-release-gate`
   已挂进 PR CI 的 `setup` job（`ci-template.yml` 的 “Migration release manifest gate”），**不带**
   `--release-tag`，用真实 git 执行 `bridgeTagExists` / `bridgeTagIsAncestor` /
   `bridgeTagSupportsProtocol`——单测里这三条被 `passingHooks` 桩掉，此前只在打 tag 时跑过。
   两处配套改动是这一步能成立的前提：
   - `setup` 的 checkout 加了 `fetch-tags: true`。`fetch-depth: 0` 只保证历史完整；actions/checkout
     在 refspec 不含 `refs/tags/*` 时一律加 `--no-tags`，runner 上根本没有 tag，四条钩子会变成恒假门禁。
   - 脚本改为按 `GITHUB_REF_TYPE` 解析发布 tag（`resolveReleaseTag`）。此前直接取 `GITHUB_REF_NAME`，
     PR 事件下那是 `42/merge`，挂进 PR CI 会让每个 PR 都红在
     `release.version 0.0.25 does not match tag 42/merge` 这条与发布无关的假失败上。

   这四条只对 `kind=migration` 生效，桥接发布走不到它们（见下方「门禁 tag 钩子的状态」），
   下一个迁移周期（US-305）才会真正吃到。

1. **从锚点切发布分支，在这棵旧树上跑绿**。`git switch -c release/0.0.26 de70a1a9`，
   然后 `pnpm install --frozen-lockfile --force`（理由见硬前提 2 的 `preVersionCommand` 一条）与 `pnpm test-all`。
   要跑绿的是 `de70a1a9` 这棵树，不是 `main`。若要补修复，提交必须规范（`fix(...)`），且**不得改动**
   `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`，补完重跑硬前提 1、2 的检查。
   ⚠️ **这一条门禁守不住，别指望它**：`kind=bridge` 只校验 `systemSchemaUpgrade` / `changeCodecUpgrade`
   两个布尔位（[check-migration-release-gate.mjs:256](../scripts/check-migration-release-gate.mjs#L256)），
   **从不读源码常量**；桥接发布时 `bridge.tag` 是 `null`，`bridgeTagVersionConstants` 钩子也走不到。
   悄悄抬了常量却把布尔位留成 `false`，门禁照样全绿。唯一防线是硬前提 1 那两条 `git log -G` 人工复测（**`-S` 在这里恒空，会给出假清白**，见硬前提 1）。
2. **先 version，再手改 `version.ts` 与清单，三者一个提交（B）**——顺序不能反。`nx release version` 只改写
   `packages/*/package.json`；`RXDB_VERSION` 与清单都是手工维护的，不在它的改写范围内：

   ```bash
   # 先看推算结果；按硬前提 2 的实测，默认会算出 0.0.25——禁用值，且 npm 上已被占用
   pnpm nx release version --dry-run

   # 因此必须显式传版本号
   pnpm nx release version 0.0.26 --git-commit=false --git-tag=false   # 只改 package.json，不提交不打 tag
   ```

   然后手改 `packages/rxdb/src/version.ts` 为 `RXDB_VERSION = '0.0.26'`（`version.spec.ts` 守着它，0.0.25 的假版本号就漏在这一步），
   再更新 `requirements/migration-release.json`：`release.version` = `0.0.26`，`release.kind` 确认为 `bridge`，
   两个升级位保持 `false`，`bridge.tag` / `bridge.version` 保持 `null`——桥接版本不引用桥接 tag，只有 migration 版本才填。
   提交标题用规范形式，例如 `chore(aiao): release bridge 0.0.26`。

   `v0.0.24` 就是栽在这一步：包版本停在 `0.0.24`，清单已经写成 `0.0.25`，两者从未对齐。

   ⚠️ **清单里今天已经是 `kind=bridge` / `version=0.0.25`**，那是 0.0.25 那次桥接发布的**如实记录**，
   不是本次的成果。**不要把它当作「这一步已经做完了」**，也**不要为了让门禁变红而改写它**——
   篡改已发布版本的记录比留着它更糟。本步唯一要动的是 `release.version`，它必须变成 `0.0.26`，
   与 `packages/rxdb/package.json` 同值。这条「版本号必须是新的」**在本次发布当下没有任何自动化在守**
   （原因见下方门禁 tag 钩子一节），只能靠这一步的人工确认。唯一的延迟防线是 `bridge.version` 下限：
   真发成 `0.0.25` 的话，要等到**下一次** migration 引用它时才会撞下限报红——迟一个发布周期，不能当作本步的门禁。

3. **在 B 上本地预检并定稿 changelog**：`pnpm nx run @aiao/source:migration-release-gate-test` 与
   `pnpm nx run @aiao/source:migration-release-gate --args="--release-tag=v0.0.26"` 全绿，
   `pnpm test-all` 在 B 上仍绿。changelog 取 `v0.0.24..B` 生成草稿后人工定稿，按硬前提 2 过五项：
   ② 裁多报、④ 补 US-908 / US-906（不补 US-018）、⑥ 声明六组破坏性改动并链接迁移页、⑦ 写明 0.0.25 的假版本号，
   以及 epic-006 抽包那一节**不适用**——B 上没有 epic-006，那四条随后面的迁移发布写。
4. **开 PR，以真 merge 并回 `main`**。
   - 冲突与对齐放在发布分支上做：把 `main` 合进发布分支解冲突（`package.json` 一律取 `0.0.26`），再对合并后的树重跑
     `pnpm nx release version 0.0.26 --git-commit=false --git-tag=false`，把只在 `main` 上的 12 个包对齐到 `0.0.26`，
     另起一个规范提交。这些提交都在 B **之后**，不影响 tag 打在 B 上。PR 上 `ci / gate` 必须绿。
   - 合入前临时关闭 `main` 的「Require linear history」（`enforce_admins` 开着，管理员也绕不过），
     用 **Create a merge commit** 合入，merge commit 标题写成规范形式（见[桥接锚点定案](#桥接锚点定案)的副作用一节）。
     **不得**用 squash 或 rebase merge——两者都会重写 B。
   - 合完立即恢复线性历史，用 `gh api repos/{owner}/{repo}/branches/main/protection --jq .required_linear_history.enabled`
     复查为 `true` 并留证。
5. **验祖先、打 tag、发布**——顺序不能反。先 `git fetch origin`，跑
   `git merge-base --is-ancestor <B> origin/main` 并留证；成功后在 **B**（不是 merge commit）上打 `v0.0.26` 并推送。
   推送 tag 不会触发任何发布：发布是在 B 的干净检出上手工执行 `pnpm publish`，由执行者确保第 3 步已跑绿。
   门禁日后的祖先判定是 `git merge-base --is-ancestor <tag>^{commit} HEAD`（[scripts/check-migration-release-gate.mjs:277](../scripts/check-migration-release-gate.mjs#L277)），
   本步的人工校验就是提前跑它。
6. **回写下方「迁移发布的关闭条件」**：把 `v0.0.26` 记进那一节的 AC US2-14 绿半边证据，
   依据是「桥接 tag 已推送、是 `main` 祖先、清单声明 `kind=bridge` 且通过门禁」。迁移发布从此有了合法锚点。
   （AC US2-14 的绿半边由本文承接；[US-305](stories/collaboration/US-305-commit-graph-head.md) 按代码 AC 关闭，
   不回写故事。）

### 门禁 tag 钩子的状态

`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 已用真实 tag 做过正反两组对照：
真 tag 一条报错都没有，伪造 tag（`v9.9.9`）三条全部报出，fail-closed 成立。
**门禁本身不需要修**：它在真实 tag 上的行为与桩一致，且对伪造 tag 正确拒绝。
「只在 tag 时跑」这条缺口**已补**：门禁现在每个 PR 都跑（见执行顺序第 0 步）。

第四条钩子 `bridgeTagVersionConstants`（2026-09-12 新增）从 tag 上读
`RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 并与清单的升级位比对，同批还加了一条
`bridge.version` 必须严格新于 `0.0.25` 的下限。真实 tag 实测（2026-09-12）：

```text
v0.0.24 → {systemSchemaVersion: 3, changeCodecVersion: 1}
v0.0.25 → {systemSchemaVersion: 3, changeCodecVersion: 1}
v9.9.9  → null（fail-closed）
```

⚠️ **由此得到一条容易被误读的事实：版本常量比对挡不住 `v0.0.24`。** 它的两个常量与 `main` 完全相同，
US-305 把 schema 抬到 4 之后，拿 `v0.0.24` 当锚点会顺利通过比对（`3 < 4` ✓、codec `1 == 1` ✓）。
真正挡住这个空桥的**只有** `bridge.version` 下限那一条硬编码。两者不是互为备份：
比对那条只管「升级位撒谎」，下限那条只管「锚点太老」。**删掉下限就没有第二道防线**。

⚠️ **这四条只对 `kind=migration` 生效，桥接发布走不到它们**
（[check-migration-release-gate.mjs](../scripts/check-migration-release-gate.mjs) 的 `validateManifest`
把它们放在 migration 分支里）。后果是**门禁在当前状态下就是绿的**，实测：

```bash
$ node scripts/check-migration-release-gate.mjs --check
Migration release gate passed for bridge 0.0.25.          # exit 0
$ node scripts/check-migration-release-gate.mjs --check --release-tag=v0.0.25
Migration release gate passed for bridge 0.0.25.          # exit 0
$ git merge-base --is-ancestor v0.0.25^{commit} HEAD      # 失败：v0.0.25 不是祖先
```

也就是说**「门禁全绿」不能作为桥接发布已完成的证据**——今天什么都不做跑它就是绿的。
桥接发布的两条真判据（版本号 ≠ `0.0.25`、新 tag 是 `main` 祖先）在**发布当下**都只能人工确认并留证，
把第 0 步的 `migration-release-gate` 挂进 PR CI 也守不到它们。
`bridge.version` 下限只提供**延迟**防线：桥接真发成 `0.0.25`，要到下一次 migration 引用它时才会红。
第三条同样无自动化：桥接发布**不得抬升系统版本常量**这一条，门禁只看布尔位、从不读源码（见执行顺序第 1 步的 ⚠️）。
这也是 [roadmap 线 A](roadmap.md#线-a桥接版本发布owner-门控) 的关闭判据要写五条、
并特别标出「④ 单独没有区分力」的原因。

注意 `bridgeTagSupportsProtocol` 只用 `git cat-file -e` 校验文件存在、不校验内容，
它单独并不能证明该 tag 含可用的迁移实现，须另行人工确认。

### 迁移发布的关闭条件

迁移发布门禁的操作列是「发布迁移版本」，桥接发布不升级任何系统版本，够不着这个前置条件。三条子句在桥接发布后的状态：

| 子句                                                 | 桥接发布之后                           |
| ---------------------------------------------------- | -------------------------------------- |
| 本仓库须存在位于 HEAD 祖先链上的桥接 tag             | ✅ 由该次桥接 tag 满足                 |
| 发布门禁阻止升级，或强制更新/缓存失效/新命名空间隔离 | ❌ 需要一次真实 migration 发布才验得了 |

真正关闭迁移发布门禁的那次发布必须同时满足：抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 或 `RXDB_CHANGE_CODEC_VERSION`、
清单切 `kind=migration`、`bridge.tag` / `bridge.version` 指向该次桥接版本、`oldBundlePolicy.strategy` 四选一、
`minimumVersion` 不低于桥接版本、`enforced=true`。

**这条门禁的代码由 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 交付**（其范围含「每分支 baseline commit 与一次性迁移」）：
清单协议、四条 tag 钩子、`bridge.version` 下限与 `oldBundlePolicy` 校验都已在 `check-migration-release-gate.mjs` 里，
由 `check-migration-release-gate.spec.mjs` 的 39 条注入钩子单测覆盖，并已挂进 PR CI。

**AC US2-14 的绿半边在这里关闭，不在 US-305 里关**。
红半边（`bridge.tag` 为 `null` / 为 `v0.0.25` / 版本常量不吻合时门禁必红）已在真实仓库上成立并留证；
绿半边要的是「补齐真实桥接 tag 后重跑通过」，它只能由发布动作产出，属于发布而不属于代码交付，US-305 因此按代码 AC 关闭。本节承接的内容：

| 项                                                                                                    | 状态                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 真实桥接 tag 存在、是 `main` 祖先、版本严格新于 `0.0.25`、常量低于迁移版本                            | ✅ `v0.0.26` → `852f3b20`（2026-10-01），证据见下 |
| 清单切 `kind=migration` 且 `bridge.*` 指向该 tag，`pnpm check-migration-release-gate` 在真实 tag 上绿 | ⬜ 依赖上一行                                     |
| `oldBundlePolicy` 四选一、`minimumVersion` ≥ 桥接版本、`enforced=true`                                | ⬜ 依赖上一行                                     |

三行全 ✅ 时在此记录 tag、命令与输出，AC US2-14 随之关闭；[epic-006](epics/epic-006-working-tree-commits.md) 的发布判据引用本节。

**第一行的证据（2026-10-01）**：

```text
$ git ls-remote --tags origin 'v0.0.26*'
6c9f875a75302ddf63a440a014b7c3e0d942913b  refs/tags/v0.0.26          # 带注释 tag
852f3b2003d0040878c70f42bda2c3fd367e7d72  refs/tags/v0.0.26^{}       # B，不是 merge commit 8597bddf

$ git merge-base --is-ancestor 'v0.0.26^{commit}' origin/main && echo OK
OK

$ node scripts/check-migration-release-gate.mjs --check --release-tag=v0.0.26
Migration release gate passed for bridge 0.0.26.

$ node scripts/check-migration-release-gate.mjs --check --release-tag=v9.9.9      # 反例
- release.version 0.0.26 does not match tag v9.9.9

$ git grep -E 'RXDB_(SYSTEM_SCHEMA|CHANGE_CODEC)_VERSION =' v0.0.26 -- packages    # 与 v0.0.24 相同
packages/rxdb/src/system/change-codec.ts:33:export const RXDB_CHANGE_CODEC_VERSION = 1 as const;
packages/rxdb/src/system/migration.ts:22:export const RXDB_SYSTEM_SCHEMA_VERSION = 3 as const;

$ gh api repos/aiao-io/rxdb/branches/main/protection --jq .required_linear_history.enabled
true                                                                               # 合入后已恢复，整份保护与合入前快照逐项一致
```

版本严格新于 `0.0.25`：清单 `release.version` 与 `packages/rxdb/package.json` 同为 `0.0.26`，npm 上 34 个包的
`0.0.26` 与发布前在 B 干净检出上 `pnpm pack` 的 tarball shasum 逐个一致。第二、三行留给 epic-006 的首个迁移发布，
届时 `bridge.tag` = `v0.0.26`、`bridge.version` = `0.0.26`。

### 线 A 执行记录（v0.0.26）

| 提交 / 动作   | 内容                                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| `852f3b20` B  | 父提交 `de70a1a9`；bump 到 `0.0.26`、`RXDB_VERSION`、清单、CHANGELOG（六组破坏性改动）                    |
| `627c602e`    | 把 `main`（`98ba8136`）合进发布分支解冲突                                                                 |
| `26914edf`    | 只在 `main` 上的 12 个包对齐到 `0.0.26`，补 lockfile                                                      |
| `2ce9f974`    | adapter-consumer 审计的依赖闭包补上 `rxdb-client-generator`                                               |
| `8597bddf`    | [#77](https://github.com/aiao-io/rxdb/pull/77) 以 merge commit 并回 `main`，前后临时关、恢复线性历史      |
| tag / Release | `v0.0.26` 打在 B；[GitHub Release](https://github.com/aiao-io/rxdb/releases/tag/v0.0.26) 正文取 CHANGELOG |
| npm           | 从 B 的干净检出冻结安装、全量构建后 `pnpm pack`，按依赖拓扑序发布这批 tarball                             |

执行中踩到、下次发布要预先处理的坑：

1. **未发布的新版本号会打断 lockfile 生成**。`.npmrc` 开着 `auto-install-peers=true`，`@aiao/*` 之间的 peer
   会去 registry 解析；对齐到尚未发布的 `0.0.26` 后 lockfile 生成不出来。
   处置：给有 `@aiao/*` peer 的包补一条同名 `workspace:*` devDependency（发布产物不带 devDependencies，不影响消费者）。
2. **adapter-consumer 审计的依赖闭包必须覆盖全部 `@aiao/*` 传递依赖**。
   [scripts/audit/desktop-adapter-consumer.mjs](../scripts/audit/desktop-adapter-consumer.mjs) 只打包
   `SHARED_PACKAGE_DIRECTORIES` 里的包并用 overrides 钉住，漏一个就静默回落到 registry 版本；
   版本号新于 registry 时直接报 `ERR_PNPM_NO_MATCHING_VERSION`。本次补上了 `rxdb-client-generator`。
3. **文档里写死的版本号也要随 bump 改**。`rxdb-adapter-tauri` 两份 README 的 Cargo `tag = "v0.0.25"`
   是 review 发现的真缺陷，已在 B 上改为 `v0.0.26`；`packages/rxdb/src/version.ts` 里 `0.0.25` 的历史注释保留。
4. **npm 发布要过网页两步验证**。账号的 `npm profile` 虽是 `auth-only`，发布仍会报 `EOTP`；npm 12 走
   `--auth-type=web` 的浏览器验证，要求 npm 的 stdin 是终端——在 `while read … < 清单` 循环里调用会直接失败，
   清单须改走其他 fd（`while read -r t <&3; … done 3< 清单`）。验证页勾「5 分钟内不再验证」可一次发完。
5. **首发包在 registry 上有几分钟的传播延迟**，缩略文档（`npm view`）可能比完整文档晚；核对以完整文档的
   `versions["0.0.26"].dist.shasum` 为准。
6. **CI 两个非本次引入的波动**：`ci / benchmarks` 在未冻结参考档的 CPU（Xeon 8370C）上报
   `benchmark_environment_mismatch`，重跑通过；`dev-rxdb-tauri-e2e` 的 `devtools-provider-gear.spec.ts`
   「fake 档 expired 场景」偶发失败，源于 `fake-provider-gear.ts` 的 `createScenarioClock` 用 `setTimeout(…, 0)`
   与下一次分页请求竞态（#58 引入），重跑通过。两者都登记为后续项。

不要用「推一个废弃 tag」来充当证据：tag 是桥接声明本身，
试探性 tag 会污染 `nx release` 的版本计算基准，也会让后续读历史的人分不清哪个 tag 是真的。
