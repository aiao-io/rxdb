# 发布计划

> 本文回答「下一次发布要做什么、按什么顺序」。版本策略本身见 [versioning-policy.md](versioning-policy.md)，排期见 [roadmap.md](roadmap.md)。

## 现在的处境（一屏）

- **发布是手工执行的，由 owner 自己控制时点**：不进 CI、没有任何自动化触发，也没有自动门禁兜底——
  **发布前必须先跑绿 `pnpm test-all`**。仓库里不存在自动发布 workflow，不要再为「什么时候发」反复请示。
- **发布不是开发的闸门**：门禁只挡**迁移发布**（`kind=migration` 的清单），不挡任何故事的编码、测试与合入。
- **桥接版本 `v0.0.26` 已发布（2026-10-01）**：tag 打在 B = `852f3b20`，经 merge commit `8597bddf` 并入 `main`、是 `main` 祖先；
  npm 上 34 个包已有 `0.0.26`（6 个首发）。迁移发布因此有了合法锚点，过程与踩到的坑见[线 A 执行记录](#线-a-执行记录v0026)。
  `v0.0.25` 的 commit 已因 squash 脱离发布主线（`git merge-base --is-ancestor v0.0.25 HEAD` 失败），不得移动或重打，
  也不能作为桥接锚点。
- **系统 schema 版本常量：`v0.0.26` 为 3，`HEAD` 为 7，`RXDB_CHANGE_CODEC_VERSION` 两端都是 1。** 这次抬升还没有发布过，
  下一次发布就是迁移发布，见[下一次发布：迁移发布（schema 3→7）](#下一次发布迁移发布schema-37)。
- **`requirements/migration-release.json` 记录的是已发布的桥接发布**（`kind=bridge`、`version=0.0.26`、`bridge.tag=null`）。
  `bridge.tag` 为 `null` 对 `kind=bridge` 是预期；`pnpm check-migration-release-gate` 在 `HEAD` 上是绿的，
  **这不说明迁移发布已就绪**（见[门禁 tag 钩子的状态](#门禁-tag-钩子的状态)）。
- **[US-218](stories/adapter/US-218-supabase-rls-push-integrity.md) 阶段 A 与阶段 B 必须同一版本发布**（`git show 8cc005bb:specs/007-us218-rls-push-integrity/research.md` D4）：
  阶段 A 让被行级权限拒绝的删除整批失败，没有阶段 B 逐实体回执的客户端会卡在这条变更上。两阶段已同在 `main`，
  阶段 B 把系统 schema 抬到 7，所以它们随迁移发布一起出去。
- **自动生成的 changelog 只认 `feat` / `fix` 与 `!` / `BREAKING CHANGE:` 脚注**，会多报、漏报，破坏性改动一个字都不写，
  定稿必须人工过一遍（见下一次发布一节与[约束 12 修订](#约束-12-修订破坏性改动如实声明)）。

## 开项：版本漂移

已关闭：

- `@aiao/rxdb@0.0.25` 的 `RXDB_VERSION` 报 `'0.0.24'`：源码已修，`0.0.26` 起与包版本一致（`version.spec.ts` 守着）。
  已发布的 `0.0.25` 产物改不了。
- `@aiao/code-editor-angular` 的 peer 下界低于工作区版本：已修，当前为 `">=0.0.26"`。
- `v0.0.25` tag 的树与 npm 上的 `0.0.25` 产物一致：`@aiao/rxdb` 与 `@aiao/rxdb-client-generator` 两个包的 `src` 逐文件相同，
  tag 树里的 `RXDB_VERSION` 本来就是 `'0.0.24'`。「某个改动发没发过」可以用 tag 祖先链判断，也可以 `npm pack` 拉产物搜；
  两者在本仓库一致。

未关闭，**每条的处置都不在本文范围内**：

1. **US-018 在 `0.0.26` 里首发却漏声明。** [US-018](stories/core/US-018-generator-default-serialization.md) 的破坏性实现
   `unsupportedDefaultFactory` 落在 `a63321c9`（#39），首发于 `@aiao/rxdb-client-generator@0.0.26`
   （`npm pack` 取 `0.0.25` 产物 grep 为 0，取 `0.0.26` 产物命中）。`0.0.26` 的 changelog 当时按「已随 `0.0.25` 发出」处理而没有声明。
   `CHANGELOG.md` 的 `0.0.26` 已补录，迁移页 [generator-default.md](../website/docs/migration/generator-default.md) 早已存在。
   **owner 后续动作**：GitHub Release `v0.0.26` 的正文取自 CHANGELOG，需要同步这一条；npm 上的包不用动。
2. **`@aiao/rxdb-model@0.0.26` 的产物来自 `next-11`，装上即坏。** 它于 2026-10-05T01:16Z 发到 npm（`latest` 仍是 `0.0.19`），
   依赖是 `uuid ^14.0.2`，对应提交 `67c12d1d`——这个提交既不在 `main`、也不在 `v0.0.26` 的树里。产物导入
   `getEntityPermission`、`isManualOrderEntity`、`manualOrderGroupFields`、`normalizeManualOrderBy`，这四个符号
   在 `@aiao/rxdb@0.0.26` 里不存在，而它的依赖又钉死在 `@aiao/rxdb` `0.0.26`。
   处置：**owner 稍后处理（deprecate 或随下次发版覆盖）。** 其余没有 `0.0.26` 的 15 个包是 replay / tree / working-tree 各 4 个与
   `rxdb-model-{angular,react,vue}`（复核：`npm view @aiao/<包名> versions`）。
3. **`@aiao/rxdb-angular` 单独为 `0.0.27`，`@aiao/*` peer 改成了字面 `^0.0.26`；7 个 Angular 包的 `@angular/*` peer 钉成精确的 `"22.2.2"`。**
   前者来自 `1e8336cd`（提交信息只有 `23`），违反「工作区同号」；后者让消费方的 Angular 小版本必须与之完全相同。
   处置：**owner 决定下次统一发版时处理。**

## 开项：迁移发布须承接的发布说明

下面三条**不影响门禁**，但都必须在迁移发布当下人工承接。

### ① 有一类库「未认领能力守卫」接不住

抽包后由 `__rxdb_capability__:` 水位行（见 `system/capability-watermark.ts`）裁决「这个库启用过哪些插件能力」，未装插件却开过能力的库会被拒绝连接。
但**抽包之前**就启用过提交能力的库接不住：它停在水位 4 / 5，十张表带着真实数据物理还在，却**没有能力水位行**。
新客户端即便不装插件也照常打开它，写入不再经过捕获。

**不为它单开迁移**：epic-006 一行都没发出去过（已发布的 `@aiao/rxdb@0.0.25` / `0.0.26` 里 `RXDB_SYSTEM_SCHEMA_VERSION = 3`），
这批库只存在于开发机上。但这是个判断而不是保证，所以进 release note——谁在本机开过 epic-006 的提交能力，删库重建，不要带着它升上来。

### ② 三个框架绑定包的破坏性变更

`useWorkingTree` / `WorkingTreeResource` 不在 `@aiao/rxdb-{angular,react,vue}` 里，由
`@aiao/rxdb-plugin-working-tree-{angular,react,vue}` 三端同名提供。这三个符号从未发布过，所以对已发布版本**不是**破坏性变更，
但升级说明仍要写：跟着 `main` 开发的下游要改 import 来源。

### ③ 已知影响：系统 schema 号抬升之后，旧客户端打不开升级过的库

**判据**：`assertSupportedRxDBSystemVersions()`（`packages/rxdb/src/system/migration.ts`）在建连时比对库里的水位与进程常量，
`stored > supported` 即抛 `UnsupportedRxDBSystemVersionError`，消息形如
`Unsupported RxDB system schema version: stored=7, supported=3`。两个适配器家族各有一处调用点
（`migrate_system_schema.ts` 的 PGlite 路径、`RxDBAdapterSqliteBase.ts` 的 sqlite-core 路径），都排在迁移阶梯之前。

**影响面恰好是一个方向**：升级过的库 + 旧客户端。旧库 + 新客户端走 `<` 那一侧，由迁移阶梯补齐；同一个客户端反复打开自己升过的库也不受影响。
这条守卫早于 epic-006 就在（`v0.0.24` 起 `RXDB_SYSTEM_SCHEMA_VERSION = 3`），2 → 3 那次抬升对停在 2 的客户端是同一个拒绝，
不是新增的危险面；写进 release note 是为了让升级者提前知道「降级回旧版本客户端这条路已经关了」。

**版本号按发布当下的实况写**：`v0.0.26` 之后的发布写「3 → 7」。中间的 4、5、6、7 这几级从未单独发布，用户手里不存在停在这些水位的客户端
（4 / 5 / 6 来自 epic-006，7 来自 US-218 阶段 B）。**没有缓解措施，也不该造一个**：让新库对旧客户端「看起来能打开」需要向下兼容地写系统表，
那正是 fail-closed 要挡的事。说明里给出的动作只有一个——**升级客户端**。

## 下一次发布：迁移发布（schema 3→7）

下一次发布要把系统 schema 从桥接版本的 3 一次抬到 `HEAD` 的 7，所以是 `kind=migration`。

**门禁对这次清单的要求**（逐条取自 `scripts/check-migration-release-gate.mjs` 的 `validateManifest`）：

| 项                                                   | 要求                                                                                                                      |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `release.kind`                                       | `migration`                                                                                                               |
| `release.version`                                    | 严格 semver，且与 `packages/rxdb/package.json` 的版本、发布 tag（`v<version>`）三处相同；具体取值**待定**，见下           |
| `release.systemSchemaUpgrade` / `changeCodecUpgrade` | `systemSchemaUpgrade=true`（tag 上 3 < 工作树 7）；codec 仍是 1，`changeCodecUpgrade` 保持 `false`；两者至少一个为 `true` |
| `bridge.tag` / `bridge.version`                      | `v0.0.26` / `0.0.26`；tag 存在、是 `HEAD` 祖先、含迁移面四个文件、版本严格新于 `0.0.25` 且旧于 `release.version`          |
| `oldBundlePolicy.strategy`                           | `force-update` / `cache-invalidation` / `server-version` / `database-namespace` 四选一；选哪项**待定**（owner）           |
| `oldBundlePolicy.minimumVersion` / `enforced`        | `minimumVersion` 不低于 `0.0.26`；`enforced=true`                                                                         |
| `release.protocolVersion`                            | 正整数，当前为 `1`                                                                                                        |

**版本号是算出来的，不是选的**：`conventionalCommits: true`，`nx.json` 只自定义了 `cleanup` / `__INVALID__` 两个类型（均 `semverBump: none`），
其余走 nx 23.3.0 的默认配置——只有 `feat:` → minor、`fix:` → patch，其余全部 `none`；非规范标题一律 `none`。
`adjustSemverBumpsForZeroMajorVersion` 默认 `true`，major 为 0 时 `minor` 降成 `patch`。基准 tag 现在解析为 `v0.0.26`
（`git describe --tags --abbrev=0` 与 nx 都是），所以默认推算大概率是 `0.0.27`（**推断**，以 `pnpm nx release version --dry-run` 的输出为准）。
是否取 `0.0.27` **待定**；`@aiao/rxdb-angular` 已经单独是 `0.0.27`（见上方开项 3），取值时一并处理。
`preVersionCommand` 会先全量构建 `packages/*`，它红了 dry-run 就跑不到版本计算，报错只有一句 `The pre-version command failed`；
`node_modules` 漂移时需要 `pnpm install --frozen-lockfile --force`。动手前确认 dry-run 真的输出了版本号。

**changelog 区间从 `v0.0.26` 起量。** 特性分支上有大量 `123` / `213213` 类中间提交，squash 后不进 `main`，所以在 `main` 上量：

```bash
git log --format='%h %s' v0.0.26..origin/main | grep -vE ' (feat|fix|chore|docs|refactor|test|perf|build|ci|style|revert|cleanup)(\(.*\))?!?:'
```

应当无输出（2026-10-06 实测无输出）；这是每次推送前的例行检查，不是一次性清理。
已知该区间里有破坏性改动，nx 不会写进 changelog，须人工声明并链迁移页：
[supabase-update-push](../website/docs/migration/supabase-update-push.md)、
[supabase-push-receipts](../website/docs/migration/supabase-push-receipts.md)、
[working-tree-split](../website/docs/migration/working-tree-split.md)、[tree-split](../website/docs/migration/tree-split.md)，
以及 [v1.md「0.0.26 之后」](../website/docs/migration/v1.md) 登记的各项。完整清单发布当下以 `requirements/api-baseline` 对 `v0.0.26` 的 diff 为准。

**执行步骤：待定。** 需要 owner 决定版本号与 `oldBundlePolicy` 之后再写；不预设分支策略。
[线 A 执行记录](#线-a-执行记录v0026)里的坑（lockfile、adapter-consumer 审计、README 里的版本号、npm 网页两步验证）同样适用。
清单切到 `migration` 之后，PR CI 里的门禁会用真实 git 跑 `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` /
`bridgeTagVersionConstants`；本地预检：

```bash
pnpm nx run @aiao/source:migration-release-gate-test
pnpm nx run @aiao/source:migration-release-gate --args="--release-tag=v<版本>"
```

关闭条件见[迁移发布的关闭条件](#迁移发布的关闭条件)。

## 桥接锚点定案

**已定案并执行（2026-10-01，owner）：为桥接开一次非 squash 的例外，锚点 `de70a1a9`，版本 `0.0.26`。**

**当时的处境**（2026-09-25 实测）：

```text
de70a1a9 (#61)  → RXDB_SYSTEM_SCHEMA_VERSION = 3，packages/rxdb/package.json = 0.0.25   ← main 上最后一个 schema 3 的提交
2132c30d (#55)  → RXDB_SYSTEM_SCHEMA_VERSION = 6，packages/rxdb/package.json = 0.0.25   ← 一次 squash 抬 3 → 6
```

原计划是桥接先发、schema 升级后合，而 #55 把升级先合进了 `main`。迁移发布要求桥接 tag 同时满足「是 `main` 祖先」「包版本 = tag 版本且严格新于 `0.0.25`」
「系统常量低于迁移版本，且桥接本身不抬常量」。schema 3 的提交缺第二条（squash 下 bump 提交进不了 `main`），
schema 6 的提交缺第三条（桥接会把 3 → 6 直接发出去，旧客户端撞的 `UnsupportedRxDBSystemVersionError` 提前到桥接那一版，桥接的意义就没了）。

**三条出路的取舍**：

1. ✅ **选定：为桥接开一次非 squash 的例外。** bump 提交 B 是 `de70a1a9` 的子提交，作为 merge commit 的第二父提交进入 `main` 祖先链。
   B 的树上 schema 3 / codec 1，与 `v0.0.24` 两端取值相等；包版本 `0.0.26` 严格新于 `0.0.25`。
2. ✗ 否决：revert `2132c30d` 里的常量与迁移部分，先发桥接再重新合入。3 → 6 连着十张表与抽包，revert 等于把 epic-006 从 `main` 拆出去。
3. ✗ 否决：承认这一轮没有桥接。`bridge.tag` 必填，要走这条就得改清单协议与门禁，改的是 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 本身。

**桥接的硬不变量只有一条：桥接版本不得抬升 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。**
门禁对 `kind=bridge` 只校验两个升级位是 `false`，**从不读源码常量**，唯一防线是人工复测两端取值。
复测用 `git log -G`，**不能用 `-S`**：`-S` 统计字符串出现次数的变化，把 `= 3` 改成 `= 6` 时串前后各出现 1 次，`-S` 恒空，是假清白。

**执行时查出的三条约束**（下一次需要合并方式例外时同样适用）：

1. **分支保护要临时松一次。** `main` 的保护是 `required_linear_history: true`、`enforce_admins: true`，必过检查 `ci / gate`；仓库设置 `allow_merge_commit: true`。
   线性历史会拒收 merge commit，所以真 merge 前要临时关闭「Require linear history」，合完**立即**恢复，再用
   `gh api repos/{owner}/{repo}/branches/main/protection --jq .required_linear_history.enabled` 复查并留证。
2. **只有真 merge 保得住 B。** rebase merge 与 squash 都会重写 B；PR 只能用「Create a merge commit」。
3. **先合入、验祖先、最后打 tag。** 合入后跑 `git merge-base --is-ancestor <B> origin/main`，成功了才在 **B**（不是 merge commit）上打 tag，
   并从 B 的干净检出发布。

**副作用**：`main` 从此有了 merge commit（`8597bddf`，标题 `chore(aiao): merge bridge v0.0.26 into main`）。
merge commit 标题必须是规范形式，且 scope 在 commitlint 白名单内（`release` 不在），否则下一次 changelog 会以 `__INVALID__` 收进它。
`packages/rxdb/src/version.ts` 的 `RXDB_VERSION` 不在 `nx release version` 的改写范围内，必须手改。
桥接区间被冻结为 `v0.0.24..B`，`de70a1a9` 之后合入 `main` 的提交不在 `v0.0.26` 里。

### 约束 12 修订：破坏性改动如实声明

[排期约束 12](roadmap.md#排期约束)原文「桥接版本不得对外宣告破坏性改动」在任何锚点上都满足不了：
区间 `v0.0.24..de70a1a9` 里已有多组**首发**的破坏性改动，它们在 `main` 上早于锚点。
owner 定案（2026-10-01）：桥接区间可以带锚点之前已在 `main` 上的破坏性改动，但 changelog 必须逐条如实声明并附迁移说明；
桥接的硬不变量只有「不抬系统版本常量」。

区间内**没有**一条提交带 `!` 或 `BREAKING CHANGE:` 脚注，所以自动生成的 changelog 对这些改动一个字都不会写，只能人工补。
证据口径是 `npm pack` 拉已发布产物：下表每个名字在 `@aiao/rxdb@0.0.25` 的产物里都能从 `dist/index.d.ts` 触达，
在 `de70a1a9` 的 `requirements/api-baseline/rxdb.json` 里都已不在。

| 组                    | 移除提交          | 名字                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | 去向                                                                                                                                                                                                        | 迁移说明                                                                                                                                             |
| --------------------- | ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| writer lease（16 个） | `073ecb05`（#10） | `assertRxDBUpgradeClaimable`、`createRxDBActiveWriterLeaseError`、`readRxDBUpgradeGuard`、`readRxDBWriterLease`、`resolveRxDBWriterEpoch`、`RXDB_UPGRADE_GUARD_TABLE_NAME`、`RXDB_UPGRADE_OWNER_TTL_MS`、`RXDB_WRITER_HEARTBEAT_INTERVAL_MS`、`RXDB_WRITER_LEASE_TABLE_NAME`、`RXDB_WRITER_LEASE_TTL_MS`、`RXDB_WRITER_PROTOCOL_VERSION`、`RxDBUpgradeGuardSnapshot`、`RxDBUpgradeGuardState`、`RxDBWriterLeaseError`、`RxDBWriterLeaseErrorCode`、`RxDBWriterLeaseSnapshot` | 删除，无替代（US-304 取消）                                                                                                                                                                                 | [writer-lease-removal.md](../website/docs/migration/writer-lease-removal.md)：删掉调用即可；跨 realm 排他由发布系统承担；含 PGlite 残留两张表的处理  |
| 同步选项（1 个）      | `2cf208f5`（#52） | `RemoteSyncOptions`                                                                                                                                                                                                                                                                                                                                                                                                                                                          | `conflictResolver` 挪进 `PullOptions`，`autoSync` 删除                                                                                                                                                      | [remote-sync-options.md](../website/docs/migration/remote-sync-options.md)：孤立类型，0.0.25 里没有 API 接收它                                       |
| US-025 抽包（13 个）  | `de70a1a9`（#61） | `BulkSyncOptions`、`BulkSyncResult`、`CheckRepositoryUpdatesResult`、`cleanupExpired`、`CleanupExpiredOptions`、`CleanupExpiredResult`、`DependencyGraph`、`RepositorySyncStatus`、`syncBranches`、`SyncBranchesResult`、`RxDBCrossScopeTransactionError`、`VersionManager`、`QueryCacheRepository`                                                                                                                                                                          | 前 10 个进 `@aiao/rxdb-plugin-sync`，`RxDBCrossScopeTransactionError` / `VersionManager` 进 `@aiao/rxdb-plugin-history`，`QueryCacheRepository` 改名为 `@aiao/rxdb-plugin-querycache` 的 `QueryCacheEngine` | [history-sync-plugins.md](../website/docs/migration/history-sync-plugins.md)、[querycache-plugin.md](../website/docs/migration/querycache-plugin.md) |

三个插件包随 `0.0.26` 首发；声明时写「从 `@aiao/rxdb` 移出、改由插件包提供」，不要写成「插件包的破坏性变更」。

**上表只覆盖 `@aiao/rxdb` 的导出面，不是全部。** 把 29 个已发布包的 `0.0.25` 产物与 B 的构建产物逐包比对导出名、再按迁移页逐条核对，
另有四组同样是**首发**、同样没有 `!` 脚注的破坏性改动，也进 changelog：

| 组                    | 提交              | 影响                                                                                                                                                               | 迁移页                                                                             |
| --------------------- | ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| 桌面适配器拆包        | `39dba16f`（#29） | `@aiao/rxdb-adapter-desktop@0.0.25` 在 B 上已无此包，由 `-electron` / `-tauri` 两个首发包取代                                                                      | [desktop-split.md](../website/docs/migration/desktop-split.md)                     |
| 插件作用域契约        | `43d1a053`（#34） | `install()` 改收 `LifecycleScope`，插件自带 `destroy()` 拆卸改为宿主逆序释放；自写插件要改                                                                         | [plugin-scope.md](../website/docs/migration/plugin-scope.md)                       |
| Supabase 传输失败错误 | `a63321c9`（#39） | 连不上远端时从 `SupabaseDataError` 改抛 core 的 `NetworkOfflineError`；按旧类型捕获网络失败的代码要改                                                              | [supabase-network-errors.md](../website/docs/migration/supabase-network-errors.md) |
| 生成器 `default` 语义 | `a63321c9`（#39） | 序列化改为按运行时类型分派；函数默认值此前被静默丢弃，现在生成期抛 `unsupportedDefaultFactory`（[US-018](stories/core/US-018-generator-default-serialization.md)） | [generator-default.md](../website/docs/migration/generator-default.md)             |

合计七组（`@aiao/rxdb` 导出面三组 + 其余四组），与 `CHANGELOG.md` `0.0.26` 的七条一一对应。

writer lease 那组在 `@aiao/rxdb` 之外还带走两处：`@aiao/rxdb-adapter-sqlite-core/testing` 的 `rowsAffectedConformanceSuite`
与 `RxDBAdapterLocalBase.startWriterLease()`，都已写进 writer-lease-removal 迁移页。
`a63321c9` 里的 `http-page-token` 迁移页不算：`@aiao/rxdb-adapter-http` 本身就是 `0.0.26` 首发，对外没有旧名可迁。

## 执行顺序

0. **门禁的 git 钩子面已挂进 PR CI**（不依赖发布）：`migration-release-gate` 在 PR CI 的 `setup` job
   （`ci-template.yml` 的 “Migration release manifest gate”），**不带** `--release-tag`，用真实 git 执行
   `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol`。两处配套改动是这一步成立的前提：
   - `setup` 的 checkout 加了 `fetch-tags: true`。`fetch-depth: 0` 只保证历史完整；actions/checkout 在 refspec 不含 `refs/tags/*` 时
     一律加 `--no-tags`，runner 上根本没有 tag，钩子会变成恒假门禁。
   - 脚本按 `GITHUB_REF_TYPE` 解析发布 tag（`resolveReleaseTag`）：PR 事件下 `GITHUB_REF_NAME` 是 `42/merge`，
     直接取会让每个 PR 都红在与发布无关的 `release.version … does not match tag 42/merge` 上。

   这些钩子只对 `kind=migration` 生效，下一次迁移发布才会真正吃到。

1. **桥接发布（线 A，已完成）**——四段，顺序不可交换：

   | 段  | 动作                                                                     | 为什么必须在这个位置                                                                        | 状态 |
   | --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- | ---- |
   | 1   | 从 `de70a1a9` 切发布分支，只提交版本 bump、`version.ts` 与清单（提交 B） | 锚点树必须是 schema 3；bump 只能是 `de70a1a9` 的子提交                                      | ✅   |
   | 2   | 以**真 merge** 并回 `main`                                               | squash 与 rebase 都会重写 B；只有真 merge 让 B 进入 `main` 祖先链，且要临时放开线性历史保护 | ✅   |
   | 3   | 验祖先后在 B 上打 `v0.0.26`，从 B 发布                                   | 桥接 tag 只有在 `main` 祖先链上，将来的 migration 发布才引用得了；tag 最后打                | ✅   |
   | 4   | 在真实迁移发布上验证门禁                                                 | 四条 tag 钩子、`bridge.version` 下限与 `oldBundlePolicy` 只有在真实迁移发布上才验得全       | ⬜   |

   第 4 段随迁移发布做，见[下一次发布](#下一次发布迁移发布schema-37)。桥接段不能塞进 [US-305](stories/collaboration/US-305-commit-graph-head.md)：
   US-305 的范围含「已有数据库的一次性初始化」，属 schema 迁移，会强制 `kind=migration`，而 migration 要求 `bridge.tag` 指向一个已存在的桥接发布。

### 门禁 tag 钩子的状态

`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 已用真实 tag 做过正反两组对照：真 tag 一条报错都没有，伪造 tag（`v9.9.9`）全部报出，
fail-closed 成立。第四条钩子 `bridgeTagVersionConstants` 从 tag 上读 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 并与清单的升级位比对：
声明了升级就必须严格更旧，没声明就必须完全相等。另有一条 `bridge.version` 必须严格新于 `0.0.25` 的下限。

⚠️ **版本常量比对挡不住 `v0.0.24`。** `v0.0.24` / `v0.0.25` / `v0.0.26` 的两个常量都是 `{3, 1}`，迁移发布声明了升级后，拿 `v0.0.24` 当锚点同样通过「严格更旧」。
真正挡住空桥的**只有** `bridge.version` 下限那一条硬编码：比对那条只管「升级位撒谎」，下限那条只管「锚点太老」，互不是备份。

⚠️ **这四条只对 `kind=migration` 生效**（`validateManifest` 把它们放在 migration 分支里）。当前清单是 `kind=bridge`，
所以门禁在 `HEAD`（schema 7）上也是绿的：

```bash
$ node scripts/check-migration-release-gate.mjs --check
Migration release gate passed for bridge 0.0.26.          # exit 0
```

「门禁全绿」不能作为「迁移发布已就绪」的证据。`bridgeTagSupportsProtocol` 只用 `git cat-file -e` 校验四个文件存在、不校验内容，
单独不能证明该 tag 含可用的迁移实现。

### 迁移发布的关闭条件

关闭迁移发布门禁要两件事：本仓库存在位于 `HEAD` 祖先链上的桥接 tag，以及发布门禁阻止升级、或强制更新 / 缓存失效 / 新命名空间隔离。

| 子句                                                 | 状态                                   |
| ---------------------------------------------------- | -------------------------------------- |
| 本仓库须存在位于 HEAD 祖先链上的桥接 tag             | ✅ `v0.0.26`                           |
| 发布门禁阻止升级，或强制更新/缓存失效/新命名空间隔离 | ❌ 需要一次真实 migration 发布才验得了 |

真正关闭迁移发布门禁的那次发布必须同时满足：抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 或 `RXDB_CHANGE_CODEC_VERSION`、
清单切 `kind=migration`、`bridge.tag` / `bridge.version` 指向该次桥接版本、`oldBundlePolicy.strategy` 四选一、
`minimumVersion` 不低于桥接版本、`enforced=true`。

**这条门禁的代码由 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 交付**（其范围含「每分支 baseline commit 与一次性迁移」）：
清单协议、四条 tag 钩子、`bridge.version` 下限与 `oldBundlePolicy` 校验都在 `check-migration-release-gate.mjs` 里，
由 `check-migration-release-gate.spec.mjs` 的注入钩子单测覆盖，并已挂进 PR CI。

**AC US2-14 的绿半边在这里关闭，不在 US-305 里关**。红半边（`bridge.tag` 为 `null` / 为 `v0.0.25` / 版本常量不吻合时门禁必红）
已在真实仓库上成立并留证；绿半边要的是「补齐真实桥接 tag 后重跑通过」，只能由发布动作产出，US-305 因此按代码 AC 关闭。本节承接的内容：

| 项                                                                                                    | 状态                                              |
| ----------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| 真实桥接 tag 存在、是 `main` 祖先、版本严格新于 `0.0.25`、常量低于迁移版本                            | ✅ `v0.0.26` → `852f3b20`（2026-10-01），证据见下 |
| 清单切 `kind=migration` 且 `bridge.*` 指向该 tag，`pnpm check-migration-release-gate` 在真实 tag 上绿 | ⬜ 待迁移发布                                     |
| `oldBundlePolicy` 四选一、`minimumVersion` ≥ 桥接版本、`enforced=true`                                | ⬜ 待迁移发布                                     |

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

版本严格新于 `0.0.25`：清单 `release.version` 与 `packages/rxdb/package.json`（当时）同为 `0.0.26`，npm 上 34 个包的
`0.0.26` 与发布前在 B 干净检出上 `pnpm pack` 的 tarball shasum 逐个一致。第二、三行留给迁移发布，届时 `bridge.tag` = `v0.0.26`、`bridge.version` = `0.0.26`。

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

npm 上 `@aiao/rxdb-plugin-history`、`-sync`、`@aiao/rxdb-adapter-electron`、`-tauri` 各有一个 `0.0.0-stage` 占位版本（首发时建包留下的）；
`@aiao/rxdb-model@0.0.26` 不在这批里，见[开项：版本漂移](#开项版本漂移)。

执行中踩到、下次发布要预先处理的坑：

1. **未发布的新版本号会打断 lockfile 生成**。`.npmrc` 开着 `auto-install-peers=true`，`@aiao/*` 之间的 peer
   会去 registry 解析；对齐到尚未发布的版本号后 lockfile 生成不出来。
   处置：给有 `@aiao/*` peer 的包补一条同名 `workspace:*` devDependency（发布产物不带 devDependencies，不影响消费者）。
2. **adapter-consumer 审计的依赖闭包必须覆盖全部 `@aiao/*` 传递依赖**。
   [scripts/audit/desktop-adapter-consumer.mjs](../scripts/audit/desktop-adapter-consumer.mjs) 只打包
   `SHARED_PACKAGE_DIRECTORIES` 里的包并用 overrides 钉住，漏一个就静默回落到 registry 版本；
   版本号新于 registry 时直接报 `ERR_PNPM_NO_MATCHING_VERSION`。
3. **文档里写死的版本号也要随 bump 改**。`rxdb-adapter-tauri` 两份 README 的 Cargo `tag = "v0.0.26"` 要跟着改；
   `packages/rxdb/src/version.ts` 里历史版本的注释保留。
4. **npm 发布要过网页两步验证**。账号的 `npm profile` 虽是 `auth-only`，发布仍会报 `EOTP`；npm 12 走
   `--auth-type=web` 的浏览器验证，要求 npm 的 stdin 是终端——在 `while read … < 清单` 循环里调用会直接失败，
   清单须改走其他 fd（`while read -r t <&3; … done 3< 清单`）。验证页勾「5 分钟内不再验证」可一次发完。
5. **首发包在 registry 上有几分钟的传播延迟**，缩略文档（`npm view`）可能比完整文档晚；核对以完整文档的
   `versions["<版本>"].dist.shasum` 为准。
6. **CI 两个非本次引入的波动**：`ci / benchmarks` 在未冻结参考档的 CPU（Xeon 8370C）上报
   `benchmark_environment_mismatch`，重跑通过；`dev-rxdb-tauri-e2e` 的 `devtools-provider-gear.spec.ts`
   「fake 档 expired 场景」偶发失败，源于 `fake-provider-gear.ts` 的 `createScenarioClock` 用 `setTimeout(…, 0)`
   与下一次分页请求竞态（#58 引入），重跑通过。两者登记在 [roadmap](roadmap.md) 的零散收尾项。

不要用「推一个废弃 tag」来充当证据：tag 是桥接声明本身，试探性 tag 会污染 `nx release` 的版本计算基准，
也会让后续读历史的人分不清哪个 tag 是真的。
