# 路线图（Roadmap）

> 本文回答「接下来做什么、什么必须排在什么前面」。故事当前状态见 [status-overview.md](status-overview.md)，
> 发布执行见 [release-plan.md](release-plan.md)，能力缺口见 [capability-matrix.md](capability-matrix.md)。
>
> 本文是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时以对应 story 的验收标准（AC）为准。

## 现状快照

| 状态           | 数量   |
| :------------- | :----- |
| ✅ Done        | 65     |
| 🚧 In Progress | 0      |
| 👀 In Review   | 1      |
| 📝 Backlog     | 28     |
| **未完成合计** | **29** |

仓库还剩 **29 条**未关闭故事（0 In Progress + 1 In Review + 28 Backlog）。

> 口径与 [status-overview 状态汇总](status-overview.md#状态汇总) 一致：YAML `status` 字段 `grep` 推导。
> 另有一项**进行中的规格工作不在故事计数内**：[specs/002-rxdb-model-port](../specs/002-rxdb-model-port/spec.md)
> （rxdb-model 实体模型库 + 三框架 UI 组件集移植，当前分支，Angular 先行）。US-027 / US-028 / US-029 的
> rxdb-model UI 派生以它为依托，见[立项池](#立项池待-owner-决策未进任何批次)。

## 未完成需求全景

下表只列**已立项**的未完成故事的「剩什么」与「排期位置」。
[epic-009 BOM 领域模型](epics/epic-009-bom-domain-model.md) 的 19 条整体标价值待证、不进任何批次，
与同标价值待证的 [US-030](stories/core/US-030-declarative-storage-constraints.md) 一起
单独列在[明确不排期](#明确不排期)里，不混进本表。

| Story                                                                                        | 状态         | 剩什么                                                                                            | 排期位置 |
| -------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------- | -------- |
| [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)              | 👀 In Review | 任务侧全关；阶段 C 只剩 M1 基线静默复冻                                                           | 即办     |
| [US-026 实例级实体同步配置覆盖](stories/core/US-026-instance-sync-override.md)               | 📝 Backlog   | 未开工；无硬前置                                                                                  | 批次 3   |
| [US-217 本地数据库一致性备份与恢复](stories/adapter/US-217-local-database-backup-restore.md) | 📝 Backlog   | 未开工；阶段 A（PGlite）→ B（SQLite 共享层）→ C（桌面 host）                                      | 批次 3   |
| [US-211 多端小程序宿主](stories/adapter/US-211-multi-miniprogram-platforms.md)               | 📝 Backlog   | 未开工；阶段 A（抽 host + 可行性矩阵）可单独合并，B/C 只吃矩阵 `supported`                        | 批次 3   |
| [US-027 实体操作权限模型](stories/core/US-027-entity-permission-model.md)                    | 📝 Backlog   | 未立项；三阶段交付，UI 派生依赖 rxdb-model 移植                                                   | 立项池   |
| [US-028 可排序实体](stories/core/US-028-sortable-entity.md)                                  | 📝 Backlog   | 未立项；AC#7 联动 US-027（无 update 权限不可重排）                                                | 立项池   |
| [US-029 多用户 RBAC 与租户隔离设计](stories/core/US-029-rbac-tenant-permission-design.md)    | 📝 Backlog   | 未立项；阶段 A 独立可交付，阶段 B 依赖 US-027 判定原语                                            | 立项池   |
| [US-909 会话录制回放与失败现场数据还原](stories/future/US-909-session-replay-debugging.md)   | 📝 Backlog   | 未立项；阶段 A（e2e 失败现场录制回放）可单独评审，阶段 B 的前置 US-307 已 `Done`，阶段 C 价值待证 | 立项池   |
| [US-602 发布产物面向 AI 的可理解性](stories/tooling/US-602-ai-comprehensible-artifacts.md)   | 📝 Backlog   | 未立项；阶段 A（包关系真相源 + 漂移门禁）无硬前置、可单独合并，B/C 只吃 A 的真相源                | 立项池   |

## 即办清单

不进批次、随手可完成的事：

1. **epic-006 链收尾**（只剩 US-306 👀，不再有代码 AC）：M1 基线在**机器静默时重新冻结**——初版冻在
   1 分钟负载冲到 44 的机器上，`frozenAbsolute.commit` 虚高 29%，发布用的绝对门禁不得据此放行。
   复冻走契约 §3.1 的「已知带负载的基线复冻」，做完 US-306 关闭。CI 画像 reference 签入（T134）与
   读项容差（T135）已收口，US-307 / US-308 已关闭。

## 排期批次

### 批次 3：能力补齐（无硬前置，可并行开 PR）

同一批内的行彼此无依赖，可各开各的 PR；批次之间才是顺序。

| 故事                                                                                                    | 为什么排这里                                                                                                                                                             | 关闭判据                                                                                                             |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| [US-026](stories/core/US-026-instance-sync-override.md) 实例级实体同步配置覆盖（建议 P1）               | HTTP demo 的前后端仍以两个实体类表达不同同步策略，存在可复验的重复；基于现有策略解析，无桥接发布前置。与 US-025 协调消费者接缝，**不等待其阶段 E**                       | 实例隔离、三框架契约和前后端单类 demo 全部通过                                                                       |
| [US-217](stories/adapter/US-217-local-database-backup-restore.md) 本地数据库一致性备份与恢复（建议 P2） | US-207 / US-208 / US-210 都把导入导出与热备份排除在范围外，唯一路径是退出应用后整目录复制，不是可由应用调用的一致性备份接口。不依赖工作树 / commit graph，无桥接发布前置 | 阶段 A → B → C；一个 PR 只交付一个阶段；尚未交付的组合必须**明确拒绝**备份与恢复，拒绝行为通过测试不等于该组合已支持 |
| [US-211](stories/adapter/US-211-multi-miniprogram-platforms.md) 多端小程序宿主（建议 P3）               | Taro 有 `build:alipay/tt/qq/swan`，适配器只认 `wx`；阶段 A 只抽 host + 写可行性矩阵，**不扩大公开支持声明**                                                              | 阶段 A 单独可合并；B/C 只吃矩阵里 `decision: supported` 的平台（约束 7）；未关闭的阶段不得改支持声明                 |

### 批次 4：epic-006 链（整体压后）

> **有意排在所有其他批次之后**：这条链今天不是优先交付项，先把批次 3 的价值交付完，再推进本批次。
> 代码已全部落地：US-305 按代码 AC 关闭，US-307 / US-308 已关闭，US-306 只剩 M1 基线静默复冻
> （见即办清单）；6 后端 × 2 套件 5031 条零失败。**代码先落地不等于排期提前**——排期口径没变：
> 桥接发布（线 A）仍只卡**迁移发布**，`bridge.tag` 依旧是 `null`，且 `main` 自 #55 起已是 schema 6、
> 桥接锚点无处可切（见 [release-plan 开项](release-plan.md#开项main-自-55-起已是-schema-6桥接锚点无处可切)）。
> 线 A 是一次对外的不可逆动作（推 tag + `pnpm publish`），由 owner 手动发起、手动决定时点，
> 本节只做排期，不代表已获授权执行；启动时按 [release-plan.md](release-plan.md) 的执行顺序与两条硬前提执行。

| 线 / 链             | 内容                                                                                                                                                                                                                                                                             | 解锁自                                                        | 关闭判据 / 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A｜桥接版本发布** | 按 [release-plan.md 的执行顺序](release-plan.md) 走完 0～6 步，发一个 `kind=bridge` 的**非迁移**版本                                                                                                                                                                             | —                                                             | 五条**全部**成立才算完：① `release.version` **≠ `0.0.25`**（今天清单里的 `bridge/0.0.25` 是 0.0.25 那次发布的如实记录，不是本次成果，不许当判据用、不许改写）；② 与 `packages/rxdb/package.json` 同值；③ tag 已推送且 `git merge-base --is-ancestor v<版本>^{commit} HEAD` 人工跑过并留证；④ `migration-release-gate --release-tag=v<版本>` 全绿；⑤ 回写 [release-plan「迁移发布的关闭条件」](release-plan.md#迁移发布的关闭条件)（US-305 AC14 的绿半边在那里关闭）。**④ 单独没有区分力**（四条 bridge 钩子只对 `kind=migration` 生效，桥接发布走不到它们）；真正有区分力的是 ① 和 ③，这两条在**发布当下没有任何自动化在守**。隐含判据：桥接**不得抬升** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`，门禁只比对布尔位、从不读源码常量，须按 [release-plan 硬前提 1](release-plan.md) 的两条 `git log -G` 人工复测（`-S` 恒空、会给出假清白） |
| epic-006 链         | [US-305](stories/collaboration/US-305-commit-graph-head.md) → [US-306](stories/collaboration/US-306-working-tree-commits.md) 阶段 A → B → C →（[US-307](stories/collaboration/US-307-restore-session.md) ∥ [US-308](stories/collaboration/US-308-branch-isolation-conflict.md)） | specs 重生成已完成；线 A 只解锁本链的**迁移发布**，不解锁开工 | epic-006 的固定顺序（约束 5），**不可交换**。US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用阶段 C 冻结的 `useWorkingTree()` 与 `bench-working-tree`；每条故事按各自 AC 关闭                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

**线 A 启动前必读**（dry-run 的三条坑与非规范提交问题，动手前必须复测）：
dry-run 默认推算的版本号恰是 `0.0.25`（禁用值且 npm 已占用，必须显式指定版本）；changelog 会同时
**多报**（0.0.25 已发内容再写一遍，判断发没发过只能 `npm pack` 拉产物搜）与**漏报**（squash 进
`chore(aiao): update deps (#53)` 的 US-908 修复与 US-906 交付）；非规范提交信息一律记为 `none`、
等于零 bump 量。细则见[零散收尾项](#零散收尾项不成故事随手可带)第 1 条与
[release-plan.md 硬前提 2](release-plan.md)。

### 立项池（待 owner 决策，未进任何批次）

| 故事                                                                                       | 依赖                                            | 入场条件 / 建议顺序                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-027](stories/core/US-027-entity-permission-model.md) 实体操作权限模型                  | UI 派生依赖 rxdb-model 移植（specs/002）        | 引擎写边界强制（fail-closed）+ UI 能力派生 + 系统实体迁移，三阶段交付。**建议随 002 移植收尾后启动**——它是 US-028 / US-029 的判定原语上游                                                                                                                                                                                        |
| [US-028](stories/core/US-028-sortable-entity.md) 可排序实体                                | AC#7 联动 US-027                                | 建议与 US-027 同批或紧随；fractional indexing 工具与树实体解耦，`tree → sortable` 单向依赖（AC#9）                                                                                                                                                                                                                               |
| [US-029](stories/core/US-029-rbac-tenant-permission-design.md) RBAC 与租户隔离             | 阶段 B 依赖 US-027 判定原语                     | 阶段 A（`ownerId`/`tenantId` 字段预留与注入）独立可交付；按 A → B → C → D 排，一阶段一 PR                                                                                                                                                                                                                                        |
| [US-909](stories/future/US-909-session-replay-debugging.md) 会话录制回放                   | 阶段 B 的前置 US-307 已 `Done`；阶段 C 价值待证 | 阶段 A（rrweb 注入 e2e fixture + 本地回放页）可作为**候选价值单独评审**；阶段 C 解锁条件 = 写出「今天用户踩得到的具体症状」（病灶数 ≥ 抽象数）                                                                                                                                                                                   |
| [US-602](stories/tooling/US-602-ai-comprehensible-artifacts.md) 发布产物面向 AI 的可理解性 | 无                                              | 阶段 A（包关系真相源 + 漂移门禁）独立可交付，顺带消除「兄弟包声明一半 `dependencies` 一半 `peerDependencies`」的不一致；B（站点 `llms.txt`）/ C（主包单份 Skill）只吃 A 的真相源。C 阶段所依赖的 `agents` 字段约定[尚在提案阶段](https://github.com/antfu/skills-npm/blob/main/PROPOSAL.md)，定位为低成本期权，不构成 A/B 的前置 |
| 🚧 US-025 阶段 E 的前置：`RxDBBranch` 去树化                                               | 无                                              | 独立工作（不在 US-025 任一阶段内）：`system/branch.ts` 挂 `@TreeEntity`，树实体成插件后分支表建不起来，history 反过来要 `inject: ['plugin:tree']`——为搬走 474 行新增跨插件边。需 owner 决策去树化后分支表归谁，未立项                                                                                                            |

### epic-006 评审顺延的架构项

`next-0912` 评审报告收口时留下的六项，加上 2026-09-25 复核 `review` 分支（即这一轮收口本身）时
顺延的六项（表末六行）。**每一项的判据、修法与「不做的理由」都写在对应代码的 TSDoc 里**，
这里只登记「它挡着什么」和「谁来定」——两份报告都已删除，代码注释是唯一副本。

| 项                                                                                | 挡着                                                                                                                                                                           | 前置决策 / 判据位置                                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 提交图校验的「最后已验证 HEAD」水位（BFS 剪枝）＋ `list-commits` 的按分支派生结构 | 每次 commit / discard / restore / 切分支都全量重哈希整张可达图，O(N)                                                                                                           | **这是一次规格变更，不是性能重构**：剪枝直接违反 FR-051「MUST 遍历**完整**可达父链」与 SC-013「可达祖先损坏时三条入口各自报 `commit_graph_corrupted`」，要先改 spec 与验收（`/speckit-specify`）。两条共用同一份 ref 状态，必须一起做。判据见 `packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts` 与 `commit/list-commits.ts` 的 `@remarks` |
| `IRepository` 要不要长出聚合能力（`GROUP BY` / `COUNT`）                          | `working-tree/status.ts` 的两次顺序 `COUNT(*)`                                                                                                                                 | core ↔ plugin 公开面决策。另一条路（插件走 `executor.query()` 裸 SQL）会是本插件第一处生产裸读，方言返回类型与列名大小写不一致、测试替身只认结构化查询。判据见 `status.ts` 的 `readOriginBreakdown` `@remarks`                                                                                                                                               |
| 跨后端公共层落在哪个包 ＋ 语句收集协议统一（数组 vs `---STATEMENT_SEPARATOR---`） | 两个 `version/switch-result.utils.ts`、两个 `version/switch_branch.ts`、两处 `ensureBranchActiveKey`                                                                           | 两个适配器互不依赖，公共层放任一端都新增跨适配器边；核心拥有方言 SQL 等于让核心知道方言。**抽完只剩骨架**（类型口径、绑定与批量、值编解码、客户端协议四处都是方言原语），判据逐条写在这四个文件的 `@fileoverview` / `@remarks` 里。合一之前**任何改动必须两端同改**                                                                                          |
| `activeKey` 改由 schema 表达（生成列或 `WHERE activated` 部分唯一索引）           | 约 10 处生产写点手工共写 `activated ? '*active*' : null`                                                                                                                       | 要动 6 个适配器的 system schema 迁移并给既有库写迁移步骤；只改写点不改 schema 等于把十处手写换成十处调用。判据见 `packages/rxdb/src/system/branch.ts` 的 `RxDBBranch` `@remarks`                                                                                                                                                                             |
| 适配器长出「批量取现存表名」的公开能力                                            | `RxDB.ts` 每次 `connect()` 十几次顺序 `isTableExisted` 探测                                                                                                                    | 一次适配器公开面扩张（6 个后端两种方言各一遍），且落在全仓都走的连接路径上。判据见 `#ensureSystemTables` 的 `@remarks`                                                                                                                                                                                                                                       |
| 词法扫描门禁是否改用 AST                                                          | —                                                                                                                                                                              | **2026-09-24 判定不做**（收益与代价不成比例：要给一条秒级 pre-commit 门禁配一份覆盖全仓的类型化 Program）。原先唯一真的静默的那一格——扫描器的三张硬编码词表——已改为与 `TrustedWritePrimitive` / `METHOD_NAMES` 机械对照。重提门槛与全部失败形态见 `scripts/audit/working-tree-callsite-drift.mjs` 的 `@fileoverview`                                         |
| 物化 staging 页 payload 的加密信封校验                                            | 来源方把加密列交成明文时，明文照样落进 `rxdb_working_tree_materialization_page.payload`；失败 / 中断的 attempt 刻意不删，残留到调用方 `discardMaterializationAttempt` 为止     | 本模块不认识业务实体、分不出哪一格该是加密包，校验只能落在注入 `applyPage` 的一侧或快照来源的登记处；今天来源只有本连接自己登记的那一个。判据见 `packages/rxdb-plugin-working-tree/src/working-tree/working-tree-materialization-page.entity.ts` 的 `payload` `@remarks`，门禁边界见 `specs/001-working-tree-commits/threat-model.md` §7                     |
| `WorkingTreeEntry.fingerprint` 要不要从 FNV-1a/32 换成 SHA-256                    | 今天不挡——没有生产代码比较这一列（US-308 交付的冲突检测也不读它）；有消费者按身份逐对比较之后才生效，误判相等约 2⁻³² / 对                                                      | 由首个比较这一列的消费者定。代价是捕获热路径上每次写多算一遍纯 JS 摘要、列宽 8 → 64 位；同步的 `sha256Hex` 现成，不需要异步也不需要新依赖。判据见 `packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts` 的 `fingerprintOf` `@remarks`                                                                                                      |
| 活 count 查询的刷新成本                                                           | 热表上每一条命中 where 的 CREATE / REMOVE 与跨 where 边界的 UPDATE 都打一次整表 `COUNT`；`refresh$` 走 `switchMap`，只丢弃过时那一轮、不合并刷新                               | count 结果没有 id 级基线，本地 ± 调整不安全（2026-09-25 删掉的 `handleCountUpdate` 就是反例）；要降成本得先给 count 结果配一个能与事件对齐的水位，或者给刷新加合并窗口。判据见 `packages/rxdb/src/query/merge_create.ts` 的 count 分支注释                                                                                                                   |
| 同步跳过的远端分支没有持久标记                                                    | 远端不修，`invalid-id` 的分支连同它的子孙每轮重拉、重跳，一直占位                                                                                                              | 要不要记「已知坏行」、记在本地还是只上报，由同步层定；调用方今天已能用 `SyncBranchesResult.skipReasons` 区分会自愈的跳过与永久跳过。判据见 `packages/rxdb-plugin-sync/src/sync-branches.ts` 的 `skipped` TSDoc                                                                                                                                               |
| supabase 只把 main 的变更落实体表                                                 | 在 feature 分支上激活时的编辑推上去只留 `RxDBChange` 记录、不进实体表，与本地「任意分支可激活」的语义不一致                                                                    | 先定服务端按什么判定「激活」（按连接、按用户还是全局）。判据见 `packages/rxdb-adapter-supabase/src/supabase.merge-changes.ts` 的 `isMainBranch` 注释                                                                                                                                                                                                         |
| UPDATE 门控在实体缓存未命中时判不出 where 跨界                                    | 他 tab 转来的增量 UPDATE 落到没缓存该实体的 tab（只挂 count 的 tab 最典型）时，复合 where 的其余字段两侧同为缺失：count 跨界与 find 系的「新匹配」都判不出来，结果静默停在旧值 | 修法二选一：门控改判「where 用到的字段是否齐全」，或跨 tab 事件改带整行。「缓存命中与否」当不了判据——未命中时 `serialize` 会把残缺实体写进缓存。判据见 `packages/rxdb/src/query/need_refresh_update.ts` 的 `count_boundary_crossed` 注释                                                                                                                     |

已在这一轮答完、**不再是开项**的两问：物理表名解析（适配器已暴露 `RxDBAdapterLocalBase.physicalTableNames()`，插件改成问它）、`MAIN_BRANCH_ID` 的归属（常量进 `@aiao/rxdb`）。

## 零散收尾项（不成故事，随手可带）

1. **线 A 启动前先跑 `nx release version --dry-run` 看真实版本号**（线 A 已压后到批次 4，启动时执行）。
   三条坑与处置（仓库仍在产生提交，动手前必须复测）：

   - **默认推算出来的就是 `0.0.25`**——正好是线 A 关闭判据 ① 的禁用值，且 npm 上已被占用。
     specifier 解析成 `minor`，但 nx 的 `adjustSemverBumpsForZeroMajorVersion` 默认 `true`，
     major 为 0 时把 `minor` 降级成 `patch`，于是 `0.0.24 → 0.0.25`。**线 A 必须显式指定版本号**，
     取值是一次人工决定，但不得为 `0.0.25`。机制与命令见 [release-plan.md 硬前提 2](release-plan.md)。
   - **`preVersionCommand` 红了就跑不到版本计算**，只报一句 `The pre-version command failed`。
     `code-editor-angular:build` 会因本机 `node_modules` 残留 codemirror 旧副本而红
     （lockfile 是干净的，属安装态漂移）；`pnpm install --frozen-lockfile` 会跳过，需要加 `--force`。
     别把这种红误读成「没有可发布的变更」。
   - 区间（`v0.0.24..main`）**包含已随 0.0.25 发布过的内容**，changelog 会再写一遍，需要决定是否手工裁剪。
     判断「发没发过」**不能看 tag 祖先链**——`v0.0.25` 的 tag 树与已发布产物对不上，
     唯一可信口径是 `npm pack` 拉产物搜，见 [release-plan.md 版本漂移开项第三条](release-plan.md)。
   - **同一份 changelog 还会漏报**：`f4e0778 chore(aiao): update deps (#53)` 是一次 squash 合并，
     标题写升级依赖，实际带走的是 [US-908](stories/future/US-908-devtools-transfer-session-defects.md)
     的**两条缺陷修复**与 [US-906](stories/future/US-906-electron-devtools-developer-path.md) 的交付。
     标题是 `chore`，这两条 `fix` 既不贡献 bump 也不进 Bug Fixes。该提交已推送**不得重写**，
     只能在 changelog 生成后人工补写。**多报和漏报要一起过**，细则见 [release-plan.md 硬前提 2](release-plan.md) 的 ② 与 ④。

## 排期约束

1. US-012 已 Done。其 DTO 不得重新定义 `bigint/binary` 的值 wire codec——该不变量随 DTO 发布而永久成立。
2. US-207 已锁定 Electron SQLite 的真实连接语义并抽出共享桌面 host 契约
   （`rxdb-adapter-sqlite-core/desktop-host` 子路径，US-208 / US-210 复用）。「无法保证单连接事务时应
   fail-fast、不得降级成伪事务」作为长期铁律保留，对所有复用该契约的后端同样成立。
3. US-208 事务方案**已冻结**为「IPC 事务 ID 协议」（「adapter 完整托管在主进程」因接口面随业务事务数线性
   增长、且崩溃后事务仍照跑照提交被否决）；US-210 事务方案**已冻结**为「Rust command 持有
   `rusqlite::Connection`」（「配置单连接池」因 `sqlx` 池连续调用可能落在不同物理连接被否决）。
4. US-904 内部四阶段顺序（阶段 A ∥ (B → C)，Electron 集成要求 A+C+US-207+US-504 → 阶段 D；Tauri 按
   US-904 阶段 C → US-905，原生链 US-210 → US-505）。已全部交付，留作已冻结依赖链的记录。
5. US-305 的提交竞争只使用领域 `headRevision` CAS，不引入 writer lease 或迁移 epoch。US-305 的
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry；`main` 自 #55 起已是 schema 6，
   锚点从哪里切见 [release-plan 开项](release-plan.md#开项main-自-55-起已是-schema-6桥接锚点无处可切)。
   epic-006 内部顺序为 **US-305 → US-306 阶段 A → 阶段 B → 阶段 C →（US-307 ∥ US-308）**。
6. US-703 应复用现有搜索公开 API 和跨框架 parity fixture，不为 PGlite 增加 SQLite 专属 fallback。
   该条已随 US-703 交付履行；对后续搜索改动仍有效。
7. US-209 已 Done，其**能力上限**转为长期口径：WAL、多页面并发、崩溃恢复保证在微信路径上不得扩大；
   文档一律写「实验性」。**平台集合**的扩展由 US-211 认领：阶段 A 先抽宿主契约并写可行性矩阵；
   阶段 B/C 只吃矩阵里 `decision: supported` 的平台，未关闭的阶段不得改公开支持声明。
8. epic-008 内部 **US-013 → US-014** 为硬序，两条已全关。判据随之生效：**US-015 阶段 B 及其之后的每一条**
   都必须写出「今天用户踩得到的具体症状」才允许排期；写不出就留在 Backlog。US-015 已整体 `Done`
   （阶段 B 的消费方是 US-025 阶段 C/D）。US-014 制造的 `IRxDBPlugin` 成员签名变更由类型契约测试守住，
   不扩大 epic-007 的范围。
9. **过度设计判据，不是建议。** 进入 epic-008 的两条要同时满足：是「资源获取与释放拆成两处」的问题，
   且能写出今天用户踩得到的具体症状。**状态变量复位不算病灶**——`#shutdown()` 里 `#transaction_stack = []`、
   `#connected_sub.next(false)` 这类复位，作用域原语按定义碰不到。
10. **US-212 的发布门禁不再生效**：US-020 两阶段全关后，US-212 **零前置，可直接开工并按 `stable` 发布**，
    README / npm 不再需要标 `experimental`。协议不变量仍是硬的：HTTP 是独立 `adapter:remote`，sqlite 是独立
    `adapter:local`，**禁止 HTTP 内部拥有 sqlite**；v1 changelog 方法（`pullChanges` / `mergeChanges` /
    `getChangeCount`）必须 throw unsupported，**不得假空**；`pullChangesBatch` 是 optional 成员，调用点做
    特性探测，不实现即可，实现了也不得返回空数组。
11. **US-212 不再挂在 epic-006 上，改由一条结构隔离不变量替代**：
    > **US-212 MUST NOT 实现或调用 `upsertMany()` / `deleteByIds()` / `getMetadataByIds()`，
    > MUST NOT 持有任何 `QueryCacheLocalAdapter`，构造函数 MUST NOT `new` 任何本地存储。**
    > 该不变量由 US-212 阶段 A 的 AC#19 契约测试冻结。US-306 阶段 A 落地时 MUST 把 HTTP 包纳入其 SC-004
    > 漂移扫描的核对范围。
12. **US-018 不得与线 A 的桥接版本同批发。** 一个「不改 schema、只做迁移锚点」的桥接版本带着
    `BREAKING CHANGE` 是错误的对外信号。US-018 排在桥接版本**之后**单独发。**本条不随 US-018 关闭而失效**：
    线 A 发布前必须先确认这批破坏性改动不在同一发布区间内——判据是发布区间的提交范围，不是故事状态。

    **本条当前处于「已触发、待人工决定」，不要当成自动满足。** 两个事实同时成立：
    ① US-018 的破坏性实现（`unsupportedDefaultFactory`）落在 `a63321c`，**在 `v0.0.24..main` 区间内**，
    按本条的字面判据（发布区间的提交范围）即为触发；
    ② 但它**已经随 `0.0.25` 的产物发出去了**——`npm pack @aiao/rxdb-client-generator@0.0.25` 拉下来的包里
    含该实现。注意 `git merge-base --is-ancestor a63321c v0.0.25^{commit}` 为 **false**，据此会得出
    「尚未发布」的**错误**结论，原因是 tag 树与已发布产物对不上（见
    [release-plan.md 版本漂移开项第三条](release-plan.md)）。

    也就是说「桥接版本会把破坏性改动首次推给用户」这个原始担忧**已不成立**（用户手上的 `0.0.25` 早就有了），
    但 changelog 仍会把它当成新变更宣告一次。**需要 owner 在线 A 启动时三选一并留证**：
    裁剪 changelog 中的该条目 / 接受重复宣告并在 release note 里说明它实际随 0.0.25 已发 /
    把该提交移出发布区间。**不得**以「tag 祖先链显示未发布」为由跳过这次决定。

13. **US-213 暴露的协议缺陷不在该故事内修。** 若参考后端按文档逐字实现后暴露出协议本身不自洽，US-213
    MUST NOT 改 `src/`、也 MUST NOT 改参考后端去迁就客户端。处置是：该用例标 `it.fails` 或单列
    `describe.skip`，在故事里记为「协议缺陷 → 另开 US」，由新故事带着自己的 breaking-change 与迁移表走
    发布流程。本条对后续接入方仍然有效。
14. **US-214 同样不改 `src/`，唯一例外是 `http-protocol.md` 的「跨源（CORS）」一节**：那**不是改协议**，
    是把一个客观存在、只是没写下来的浏览器前置补进文档，且**只增不改**。demo 后端的 `__control/*` 是演示
    开关**不是协议的一部分**，MUST NOT 出现在 `http-protocol.md`。
15. **Electron 打包里凡被 esbuild 标成 `external` 的运行时包，MUST 声明进
    `apps/dev-rxdb-electron/package.json` 的 `dependencies`**（不是 `devDependencies`）。
    electron-builder 26 只走 **production** 依赖图收集 node_modules（`pnpm list --prod`；回退遍历
    也只读 `dependencies` + `optionalDependencies`），放错位置在本机 dev 与 Linux/macOS 打包下都
    碰巧能跑，**只在 Windows 产物里**炸成 `Cannot find module '<包名>'`。防回归已就位：
    `desktop-sqlite-bridge.spec.ts` 两条单测把搬运清单同时钉在 `dependencies` 与 esbuild 的 `external` 上，
    三者任一处漂移即红。本条**不随 US-208 关闭而失效**，对后续每一个新增 external 依赖同样成立。

## 明确不排期

| 项                                                                                            | 判定                                                                                                                                                                                                                                                                                                                                                                                                                 |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `US-016` 连接纪元与停机收敛                                                                   | **不排期，不再解锁**——原症状由 US-015 阶段 A 覆盖，剩余的资源降级路径已按 bugfix 补齐                                                                                                                                                                                                                                                                                                                                |
| `US-017` 三框架宿主作用域                                                                     | **不排期**。三端各自已有原生作用域（Angular `DestroyRef` / React `useEffect` cleanup / Vue `onScopeDispose`）。**解锁条件 = 三端任一出现可复现的清理泄漏**                                                                                                                                                                                                                                                           |
| US-212 AC#30 行缓存 eviction                                                                  | **不在 US-212 范围内**。执行面只有 core 有、HTTP 包按约束 11 的结构隔离碰不到。**解锁条件 = 出现可复现的缓存膨胀症状（具体实体 + 量级）**                                                                                                                                                                                                                                                                            |
| `npm deprecate @aiao/rxdb-adapter-desktop`（US-207 E6）                                       | **判定不做**。`@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上，未来仍可更新；迁移路径由 `website/docs/migration/desktop-split.md` 指路                                                                                                                                                                                                                                                                        |
| `packages/rxdb-adapter-tauri/rust/` 发 crates.io                                              | **本轮不发**（US-210 T7，`publish = false`）。README 已写清 path / git 依赖的用法与限制                                                                                                                                                                                                                                                                                                                              |
| 桌面安装包（installer / bundle）的自动化验证                                                  | **人工验收，不排自动化**。`release-desktop.yml` 跑 `tauri build --ci --no-bundle`，只验编译与 smoke、不产安装包；装包能否安装启动由人工过一遍                                                                                                                                                                                                                                                                        |
| [epic-009](epics/epic-009-bom-domain-model.md) BOM 领域模型全 19 条                           | **整条 Epic 不排期**，全部 `priority: Low`。约 15 项新增抽象对应**零个已知病灶**，不满足 [CONVENTIONS 价值待证](CONVENTIONS.md#价值待证) 的「病灶数 ≥ 抽象数」判据。**解锁条件 = 出现真实驱动场景**（拿到客户 BOM 数据，或有 BOM 应用要上线）。逐条：US-507 / US-508 / US-510 / US-511 / US-512 / US-513 / US-514 / US-515 / US-516 / US-517 / US-518 / US-519 / US-520 / US-521 / US-522 / US-523 / US-524 / US-525 |
| [US-509](stories/plugin/US-509-bom-dag-cycle-detection.md) DAG 约束与环路检测下沉存储层       | **不排期，但可单独评审**——它是 epic-009 里唯一带独立病灶的一条：`@aiao/rxdb-plugin-graph` 的 `findPaths` 只保证**返回的**路径无环，写入侧不阻止成环的边。这条病灶不依赖 BOM 场景即成立，解锁条件比 Epic 其余 18 条低                                                                                                                                                                                                 |
| [US-030](stories/core/US-030-declarative-storage-constraints.md) 实体元数据层的声明式存储约束 | **不排期，但解锁条件低一档**——从 epic-009 拆出，归 [epic-004](epics/epic-004-future-features.md)。四类引擎缺口今天确实不存在（`EntityMetadataOptions` 无 CHECK 落点，`EntityIndexMetadataOptions` 自有字段只有 `properties` 与 `normalized`，`unique` 来自继承的 `IEntityObject`），但当前消费方全是 BOM 故事，无独立病灶。**解锁条件 = 任意一条需要「不变量在存储层成立」的故事**，不限 BOM 场景                    |
| [US-524](stories/plugin/US-524-routing-master-model.md) 工艺路线本体                          | **不排期，且比 Epic 其余各条更晚**——US-520 与 US-514 都能先以「路线由外部系统提供」的形态交付。**解锁条件 = 路线主数据也要落在本仓**                                                                                                                                                                                                                                                                                 |
| [US-525](stories/plugin/US-525-bom-end-to-end-demo.md) BOM 端到端 demo                        | **不排期，且不得反过来当解锁依据**——demo 需要插件先存在，拿它论证 Epic 该启动是循环论证。它不新增抽象，是解锁**之后**首轮切片的验收手段。**解锁条件 = epic-009 已解锁且首轮切片开工**                                                                                                                                                                                                                                |

## 建议补充的验收维度

- **故障恢复**：迁移者、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。
