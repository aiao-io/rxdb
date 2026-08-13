---
id: US-304
title: 跨 realm writer lease 与迁移 fencing
status: In Progress
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-01
updated: 2026-08-13
tags: [collaboration, migration, lease, fencing, cross-tab, cross-process]
inherited_acs:
  - from: US-303
    ac: 13
    note: 将跨 realm/进程旧 writer 的可靠排除从 change codec story 拆出，先发布桥接协议再执行迁移。
---

<!--
INVEST 检查清单:
- [ ] Independent: 依赖 US-303 的系统迁移入口和旧格式可读能力
- [x] Negotiable: lease 表、guard 状态机和后端锁实现可以调整
- [x] Valuable: 防止空闲旧连接在迁移后恢复并写入不兼容格式
- [x] Estimable: 范围集中在 writer 协作协议、迁移隔离和发布门禁
- [x] Small: 不包含 change codec、远程同步、加密和 DevTools
- [x] Testable: lease、fencing、竞态、崩溃恢复和多 realm 均有独立 AC
-->

# 用户故事：跨 realm writer lease 与迁移 fencing

## 作为/我想要/以便

**作为** 发布 Local-first 客户端的开发者
**我想要** 在系统迁移前可靠发现并隔离所有旧 writer
**以便** 跨 Tab、Worker、进程或空闲连接不会在迁移后继续写入旧格式

## 来源与边界

本 story 继承 [US-303 AC13](./US-303-bigint-binary-change-codec.md)，只负责跨 realm/进程 writer 的可观测性和 fencing。US-303 已完成的 change codec、系统表迁移、watermark 原子提交和回滚重试不在本 story 重做。

### In Scope

- 在旧格式兼容的桥接版本中发布 writer lease/upgrade guard 协议，不提前改变 change schema
- SQLite family 与 PGlite 使用持久化 lease 表记录 writer 身份、协议版本、epoch、心跳和过期时间
- writer 在每个写事务内校验 guard/epoch，并在同一事务内续租；失去 lease 或 fencing 后停止写入
- upgrader 执行 `open → draining → migrating → open` 状态机，拒绝新旧不兼容 writer
- 获取排他锁、排空 lease、复查 fencing、执行迁移和启用业务 trigger 的顺序约束
- writer 崩溃、Tab 挂起、Worker 重启、升级失败和升级者崩溃后的安全重试
- 桥接版本的最低协议版本、强制升级、缓存失效和旧 bundle 禁止继续写入的发布门禁

### Out of Scope

- change envelope、patch/inversePatch 和 entityId codec（US-303）
- Supabase push/pull、加密字段和 DevTools 展示
- 允许未实现桥接协议的旧 bundle 继续写入已升级数据库
- 仅依赖 `BroadcastChannel`、Web Locks 或当前 JS realm 内存状态的实现

## 验收标准

| #   | 前置条件                                     | 操作                                 | 预期结果                                                                                                                       | 状态 |
| --- | -------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | 桥接版本打开旧格式数据库                     | 初始化 writer lease 与 upgrade guard | 不改变旧 change 格式；旧 writer 可读；协议版本可查询                                                                           | ⚠️   |
| 2   | 两个 Tab、Worker 或进程连接同一数据库        | 注册并持续写入 lease                 | 每个 writer 有唯一身份；心跳使用数据库时间；重复注册不覆盖其他 writer                                                          | ✅   |
| 3   | 存在仍有效的空闲旧 writer lease              | 新版本请求迁移                       | 进入 `draining` 后无法确认 writer 已退出则 fail-fast；业务 trigger 不启动                                                      | ✅   |
| 4   | writer 写事务与 upgrader 同时竞争            | 执行写入和升级                       | guard/epoch 校验与实际写入在同一事务内，不存在检查后竞态窗口；四个 SQLite 后端通过同一套 `rowsAffected` conformance 套件       | ✅   |
| 5   | writer 被杀死或 lease 超时                   | 等待保守的 lease TTL 后重试升级      | 旧 writer 被视为失效，升级可重新获取 fencing 并继续                                                                            | ✅   |
| 6   | 已迁移后暂停的旧桥接 writer 恢复             | 尝试写入                             | epoch/fencing 校验失败，连接转为只读或要求重连，不产生旧格式 change                                                            | ⚠️   |
| 7   | lease drain 成功                             | 执行系统 DDL/DML 与 watermark 提交   | guard、schema、watermark、epoch 和业务 trigger 在同一原子提交中完成                                                            | ✅   |
| 8   | 迁移任意步骤失败或 upgrader 崩溃             | 重新连接并重试                       | 无半迁移状态；过期升级者不能清除其他 owner 的 guard；重试成功且不重复改写历史                                                  | ✅   |
| 9   | lease/guard 表不存在、协议版本过低或状态未知 | 尝试升级                             | 明确报错并中止，不猜测安全、不启用业务 trigger                                                                                 | ✅   |
| 10  | 真实 SQLite 多进程和 PGlite Worker/Tab 场景  | 运行共享迁移套件                     | 空闲 writer、竞态、崩溃恢复和 stale writer fencing 均通过                                                                      | ✅   |
| 11  | 仍有桥接版本之前的离线旧 bundle              | 发布迁移版本                         | 发布门禁阻止升级，或通过强制更新/缓存失效/新数据库命名空间隔离；本仓库须存在位于 HEAD 祖先链上的桥接 tag；不得声称 AC13 已完成 | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 复核记录（2026-08-11 初版，2026-08-13 更新 AC2、AC4、AC8、门禁缺口与 bridge tag 依据）

### 已交付的部分

- 协议原语：`packages/rxdb/src/system/writer-lease.ts` 提供 `open/draining/migrating/failed` 状态机、`epoch`/`minProtocol` 不变式与全部 `RxDBWriterLeaseErrorCode`，本身不持有心跳，也不触发自动迁移。
- 双适配器接入：`RxDBAdapterSqliteBase` 与 `RxDBAdapterPGlite` 都在写事务内读 guard 并续租（PGlite 用 `SELECT ... FOR UPDATE`，SQLite 用带 `state = 'open' AND epoch = ?` 条件的 UPSERT，`rowsAffected !== 1` 即判 `writer_fenced`）；心跳间隔取 `RXDB_WRITER_HEARTBEAT_INTERVAL_MS`，时间戳取数据库时间（`strftime('%Y-%m-%dT%H:%M:%fZ','now')` / `clock_timestamp()`）。
- 测试：`shared-system-schema-migration.suite.ts`、真实多进程的 `system-schema-migration.multiprocess.spec.ts`、PGlite 的 `pglite-migration-writer.worker.ts` 覆盖 AC3/5/7/9/10。

### AC11 由 ✅ 降级为 ⚠️ 的依据

- **本条前一版记载有误，2026-08-13 实测更正**：`v0.0.24` 上的清单不是 `kind=migration`，而是 `kind=bridge` / `release.version=0.0.25`，而同 tag 的 `packages/rxdb/package.json` 是 `0.0.24`。用 `v0.0.24` 当时的门禁脚本校验该清单，唯一报错是 `release.version 0.0.25 does not match tag v0.0.24`——**是版本漂移，不是 migration 字段缺失**。
- 同样更正：`v0.0.24` 的 `publish.yml` 已经把门禁两步排在 build 与 `nx release publish` 之前，所以「门禁没装」不成立。但 `@aiao/rxdb@0.0.24` 仍是 npm `latest`，而 `v0.0.24` tag 指向的提交是 `init`——本仓库是重新初始化的历史，npm 上那次发布不是经这条流水线发出的。准确说法是**门禁没机会跑**，而非拦不住。结论不变：“发布门禁阻止升级”从未被真实发布验证过。
- 至今没有任何 tag 被声明为桥接版本，`oldBundlePolicy` 也从未启用，AC11 列出的三条替代路径（强制更新 / 缓存失效 / 新数据库命名空间）一条都没生效。
- 现清单为 `kind=normal` / `0.0.24`（见下文「门禁自身的两处缺口」），`pnpm nx run @aiao/source:migration-release-gate` 与 `migration-release-gate-test` 本地均通过。桥接版本实际发布后，AC11 才能重新评估。

### 阻塞项：桥接 tag 指向哪一次发布尚未决策（2026-08-13 复核，前一版依据已失效）

门禁的 `bridgeTagExists` / `bridgeTagIsAncestor` / `bridgeTagSupportsProtocol` 全部走 git tag
（[`check-migration-release-gate.mjs`](../../../scripts/check-migration-release-gate.mjs) 的 `git rev-parse refs/tags/…`、
`git merge-base --is-ancestor`、`git cat-file -e <tag>:<file>`）。

本节此前记载「本仓库 `git tag --list` 为空、`git rev-list --count HEAD` 为 5，清单切 `kind=migration`
必然报 `bridge.tag … does not exist`」。该依据已不成立，实测：

| 检查项                                        | 实测结果                                                              |
| --------------------------------------------- | --------------------------------------------------------------------- |
| `git tag --list`                              | `v0.0.24`（非空）；`git rev-list --count HEAD` 为 10                  |
| `bridgeTagIsAncestor(v0.0.24)`                | 通过，`git merge-base --is-ancestor v0.0.24 HEAD` 成立                |
| `bridgeTagSupportsProtocol(v0.0.24)`          | 通过，`gitTagSupportsProtocol` 列出的 5 个文件在 `v0.0.24` 上全部存在 |
| `v0.0.24` 是否真的含 lease 集成（非仅文件在） | 是：`writer_fenced` 1 处、`rowsAffected !== 1` 4 处、协议模块 229 行  |

即 `v0.0.24` 事实上已经携带完整的 writer lease/guard 协议，只是**从未被有效声明为桥接版本**——
它的清单虽然写着 `kind=bridge`，但 `release.version` 与包版本漂移，门禁对该 tag 判定 fail-closed，
这份声明从未通过校验。所以真正的阻塞不是「没有 tag 可用」，而是桥接 tag 该指向哪一次发布。

**该决策已于 2026-08-13 作出：另打 `v0.0.25`，不追认 `v0.0.24`。**
发布顺序与关闭判据见 [`requirements/README.md` 的「下一次发布计划」](../../README.md#下一次发布计划v0025-桥接版本)。

同时注意 `bridgeTagSupportsProtocol` 只用 `git cat-file -e` 校验文件存在，不校验文件内容，
因此它单独并不能证明 tag 含协议实现；上表第 4 行是手工补的证据，不是门禁给的。

结论不变：AC1/AC11 的前提**不是“发到 npm”，而是“在本仓库打出并推送 tag，且该 tag 位于发布提交的祖先链上”**。
仅发布 npm 包不满足门禁。

### AC11 关闭条件（按序执行，缺一不可）

0. ~~先决策桥接 tag~~ **已决策：`<bridge>` = `v0.0.25`**（2026-08-13）。已在生产的 `0.0.24` 因此被划进「离线旧 bundle」。
1. `v0.0.25` 必须已推送，且 `git merge-base --is-ancestor v0.0.25 HEAD` 成立。
   前置是清单切 `kind=bridge` 且 `release.version` 与 `packages/rxdb/package.json` 同步推进到 `0.0.25`——
   `v0.0.24` 正是栽在这一步。
2. 用该 tag 跑 `bridgeTagSupportsProtocol` 冒烟：`gitTagSupportsProtocol` 列出的 5 个文件
   （`packages/rxdb/src/RxDB.ts`、`packages/rxdb/src/rxdb-adapter.ts`、`packages/rxdb/src/system/writer-lease.ts`、
   `packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts`、`packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts`）
   在 `<bridge>` 上全部存在；因该检查只验存在不验内容，需另行确认该 tag 确含 lease 集成。
3. 上述各步通过后，清单才允许切 `kind=migration`，并同时填 `bridge.tag=v0.0.25`、`bridge.version=0.0.25`、
   `oldBundlePolicy.strategy`（白名单四选一）、`oldBundlePolicy.minimumVersion≥0.0.25`、`enforced=true`。
4. **但第 3 步不会发生在 `0.0.25` 这一版**：实测 HEAD 与 `v0.0.24` 的 `RXDB_SYSTEM_SCHEMA_VERSION`（`3`）、
   `RXDB_WRITER_PROTOCOL_VERSION`（`1`）、`RXDB_CHANGE_CODEC_VERSION`（`1`）完全相同，没有任何东西要迁移，
   清单切 `kind=migration` 会被 `migration releases must upgrade system schema or change codec` 拒绝。
   AC11 要等下一次真正抬升系统版本的发布，按现有排期是 [US-305](./US-305-commit-graph-head.md)（含「一次性迁移」）。

### 上述条件的执行进度（2026-08-13）

`v0.0.25` 已在本地打出，上面四步的实际状态：

| 步骤                               | 状态 | 依据                                                                                                                                                                                                                                                |
| ---------------------------------- | ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0 决策桥接 tag                     | ✅   | `v0.0.25`；`nx release version` 依 conventional commits 算出的也是 `0.0.25`，与本决策一致，未做人工覆写                                                                                                                                             |
| 1 tag 已推送且是 HEAD 祖先         | ⚠️   | `git merge-base --is-ancestor v0.0.25 HEAD` 成立；清单已切 `kind=bridge` 且 `release.version` 与 `packages/rxdb/package.json` 同为 `0.0.25`，门禁通过。**但 tag 尚未推送**——见下                                                                    |
| 2 `bridgeTagSupportsProtocol` 冒烟 | ✅   | 5 个文件在 `v0.0.25` 上全部存在；另按本节要求确认了内容而非仅文件名：`RxDBAdapterPGlite.ts` 与 `RxDBAdapterSqliteBase.ts` 在该 tag 上各有约 30 处 `WriterLease` 引用，含 `RXDB_WRITER_LEASE_TABLE_NAME` / `RXDB_WRITER_PROTOCOL_VERSION` / TTL 常量 |
| 3 切 `kind=migration`              | ⬜   | 不发生在本版，见第 4 步                                                                                                                                                                                                                             |
| 4 本版无可迁移内容                 | ✅   | 实测 `v0.0.24` 与 `v0.0.25` 的 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_WRITER_PROTOCOL_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 均为 `3` / `1` / `1`，两侧完全相同                                                                                       |

**tag 未推送是刻意的**：`publish.yml` 的触发条件是 `v*.*.*`，推送即拉起真实发布流程，
门禁通过后直接 `nx release publish` 发到 npm。是否发布是发布决策，不是验证步骤的一部分——
本节上文那条「不要用推一个废弃 tag 试门禁来充当 AC11 证据」的告诫，同样约束这次。

因此 **AC1 仍为 ⚠️**：`kind=bridge` 声明、门禁通过、祖先链三项都成立，只差「已推送」这一项。
推送后 AC1 方可转 ✅。**AC11 仍为 ⚠️** 且不因本次发布改变，理由是上表第 3/4 步。

门禁的三个 git 钩子已借 `v0.0.25` 首次用真实 tag 验证（正向零报错、伪造 tag 三条全报），
**门禁本身不需要修**；实测明细见 [`requirements/README.md` 的「门禁三钩子的实测」](../../README.md#门禁三钩子的实测2026-08-13)。

### 门禁自身的两处缺口（已修复，2026-08-13）

| 缺口                                                                                           | 影响                                                                                                                          | 修复                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `release.kind` 只接受 `bridge \| migration`，没有 `normal`                                     | 普通 patch 发布被迫自称 `bridge`，「桥接版本」语义被稀释；将来切 `kind=migration` 时无法判断 `bridge.tag` 该指向哪一次发布    | 新增 `normal`：与 `bridge` 一样禁止 schema/codec 升级，但强制 `bridge.tag`/`bridge.version` 为 `null`，不进入 bridge 链                             |
| 门禁只把 `release.version` 与 git tag 名对比，不校验 `packages/rxdb/package.json` 的 `version` | 清单可长期停在陈旧值而无人察觉（修复前清单 `0.0.25`，`packages/rxdb/package.json` 仍为 `0.0.24`），正是 0.0.24 事故的同类形态 | 新增 `release.version === packages/rxdb/package.json.version`，且**常态生效**而非仅发布时——tag 时两者必然相等，这条校验的全部价值就在于平时发现漂移 |

两条校验各配红测试（`scripts/check-migration-release-gate.spec.mjs` 现 28 例全绿）。
package.json 绑定上线后立刻抓到了它要抓的东西：签入清单 `0.0.25` 与包 `0.0.24` 不一致，`签入的 migration-release.json 通过结构校验` 转红。

**因此改动了发布产物** `requirements/migration-release.json`：`kind` 由 `bridge` 改为 `normal`、`version` 由 `0.0.25` 改为 `0.0.24`。
理由是绑定要求清单与 `packages/rxdb/package.json`（`0.0.24`）一致，而 `normal` 是不预设立场的取值——
它既不追认 `v0.0.24` 为桥接版本，也不预先声明 `v0.0.25` 是桥接版本，把关闭条件第 0 步的决策原样留给发布方。
副作用是原先「下一版是 bridge」的意图从清单里消失了，该意图现记录在关闭条件第 0 步。
之所以不保留原值，是因为让门禁长期恒红正是本 story 记录的 0.0.24 失效形态。

### ⚠️ 项的剩余条件

| AC  | 剩余条件                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | 协议常量与建表已就位；「桥接版本已发布」的判定基准是**本仓库存在被声明为桥接的 tag 且为 HEAD 祖先**，不是 npm dist-tag；该 tag 选 `v0.0.24` 还是 `v0.0.25` 见上文关闭条件第 0 步                                                                                                                                                                                                                                                                     |
| 6   | 现有用例通过模拟 epoch 提升验证 fencing，待补长时间挂起的 writer 恢复后的真实表现。[US-207](../adapter/US-207-desktop-local-database.md) AC#5 的 [`writer-lease.spec.ts`](../../../packages/rxdb-adapter-desktop/src/__tests__/writer-lease.spec.ts) 验的是第二个 writer**连接时**被拒，AC#1 的重启 e2e 两次启动之间不发生迁移 —— 两条都不是本 AC 的场景。仍缺一条「writer 挂起 → 别的 realm 完成迁移抬 epoch → 该 writer 恢复后写入被 fence」的用例 |

### AC2 并发注册测试（已交付，2026-08-13）

剩余条件为「待在真实多 realm 下复核并发注册不互相覆盖」。交付物是
[`system-schema-migration.multiprocess.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/system-schema-migration.multiprocess.spec.ts)
新增的 `SQLite multiprocess writer lease registration`，让**三个各自独立的 writer** 落到同一个数据库文件上：

| writer    | 隔离级别                             | 注册路径                                     |
| --------- | ------------------------------------ | -------------------------------------------- |
| adapter A | 独立连接 + 独立 uuid `#writer_id`    | 生产 `startWriterLease()`                    |
| adapter B | 同上                                 | 同上                                         |
| 子进程    | 独立 OS 进程、独立地址空间与事件循环 | 复刻生产条件 UPSERT 的 `writerProcessSource` |

断言分三组：

1. **唯一身份**：三行、三个不同 `writerId`，`protocolVersion` 与 `epoch` 一致。逐个注册，靠「新出现的那一行」认出各自的 `writerId`（`#writer_id` 是私有的），顺带就地验证后注册者不顶掉先注册者。
2. **数据库时间**：`expiresAt - lastSeenAt` 与 `lastSeenAt <= now` 全部交给数据库时钟（`julianday()`）判定。子进程按 `+1 second` 续租、适配器按 `RXDB_WRITER_LEASE_TTL_MS`（30 秒）续租，两个跨度在同一次查询里同时成立——这正是「TTL 由各 writer 自己的 SQL 在数据库侧算出」而非共享 JS 常量的证据。
3. **不覆盖**：双向各验一次。适配器 A 重续后子进程与 B 的行逐列不变；子进程重续后两个适配器的行逐列不变。逐列比对而非只比 `writerId`——只比 id 会漏掉别人的 epoch 或时间戳被改写。

**变异检验**（证明用例非空跑，三次均只有新用例变红、其余 4 例照常通过）：

| 变异                                                             | 结果                                                                     |
| ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `#writer_id` 由 `uuid()` 改为常量（两个 realm 撞成一行）         | `expected [ [ 'MUTANT-SHARED-ID', … ] ] to have a length of 2 but got 1` |
| `#renewWriterLease` 续租前 `DELETE` 掉本库全部 lease（互相覆盖） | 同上，行数塌成 1                                                         |
| lease TTL 由 `+30 seconds` 改为 `+31 seconds`                    | `expected 31000 to be 30000`                                             |

两点如实记录的边界：

- **Tab/Worker 未逐一复现**，用「独立 OS 进程」代替。被验证的机制是「唯一 `writerId` + `ON CONFLICT ("databaseId","writerId")`」，它只认连接与 id，对 realm 种类无感知；进程是三者中隔离最强的一种，Tab/Worker 在此机制上是更弱的形态。SQLite 侧 Tab/Worker 共享 VFS 属存储层问题，由 AC10 覆盖。
- **单机测不出「用了 JS 时钟」**：同一台机器上 `Date.now()` 与数据库时间只差毫秒，本用例的时钟断言无法区分二者。跨时钟的真实证据来自既有的 stale writer 用例（子进程用不同 TTL 续租后被数据库时间判定过期）。

顺带修掉的 harness 问题：`afterEach` 原先 `Promise.all` 并发 `disconnect()`。`node:sqlite` 是同步 API——先拿到写锁的一方在 `await` 处让出后，另一方的 `BEGIN` 会同步阻塞整个事件循环直到 `busy_timeout` 耗尽，持锁方根本排不上 `COMMIT`，必然报 `database is locked`（耗时恰为 2000ms 的 busy_timeout）。改为逐个断开。这是同进程同步驱动的局限，不是产品缺陷；真正的跨 realm 并发由子进程 writer 覆盖。

### AC8 恢复文档（已交付，2026-08-13）——`failed` 并不可达，本条剩余条件的前提有误

本条剩余条件原写作「`failed` 是需要人工恢复的终态，恢复步骤尚未写入文档」。实测这个前提不成立：

| 状态        | 是否有生产代码写入                                                                                                                                        | 失败后是否滞留                                                                                                                     |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `failed`    | **没有**。在 `packages/rxdb/src/system/`、`rxdb-adapter-sqlite-core/src/`、`rxdb-adapter-pglite/src/` 内只有三处类型级出现（状态联合、错误码、docstring） | —                                                                                                                                  |
| `migrating` | 有                                                                                                                                                        | **不会**。整个 `migrateSystemSchema()` 在单事务内（SQLite `BEGIN EXCLUSIVE` L446–L623 / ROLLBACK L628；PGlite 同形），异常整体回滚 |
| `draining`  | 有                                                                                                                                                        | **会**。排空遇到活动 lease 时**故意先提交再抛错**（SQLite L544–L548；PGlite L856 `return 'active-writer'` + L965 throw）           |

即真正需要恢复说明的不是 `failed` 而是 `draining`：该窗口内所有 writer（含挡住升级的那个）都拿 `writer_guard_draining`，
且 TTL 到期只让 guard 可被重新认领（`assertRxDBUpgradeClaimable` 在 `ownerActive === false` 时放行），
必须有一次成功的 `connect()` 才会真正写回 `open`——纯等待不会自愈。

因此 [`website/docs/migration/schema.md`](../../../website/docs/migration/schema.md) 新增「升级 guard 状态与恢复」一节，
如实写四个状态的写入方与滞留性、`draining` 的自愈路径、两张表的巡检 SQL，以及手工复位的前置确认和「不要改 `epoch`/`minProtocol`」的红线，
而**不**为不可达的 `failed` 编造恢复流程——只说明它是协议预留状态，若真读到则不是 RxDB 写的。

若日后有代码路径开始写 `failed`，需回来补该状态的真实恢复步骤。

### AC4 backend conformance 测试（已交付，2026-08-13）

lease 续租与 guard 校验的唯一判据是 `rowsAffected !== 1`
（[`RxDBAdapterSqliteBase.ts`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 的 L507 / L556 / L618 / L1235）。
而 sqlite-core 内部已记录同类事故：SELECT 会读到**上一条写语句**遗留的计数
（[`execute-sql.utils.ts`](../../../packages/rxdb-adapter-sqlite-core/src/execute-sql.utils.ts) 的说明与
[`execute_oo1_helper.ts`](../../../packages/rxdb-adapter-sqlite-core/src/execute_oo1_helper.ts) 的 SQLC-030 兜底）。
在这种前提下「待逐一确认四个后端语义一致」不是可验收条件。

交付物：[`shared-rows-affected-conformance.suite.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/shared-rows-affected-conformance.suite.ts)，
经 `rowsAffectedConformanceSuite` 由 `@aiao/rxdb-adapter-sqlite-core/testing` 导出，四个后端跑同一组断言：

| 断言                                                         | 结果                       |
| ------------------------------------------------------------ | -------------------------- |
| 条件 UPSERT 命中 1 行时 `rowsAffected === 1`，未命中时为 `0` | 四后端通过                 |
| 紧随写语句之后的 SELECT，`rowsAffected` 必须为 `0`           | 四后端通过（变异检验见下） |
| 事务回滚后重放同一 UPSERT，计数不累积                        | 四后端通过                 |

套件用与生产一致的 guard/lease 表形状和条件 UPSERT SQL 建模，断言直接对准 fencing 原语而非通用 SQL 行为。

**四个后端确实是四套独立实现**，不是同一份代码跑四遍——这是本套件必须存在的直接理由：

| 后端                  | `rowsAffected` 来源                                               |
| --------------------- | ----------------------------------------------------------------- |
| wa-sqlite             | `packages/rxdb-adapter-wa-sqlite/src/execute_helper.ts`（自有）   |
| sqlite-wasm           | `packages/rxdb-adapter-sqlite-wasm/src/execute_helper.ts`（自有） |
| sqlite（@sqlite.org） | `Oo1ClientBase` → `executeOo1Helper`（共用）                      |
| sqliteai              | `Oo1ClientBase` → `executeOo1Helper`（共用）                      |

**变异检验**（证明套件非空跑）：临时把 `execute_oo1_helper.ts` 的
`rowsAffected: isReadOnlyStatement(sql) ? 0 : db.changes()` 改回 `db.changes()` 后，
`sqlite` 与 `sqliteai` 的第 2 条断言立刻报 `expected 3 to be +0`——正是 SQLC-030 的失效形态；
两个自有 `execute_helper.ts` 的后端不受影响，与上表相符。守卫已还原。

任一后端不满足即视为 AC4 未通过，不允许用后端专属分支绕过。

## 技术约束

- lease TTL 只能用于发现失联 writer，不能替代 fencing；挂起后恢复的 writer 必须因 epoch 失效而不能写入
- 数据库时间用于 `lastSeenAt`/`expiresAt`，不得依赖跨进程本地时钟比较
- SQLite 使用数据库内 lease 表配合 `BEGIN IMMEDIATE/EXCLUSIVE`；PGlite 使用持久化 guard 行锁/表锁，realm 内 peer 检查只能提前失败
- 所有未知状态、未知协议版本和无法确认 lease 完整性的情况必须 fail-fast
- 干净关闭可以删除 lease，但升级安全性不能依赖客户端一定执行 cleanup
- 桥接版本必须先于迁移版本发布，并定义最低可升级 writer 协议版本

## 推荐状态模型

```text
open -> draining -> migrating -> open
                 \-> failed -> explicit retry
```

推荐系统表至少包含：

- `upgrade_guard(databaseId, epoch, state, ownerId, ownerExpiresAt, minProtocol)`
- `writer_lease(databaseId, writerId, protocolVersion, epoch, lastSeenAt, expiresAt)`

## 实施分期

1. **桥接版本**：创建 lease/guard 表，所有 writer 在同一写事务内注册、续租并校验 epoch；只新增协议，不升级 change schema。
2. **迁移版本**：实现 drain barrier、排他锁复查、fencing epoch 和原子迁移；任何 lease 不完整或协议过低都 fail-fast。
3. **发布门禁**：强制最小桥接版本、处理离线旧 bundle、运行 SQLite 多进程与 PGlite Worker/Tab 集成套件，再允许类型系统升级进入发布产物。

本仓库的发布门禁由 [`requirements/migration-release.json`](../../migration-release.json) 和
`pnpm nx run @aiao/source:migration-release-gate` 执行。迁移发布必须填写已存在且位于当前
提交祖先链上的桥接 tag、最低桥接版本和已启用的旧 bundle 策略；门禁还会检查桥接 tag
确实包含 writer lease/guard 集成。缺任一项时发布任务 fail-closed。

## 实现文件

- `packages/rxdb/src/system/` — lease/guard 类型、协议版本和错误
- `packages/rxdb/src/RxDB.ts` — drain 顺序、fencing 和迁移前置检查
- `packages/rxdb-adapter-sqlite-core/src/` — SQLite lease 表、事务锁和 writer guard
- `packages/rxdb-adapter-sqlite-core/src/sqlite-backend.interface.ts` — `rowsAffected` conformance 契约（AC4）
- `packages/rxdb-adapter-sqlite-core/src/__tests__/shared-rows-affected-conformance.suite.ts` — 四后端 `rowsAffected` conformance 套件（AC4，经 `testing.ts` 导出）
- `packages/rxdb-adapter-sqlite-core/src/__tests__/system-schema-migration.multiprocess.spec.ts` — 真实多进程 + 双 realm 的 lease 注册、数据库时间与不覆盖复核（AC2/3/5/10）
- `packages/rxdb-adapter-pglite/src/` — PGlite lease 表、行锁/表锁和 writer guard
- `packages/rxdb-test/src/testing/` — 多 realm、崩溃恢复与 stale writer 套件
- `scripts/check-migration-release-gate.mjs` — 新增 `kind=normal`、清单与 `packages/rxdb/package.json` 版本绑定
- `website/docs/migration/schema.md` — 发布顺序、单向迁移、旧 bundle 限制，以及「升级 guard 状态与恢复」（`draining` 滞留自愈、手工复位红线、`failed` 为协议预留状态）（AC8）

## References

- [US-303 bigint/binary change codec 与系统迁移](./US-303-bigint-binary-change-codec.md)
- [Epic 005 类型系统演进](../../epics/epic-005-type-system-evolution.md)
- [系统 schema 迁移文档](../../../website/docs/migration/schema.md)
