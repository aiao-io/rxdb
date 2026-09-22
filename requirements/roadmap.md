# 路线图（Roadmap）

> 本文回答「接下来做什么、什么必须排在什么前面」。故事当前状态见 [status-overview.md](status-overview.md)，
> 发布执行见 [release-plan.md](release-plan.md)，能力缺口见 [capability-matrix.md](capability-matrix.md)。
>
> 本文是**排期建议**，不改变各 story frontmatter 中的 `status`；实现时以对应 story 的验收标准（AC）为准。

## 现状快照

| 状态           | 数量   |
| :------------- | :----- |
| ✅ Done        | 61     |
| 🚧 In Progress | 0      |
| 👀 In Review   | 5      |
| 📝 Backlog     | 24     |
| **未完成合计** | **29** |

仓库还剩 **29 条**未关闭故事（0 In Progress + 5 In Review + 24 Backlog）。

> 口径与 [status-overview 状态汇总](status-overview.md#状态汇总) 一致：YAML `status` 字段 `grep` 推导。
> 另有一项**进行中的规格工作不在故事计数内**：[specs/002-rxdb-model-port](../specs/002-rxdb-model-port/spec.md)
> （rxdb-model 实体模型库 + 三框架 UI 组件集移植，当前分支，Angular 先行）。US-027 / US-028 / US-029 的
> rxdb-model UI 派生以它为依托，见[立项池](#立项池待-owner-决策未进任何批次)。

## 未完成需求全景

下表只列**已立项**的未完成故事的「剩什么」与「排期位置」。
[epic-009 BOM 领域模型](epics/epic-009-bom-domain-model.md) 的 17 条整体标价值待证、不进任何批次，
单独列在[明确不排期](#明确不排期)里，不混进本表。

| Story                                                                                           | 状态           | 剩什么                                                                                                       | 排期位置 |
| ----------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| [US-025 核心包子系统按插件边界外移](stories/core/US-025-core-plugin-extraction.md)              | 🚧 In Progress | 阶段 A～D 已交付；只剩阶段 E 树实体外移，前置 = `RxDBBranch` 去树化（独立工作，不在本故事任一阶段内）        | 立项池   |
| [US-506 website 插件文档补齐](stories/plugin/US-506-website-plugin-docs.md)                     | 👀 In Review   | 改动已全部落地，AC 1～6 全 ✅，`site-build` 坏链门禁下跑绿；**只待提交合并**                                 | 即办     |
| [US-305 提交图与 HEAD 持久化](stories/collaboration/US-305-commit-graph-head.md)                | 👀 In Review   | 代码落地、6 后端 conformance 就位；FR-030 发布前置未解除（`bridge.tag` 仍为 `null`，真实 bridge tag 不存在） | 批次 4   |
| [US-306 工作树与提交操作](stories/collaboration/US-306-working-tree-commits.md)                 | 👀 In Review   | 任务侧全关；性能基线是带负载的初版，机器静默复冻前不得作发布放行依据；`status` 容差口径归评审                | 批次 4   |
| [US-307 历史恢复会话](stories/collaboration/US-307-restore-session.md)                          | 👀 In Review   | 任务侧全关（T109 `restore` 已进基线）；遗留基线复冻同 US-306                                                 | 批次 4   |
| [US-308 分支隔离与跨 realm 冲突检测](stories/collaboration/US-308-branch-isolation-conflict.md) | 👀 In Review   | 任务侧全关，随链收尾                                                                                         | 批次 4   |
| [US-026 实例级实体同步配置覆盖](stories/core/US-026-instance-sync-override.md)                  | 📝 Backlog     | 未开工；无硬前置                                                                                             | 批次 3   |
| [US-217 本地数据库一致性备份与恢复](stories/adapter/US-217-local-database-backup-restore.md)    | 📝 Backlog     | 未开工；阶段 A（PGlite）→ B（SQLite 共享层）→ C（桌面 host）                                                 | 批次 3   |
| [US-211 多端小程序宿主](stories/adapter/US-211-multi-miniprogram-platforms.md)                  | 📝 Backlog     | 未开工；阶段 A（抽 host + 可行性矩阵）可单独合并，B/C 只吃矩阵 `supported`                                   | 批次 3   |
| [US-027 实体操作权限模型](stories/core/US-027-entity-permission-model.md)                       | 📝 Backlog     | 未立项；三阶段交付，UI 派生依赖 rxdb-model 移植                                                              | 立项池   |
| [US-028 可排序实体](stories/core/US-028-sortable-entity.md)                                     | 📝 Backlog     | 未立项；AC#7 联动 US-027（无 update 权限不可重排）                                                           | 立项池   |
| [US-029 多用户 RBAC 与租户隔离设计](stories/core/US-029-rbac-tenant-permission-design.md)       | 📝 Backlog     | 未立项；阶段 A 独立可交付，阶段 B 依赖 US-027 判定原语                                                       | 立项池   |
| [US-909 会话录制回放与失败现场数据还原](stories/future/US-909-session-replay-debugging.md)      | 📝 Backlog     | 未立项；阶段 A（e2e 失败现场录制回放）可单独评审，阶段 B 依赖 US-307 `Done`，阶段 C 价值待证                 | 立项池   |

## 即办清单

不进批次、随手可完成的两件事：

1. **US-506 合并**——改动已全部落地（US-025 拆包三插件的文档站手册页、侧边栏、typedoc 收录与坏链修复），
   `site-build` 已绿，只差提交合并。
2. **epic-006 收尾两件文书外事项**（排期随批次 4，但可提前推进）：
   - 性能基线在**机器静默时重新冻结**——现基线冻在 1 分钟负载冲到 44 的机器上，`frozenAbsolute.commit`
     虚高 29%，发布用的绝对门禁不得据此放行；
   - `status` 测点的**容差口径评审**——「4ms 量级读 ÷ 2.5ms 量级对照」对噪声没有抵抗力
     （可选解：小量级测点单独容差，或改判绝对 p95 ≤ 100ms，实测 5.54ms、余量 18 倍）。

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
> 代码已在 `next-0912` 上全部落地并转 👀 In Review：`specs/001-working-tree-commits/tasks.md`
> **133 条全部关闭**，6 后端 × 2 套件 5031 条零失败。**代码先落地不等于排期提前**——排期口径没变：
> 桥接发布（线 A）仍只卡**迁移发布**，`bridge.tag` 依旧是 `null`；性能基线仍是带负载的初版（见即办清单）。
> 线 A 是一次对外的不可逆动作（推 tag + `pnpm publish`），由 owner 手动发起、手动决定时点，
> 本节只做排期，不代表已获授权执行；启动时按 [release-plan.md](release-plan.md) 的执行顺序与两条硬前提执行。

| 线 / 链             | 内容                                                                                                                                                                                                                                                                             | 解锁自                                                        | 关闭判据 / 说明                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A｜桥接版本发布** | 按 [release-plan.md 的执行顺序](release-plan.md) 走完 0～6 步，发一个 `kind=bridge` 的**非迁移**版本                                                                                                                                                                             | —                                                             | 五条**全部**成立才算完：① `release.version` **≠ `0.0.25`**（今天清单里的 `bridge/0.0.25` 是 0.0.25 那次发布的如实记录，不是本次成果，不许当判据用、不许改写）；② 与 `packages/rxdb/package.json` 同值；③ tag 已推送且 `git merge-base --is-ancestor v<版本>^{commit} HEAD` 人工跑过并留证；④ `migration-release-gate --release-tag=v<版本>` 全绿；⑤ 回写 [US-305](stories/collaboration/US-305-commit-graph-head.md) 的 FR-030 / AC14 证据。**④ 单独没有区分力**（四条 bridge 钩子只对 `kind=migration` 生效，桥接发布走不到它们）；真正有区分力的是 ① 和 ③，这两条在**发布当下没有任何自动化在守**。隐含判据：桥接**不得抬升** `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION`，门禁只比对布尔位、从不读源码常量，须按 [release-plan 硬前提 1](release-plan.md) 的两条 `git log -G` 人工复测（`-S` 恒空、会给出假清白） |
| epic-006 链         | [US-305](stories/collaboration/US-305-commit-graph-head.md) → [US-306](stories/collaboration/US-306-working-tree-commits.md) 阶段 A → B → C →（[US-307](stories/collaboration/US-307-restore-session.md) ∥ [US-308](stories/collaboration/US-308-branch-isolation-conflict.md)） | specs 重生成已完成；线 A 只解锁本链的**迁移发布**，不解锁开工 | epic-006 的固定顺序（约束 5），**不可交换**。US-307 / US-308 的核心持久层半边可与 US-306 阶段 C 并行开工，但三框架入口与 benchmark 采样必须复用阶段 C 冻结的 `useWorkingTree()` 与 `bench-working-tree`；每条故事按各自 AC 关闭                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |

**线 A 启动前必读**（dry-run 的三条坑与非规范提交问题，动手前必须复测）：
dry-run 默认推算的版本号恰是 `0.0.25`（禁用值且 npm 已占用，必须显式指定版本）；changelog 会同时
**多报**（0.0.25 已发内容再写一遍，判断发没发过只能 `npm pack` 拉产物搜）与**漏报**（squash 进
`chore(aiao): update deps (#53)` 的 US-908 修复与 US-906 交付）；非规范提交信息一律记为 `none`、
等于零 bump 量。细则见[零散收尾项](#零散收尾项不成故事随手可带)第 1 条与
[release-plan.md 硬前提 2](release-plan.md)。

### 立项池（待 owner 决策，未进任何批次）

| 故事                                                                           | 依赖                                       | 入场条件 / 建议顺序                                                                                                                                                                                                   |
| ------------------------------------------------------------------------------ | ------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-027](stories/core/US-027-entity-permission-model.md) 实体操作权限模型      | UI 派生依赖 rxdb-model 移植（specs/002）   | 引擎写边界强制（fail-closed）+ UI 能力派生 + 系统实体迁移，三阶段交付。**建议随 002 移植收尾后启动**——它是 US-028 / US-029 的判定原语上游                                                                             |
| [US-028](stories/core/US-028-sortable-entity.md) 可排序实体                    | AC#7 联动 US-027                           | 建议与 US-027 同批或紧随；fractional indexing 工具与树实体解耦，`tree → sortable` 单向依赖（AC#9）                                                                                                                    |
| [US-029](stories/core/US-029-rbac-tenant-permission-design.md) RBAC 与租户隔离 | 阶段 B 依赖 US-027 判定原语                | 阶段 A（`ownerId`/`tenantId` 字段预留与注入）独立可交付；按 A → B → C → D 排，一阶段一 PR                                                                                                                             |
| [US-909](stories/future/US-909-session-replay-debugging.md) 会话录制回放       | 阶段 B 依赖 US-307 `Done`；阶段 C 价值待证 | 阶段 A（rrweb 注入 e2e fixture + 本地回放页）可作为**候选价值单独评审**；阶段 C 解锁条件 = 写出「今天用户踩得到的具体症状」（病灶数 ≥ 抽象数）                                                                        |
| 🚧 US-025 阶段 E 的前置：`RxDBBranch` 去树化                                   | 无                                         | 独立工作（不在 US-025 任一阶段内）：`system/branch.ts` 挂 `@TreeEntity`，树实体成插件后分支表建不起来，history 反过来要 `inject: ['plugin:tree']`——为搬走 474 行新增跨插件边。需 owner 决策去树化后分支表归谁，未立项 |

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
   schema migration 前必须从当前发布主线产生新的有效 bridge ancestor；历史 `v0.0.25` 已脱离当前 ancestry。
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

| 项                                                                                      | 判定                                                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [US-506](stories/plugin/US-506-website-plugin-docs.md) website 插件文档补齐             | **不排期，只待合并**。改动已全部落地，AC 1～6 全 ✅，`site-build` 在坏链门禁下跑绿；是 US-025 拆包的文档收尾，不是待排期的未来工作                                                                                                                                                                                                                                                                 |
| `US-016` 连接纪元与停机收敛                                                             | **不排期，不再解锁**——原症状由 US-015 阶段 A 覆盖，剩余的资源降级路径已按 bugfix 补齐                                                                                                                                                                                                                                                                                                              |
| `US-017` 三框架宿主作用域                                                               | **不排期**。三端各自已有原生作用域（Angular `DestroyRef` / React `useEffect` cleanup / Vue `onScopeDispose`）。**解锁条件 = 三端任一出现可复现的清理泄漏**                                                                                                                                                                                                                                         |
| US-212 AC#30 行缓存 eviction                                                            | **不在 US-212 范围内**。执行面只有 core 有、HTTP 包按约束 11 的结构隔离碰不到。**解锁条件 = 出现可复现的缓存膨胀症状（具体实体 + 量级）**                                                                                                                                                                                                                                                          |
| `npm deprecate @aiao/rxdb-adapter-desktop`（US-207 E6）                                 | **判定不做**。`@aiao/rxdb-adapter-desktop@0.0.25` 保留在 registry 上，未来仍可更新；迁移路径由 `website/docs/migration/desktop-split.md` 指路                                                                                                                                                                                                                                                      |
| `packages/rxdb-adapter-tauri/rust/` 发 crates.io                                        | **本轮不发**（US-210 T7，`publish = false`）。README 已写清 path / git 依赖的用法与限制                                                                                                                                                                                                                                                                                                            |
| 桌面安装包（installer / bundle）的自动化验证                                            | **人工验收，不排自动化**。`release-desktop.yml` 跑 `tauri build --ci --no-bundle`，只验编译与 smoke、不产安装包；装包能否安装启动由人工过一遍                                                                                                                                                                                                                                                      |
| [epic-009](epics/epic-009-bom-domain-model.md) BOM 领域模型全 17 条                     | **整条 Epic 不排期**，全部 `priority: Low`。约 12 项新增抽象对应**零个已知病灶**，不满足 [CONVENTIONS 价值待证](CONVENTIONS.md#价值待证) 的「病灶数 ≥ 抽象数」判据。**解锁条件 = 出现真实驱动场景**（拿到客户 BOM 数据，或有 BOM 应用要上线）。逐条：US-507 / US-508 / US-510 / US-511 / US-512 / US-513 / US-514 / US-515 / US-516 / US-517 / US-518 / US-519 / US-520 / US-521 / US-522 / US-523 |
| [US-509](stories/plugin/US-509-bom-dag-cycle-detection.md) DAG 约束与环路检测下沉存储层 | **不排期，但可单独评审**——它是 epic-009 里唯一带独立病灶的一条：`@aiao/rxdb-plugin-graph` 的 `findPaths` 只保证**返回的**路径无环，写入侧不阻止成环的边。这条病灶不依赖 BOM 场景即成立，解锁条件比 Epic 其余 16 条低                                                                                                                                                                               |

## 建议补充的验收维度

- **故障恢复**：迁移者、桌面 host 或搜索索引初始化中途崩溃后，重试结果必须可预测且不可产生半状态。
- **能力矩阵**：SQLite family、PGlite、Electron、Tauri、Angular、React、Vue 的支持/不支持组合必须在 story 和公开文档中显式列出。
- **发布门禁**：新增公开 API 同步更新 API baseline、TSDoc、覆盖率门禁和跨框架 parity 测试。
- **可观测性**：连接、迁移、索引回填失败应提供稳定错误码和可诊断上下文，不静默回退到 memory、OPFS 或 IndexedDB。
