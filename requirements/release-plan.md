# 发布计划

> 本文回答「下一次发布要做什么、按什么顺序」。版本策略本身见 [versioning-policy.md](versioning-policy.md)，排期见 [roadmap.md](roadmap.md)。

## 现在的处境（一屏）

- **发布已改为手工执行**，没有自动门禁兜底——**发布前必须先跑绿 `pnpm test-all`**。
- 历史桥接 tag `v0.0.25` 的 commit 已因后续 squash **脱离当前发布主线**（`git merge-base --is-ancestor v0.0.25 HEAD` 失败），
  不得移动或重打，也**不能再作为 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 migration bridge**。
- 因此下一次 schema migration 之前，**必须先从届时的发布主线重新发布一个 `kind=bridge` 的非迁移版本**。
  实际 tag/version 由 release manifest 冻结，不在需求里预猜。
- 已发布的 `@aiao/rxdb@0.0.25` 在报假版本号，见下方[版本漂移开项](#开项0025-遗留的两条版本漂移)。

## 开项：0.0.25 遗留的两条版本漂移

2026-08-15 发现，**源码已修，已发布产物无法修**。两条都源自 0.0.25 的版本 bump 只改了 `package.json`，一度让 `pnpm test-all` 变红：

- `packages/rxdb/src/version.ts` 的 `RXDB_VERSION` 停在 `'0.0.24'`——**已发布的 `@aiao/rxdb@0.0.25` 在报假版本**；
- `packages/code-editor-angular` 的 peer `"@aiao/code-editor": ">=0.0.24"` 下界低于工作区版本。

两条各自都已有断言在守，**断言没坏，是没人跑绿就发了版**。源码已改、两个 project 恢复全绿；
但 npm 上的 0.0.25 产物改不了，`rxdb.version` 报错版本这件事要写进 0.0.26 的 release note。

## 下一次发布计划（桥接版本）

> **2026-08-15 主线复核**：下文保留 `v0.0.25` 的历史执行记录，但该 tag 已脱离当前发布主线（见上方「现在的处境」）。

[US-304](stories/collaboration/US-304-writer-lease-migration-fencing.md) 的 AC1/AC11 卡在「本仓库没有任何 tag 被声明为桥接版本」。
决策已定：**另打一个新 tag 作为桥接版本，不追认 `v0.0.24`**。本节固化发布顺序与关闭判据。
版本号由 `nx release` 按 conventional commits 计算得出（见下方硬前提 2）。本节写作时 `0.0.25` 只是占位；
**实际算出来也是 `0.0.25`**（2026-08-13 执行，理由见[执行记录](#执行记录2026-08-13)——是 `fix:` 而非 `feat:` 撑起来的 patch）。

整体是四段，**顺序不可交换**：

| 段  | 动作                                                                            | 为什么必须在这个位置                                                                        |
| --- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1   | 交付 [US-207](stories/adapter/US-207-desktop-local-database.md) 桌面本地 SQLite | 没有可 bump 的提交就发不出版本（见现状实测末行）；且它是纯适配器路径，不会污染桥接版本      |
| 2   | 合入 `main`                                                                     | tag 必须打在 `main` 上，本仓库一律 squash——先打 tag 再 squash 会让 tag 提交脱离 `main` 历史 |
| 3   | 打桥接 tag 发布                                                                 | 桥接 tag 只有存在于 `main` 祖先链上，将来的 migration 发布才引用得了                        |
| 4   | 验证并修复迁移 fencing                                                          | AC11 的门禁三钩子（tag 存在/是祖先/含协议）在没有真实桥接 tag 之前只能靠桩，验不了          |

**选 US-207 而不是 US-305**：US-305 的范围含「已有数据库的一次性初始化」，属 schema 迁移，会强制
`kind=migration`，而 migration 要求 `bridge.tag` 指向一个**已存在**的桥接发布——现在没有，直接死锁。
US-207 是纯适配器/桌面路径，不动系统版本常量，能干净地落成桥接锚点。US-305 是第 4 段之后
那次 migration 发布的内容。

### 现状实测（2026-08-13）

| 事实                                                                                                             | 实测                                                                                          | 影响                                                                                  |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| HEAD 与 `v0.0.24` 的 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_WRITER_PROTOCOL_VERSION` / `RXDB_CHANGE_CODEC_VERSION` | 均为 `3` / `1` / `1`，两侧完全相同                                                            | 下一版**不升级任何系统版本**，只能是 `kind=bridge`，够不着 `migration`                |
| `v0.0.24` 的清单                                                                                                 | `kind=bridge`、`release.version=0.0.25`，而同 tag 的 `packages/rxdb/package.json` 是 `0.0.24` | 版本漂移；门禁在该 tag 上只报一条 `release.version 0.0.25 does not match tag v0.0.24` |
| `v0.0.24` 的 `publish.yml`                                                                                       | 门禁两步已经排在 build / `nx release publish` 之前                                            | 门禁不是「没装」，是没在真实发布路径上跑过                                            |
| `v0.0.24` tag                                                                                                    | 已推送 origin、是 HEAD 祖先，指向提交 `init`                                                  | 本仓库是重新初始化的历史；npm 上的 `0.0.24` 不是经这条流水线发出来的                  |
| 门禁的触发面                                                                                                     | PR CI 的 `setup` job 跑 `pnpm test-scripts`，已含清单 ↔ 包版本的绑定校验                      | 漂移**已经**能在 PR 上发现；仅 `bridgeTag*` 三个 git 钩子还只在 tag 时跑              |
| 仓库的合并方式                                                                                                   | 全历史零 merge commit，PR #2–#5 均为 squash                                                   | tag 必须打在 main 上；打在特性分支再 squash 会让 tag 提交脱离 main 历史               |
| `v0.0.24..HEAD` 的 11 个提交                                                                                     | 7 个非规范（`123` / `up`，nx 解析不到），4 个是 `chore` / `docs` → `semverBump: 'none'`       | **当前可 bump 量为零**，此刻跑 `nx release version` 算不出新版本                      |

### 两条硬前提

先说两件会让整个计划作废的事，动手前必须确认：

1. **桥接版本不得抬升系统版本常量**。`bridge` 的定义就是「发布了 writer lease 协议、但不改
   schema/codec，让所有实例先升到它」；门禁对 `kind=bridge` + `systemSchemaUpgrade|changeCodecUpgrade=true`
   直接报 `bridge releases cannot upgrade system schema or change codec`。所以随这一版发布的功能
   **不能动** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`。若那个功能必须升 schema，
   它得排到桥接版本**之后**单独发——否则就会掉进「migration 需要先有 bridge tag，而 bridge tag 又被这次升级污染」的死锁。
2. **版本号是算出来的，不是选的**。`conventionalCommits: true` 且 `nx.json` 未自定义类型映射，
   走 nx 23.1.1 的 `DEFAULT_CONVENTIONAL_COMMITS_CONFIG`：**只有 `feat:` → minor、`fix:` → patch，
   其余全部 `none`**（`perf` / `refactor` / `docs` / `build` / `types` / `chore` / `examples` / `test` / `style`）。
   两个推论：

   - 当前 `v0.0.24..HEAD` 一个可 bump 的提交都没有，**不落功能就发不出版本**——这正是本计划把
     US-207 排在发布之前的硬原因，不是排期偏好。
   - US-207 以 `feat:` 落地会算出 **`0.1.0`** 而非 `0.0.25`。桥接版本号本身叫什么无所谓
     （后续 migration 的 `bridge.version` 照抄即可）；若坚持 `0.0.25`，需显式传版本号覆盖推算结果。
     无论取哪个，清单、tag、`packages/rxdb/package.json` 三处必须同为那个实际值——本节写 `0.0.25` 只是占位。

### 执行顺序

0. **补齐门禁的 git 钩子面**（不依赖发布，可立即做）：PR CI 的 `setup` job 已经通过 `pnpm test-scripts`
   校验签入清单的结构与「清单 ↔ `packages/rxdb/package.json` 版本一致」，`v0.0.24` 那类漂移现在拦得住。
   仍缺的是 `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` ——单测里它们被
   `passingHooks` 桩掉了。把 `migration-release-gate`（不带 `--release-tag`）挂进 PR CI 才能用真实 git 校验。
   这三条只对 `kind=migration` 生效，本次桥接发布用不上，但下一个迁移周期会用上。
1. **交付 US-207 并合入 `main`，再打 tag**——顺序不能反。落地时两条约束：提交必须是规范的
   `feat(...)`（否则 bump 量仍为零，发不出版本），且**不得改动** `RXDB_SYSTEM_SCHEMA_VERSION` /
   `RXDB_CHANGE_CODEC_VERSION`（否则 `kind=bridge` 过不了门禁）。US-207 是纯适配器路径，天然满足后者。
   门禁的祖先判定是
   `git merge-base --is-ancestor <tag>^{commit} HEAD`（[scripts/check-migration-release-gate.mjs:186](../scripts/check-migration-release-gate.mjs#L186)）。
   本仓库全历史零 merge commit，PR 一律 squash：若在特性分支上打 tag 再 squash 进 `main`，
   tag 指向的提交**不在** `main` 的历史里，将来那次 migration 发布会卡在
   `bridge.tag ... is not an ancestor of the release commit`，且无法在不重写 tag 的前提下补救。
   `v0.0.24` 现在能过祖先判定，纯粹因为它指向根提交 `init`——那是巧合，不是可复用的模式。
2. **先 version，后改清单，再一起提交**——顺序同样不能反。`nx release` 会自己算版本号、改写
   `packages/*/package.json`、提交并按 `v{version}` 打 tag；清单是手工维护的，不在它的改写范围内，
   所以必须卡在「版本已定、tag 未打」之间更新：

   ```bash
   pnpm nx release version --git-commit=false --git-tag=false   # 只改 package.json，不提交不打 tag
   # 读 packages/rxdb/package.json 的 version，据此更新清单
   ```

   `v0.0.24` 就是栽在这一步：包版本停在 `0.0.24`，清单已经写成 `0.0.25`，两者从未对齐。

3. **更新清单**：`requirements/migration-release.json` 由 `kind=normal` 改为 `kind=bridge`，
   `release.version` 填上一步实际得到的版本号。`bridge.tag` / `bridge.version` 保持 `null`——
   桥接版本不引用桥接 tag，只有 migration 版本才填。
4. **本地预检**：`pnpm nx run @aiao/source:migration-release-gate-test` 与
   `pnpm nx run @aiao/source:migration-release-gate --args="--release-tag=v<实际版本>"` 全绿后才允许提交。
5. **提交并打 tag 推送**：package.json 与清单在同一个提交里，tag 指向 `main` 上的该提交。
   推送 tag 不会触发任何发布——发布是手工执行 `pnpm publish`，由执行者自行确保第 4 步已跑绿。
6. **回写 US-304**：AC1 由 ⚠️ 转 ✅，依据是「桥接 tag 已推送、是 `main` 祖先、清单声明 `kind=bridge` 且通过门禁」。
   AC6 **不随第 1 段转 ✅**：US-207 AC#5 交付的是两个**同时在线**的 writer 在连接时互相 fencing，
   AC#1 的重启 e2e 两次启动之间不发生迁移；而 AC6 要的是「writer 挂起 → 别的 realm 完成迁移抬 epoch
   → 该 writer 恢复后写入被 fence」。三者不是同一个场景。此后 US-304 仍剩 AC6 与 AC11。

### 执行记录（2026-08-13）

第 1–4 段均已执行，**但停在推送之前**：tag 只存在于本地。

| 段  | 结果                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------- |
| 1   | US-207 交付完成，AC#1 / #3–#7 ✅（详见该 story）                                                          |
| 2   | `next-0813` 以 fast-forward 并入 `main`（14 个提交、153 个文件），零 merge commit，符合本节对祖先链的要求 |
| 3   | 版本 `0.0.25`，清单切 `kind=bridge`，本地 tag `v0.0.25` 已打；**未推送**                                  |
| 4   | 门禁三个 git 钩子首次用真实 tag 验证（下方「门禁三钩子的实测」）                                          |

两处与本节原有预期不符，记录如下：

- **版本号算出来是 `0.0.25` 而不是 `0.1.0`**。上文硬前提 2 预计「US-207 以 `feat:` 落地会算出 `0.1.0`」，
  实际落地的 14 个提交里**一条 `feat:` 都没有**（US-207 连同新包 `@aiao/rxdb-adapter-desktop` 是以
  `123` / `up` 一类非规范信息提交的），可 bump 的只有 2 条 `fix:` → patch。
  所以 `0.0.25` 是 `nx release version` 真算出来的值，未做人工覆写，与本节此前的占位值恰好相同。
  需要认清的是：**这个 patch 反映的是提交信息的形态，不是这次改动的份量**——
  一个全新可发布包以 patch 发出去，changelog 上看不出来。
- **「当前可 bump 量为零」一行已过期**（现状实测表末行）。第 1 段落地后不再为零，
  这正是把 US-207 排在发布之前的那个硬原因兑现的地方。

### 门禁三钩子的实测（2026-08-13）

第 4 段要验的是「`bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol`
在没有真实桥接 tag 之前只能靠桩」。`v0.0.25` 打出来之后，用一份临时 `kind=migration` 清单
（不动签入的那份）做了正反两组对照：

| 清单的 `bridge.tag` | 三条 git 钩子的报错 | 结论               |
| ------------------- | ------------------- | ------------------ |
| `v0.0.25`（真 tag） | **一条都没有**      | 三个钩子首次真跑通 |
| `v9.9.9`（不存在）  | 三条**全部**报出    | fail-closed 成立   |

正向那组剩下的三条报错都是对的：`release.version 0.0.26` 与包版本不符（临时清单自己编的版本）、
`oldBundlePolicy.strategy` 不在白名单（临时清单把 `force-update` 写成了 `forced-update`，
顺带证明白名单有效）、以及 `migration releases must upgrade system schema or change codec`——
最后这条正是下文所说的真实阻塞。

**门禁本身不需要修**：它在真实 tag 上的行为与桩一致，且对伪造 tag 正确拒绝。

### AC11 不随本次发布关闭

AC11 的操作列是「发布迁移版本」，而 `0.0.25` 不升级任何系统版本，够不着这个前置条件。三条子句在发布后的状态：

| 子句                                                 | `v0.0.25` 之后                         |
| ---------------------------------------------------- | -------------------------------------- |
| 本仓库须存在位于 HEAD 祖先链上的桥接 tag             | ✅ 本次桥接 tag                        |
| 发布门禁阻止升级，或强制更新/缓存失效/新命名空间隔离 | ❌ 需要一次真实 migration 发布才验得了 |
| 不得声称 AC13 已完成                                 | ✅ 保持                                |

真正关闭 AC11 的那次发布必须同时满足：抬升 `RXDB_SYSTEM_SCHEMA_VERSION` 或 `RXDB_CHANGE_CODEC_VERSION`、
清单切 `kind=migration`、`bridge.tag` / `bridge.version` 指向本次桥接版本、`oldBundlePolicy.strategy` 四选一、
`minimumVersion` 不低于桥接版本、`enforced=true`。

按现有排期，第一个带迁移的交付是 [US-305](stories/collaboration/US-305-commit-graph-head.md)（其范围含「每分支 baseline commit 与一次性迁移」）。
**2026-08-15 已决策转移**：AC11 挂到 US-305 的 `inherited_acs`，US-304 只对桥接协议和迁移 fencing
本身负责。这样 US-304 可以在补齐 AC6 后 Done；US-305 在 schema 迁移前先验证当前主线存在有效 bridge ancestor，
随后用首个真实迁移发布验收该 bridge manifest、`oldBundlePolicy` 和 migration release gate，不再形成循环依赖。

（AC6 同样不在此列，但理由不同：它不需要转移，只缺一条自己的用例——
「writer 挂起 → 别的 realm 完成迁移抬 epoch → 该 writer 恢复后写入被 fence」。
US-207 的两条用例都不是这个场景，见上文第 6 步。）

不要用「推一个废弃 tag」来充当 AC11 的证据：tag 是桥接协议的声明本身，
试探性 tag 会污染 `nx release` 的版本计算基准，也会让后续读历史的人分不清哪个 tag 是真的。
