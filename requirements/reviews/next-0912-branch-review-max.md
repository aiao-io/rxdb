# next-0912 分支对 main 评审（max 独立复核轮）

- **评审日期**：2026-09-18（独立于同日「复核」的完整 max 评审）
- **评审分支**：`next-0912`，已于 2026-09-19 以 `2132c30d`（`feat(aiao): 添加 working-tree 能力 (#55)`）合入 main
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`；`next-0912` HEAD `9e5ddc92cdca4c781d991a4332ef9a81aab7cf0b`
- **变更规模**：427 个文件，`+61,111 / -2,904`
- **评审强度**：max（9 个分区 finder 全角度扫描 → 44 条候选 → 每条独立对抗式验证 → 1 轮 sweep 查漏）；终局 46 CONFIRMED + 1 PLAUSIBLE + 2 REFUTED
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **验证口径**：条目以静态跨文件追踪 + 局部实测为准；未跑全量 `pnpm test-all` 或 E2E。
- **最近一轮处理**：2026-09-24。逐条复核后落地修复，已修 / 经复核证伪 / 判定不值得做的条目按本目录「只留尚未处理的条目」约定删除（修法与判据写在代码注释与 TSDoc 里）。
- **当前结论**：🟡 原「不建议合并」结论已过期。剩 **1 条架构级顺延项**（§3，且它与 `next-0912-branch-review.md` 的唯一 P1 是同一条流水线）、**2 条卡在核心公开面决策上的 P2**（§2）。 原 §3 的 4 条效率 / 重复项已于 2026-09-23 全部落地（提交图守卫按层批量取 ChangeSet、捕获热路径按批取查询、启用态 raw-write context 改为装载期建一次、三端 spec 夹具下沉到 `@aiao/rxdb-plugin-working-tree/testing`），该节删除。

## 1. 范围与方法

- **范围**：`git diff main...HEAD` 全部 427 个文件。核心区域：`packages/rxdb-plugin-working-tree`（~15K 行源码 + 3.3K 行套件）、三框架绑定（angular/react/vue）、`packages/rxdb` 的 capture / trusted-write / plugin-system 基础设施、6 个适配器集成、`rxdb-plugin-history`、`scripts/audit` 五个脚本、benchmarks、三个 demo app 及其 e2e、specs/website 契约与文档。
- **方法**：9 个并行 finder 按分区扫描全部角度（逐行、删除行为审计、跨文件调用追踪、语言陷阱、包装器正确性、复用/简化/效率/altitude/规范），产出 44 条候选；每条候选由**独立验证 agent 对抗式验证**（能实测的全部实测复现，例如 SQL 判定用 node 直接跑出结果）；随后一轮全新视角 sweep 补查 5 条新候选并同样独立验证。

## 2. 未处理的 Top 发现（剩 2 条）

> **标记说明**：`⬇ 降级` = 原严重度高估，附降级理由。剩下这两条都是降级项：机制属实、拒绝/失败本身正确，坏的分别是建表跳过的静默与错误对象里的一格诊断字段。

### [P2] ⬇ 降级 — 系统实体注册表跨实例按 namespace:name 吞掉用户建表（原报 P1）

- **证据**：[system-entities.ts:51-54](../../packages/rxdb/src/system/system-entities.ts#L51) 的 `isSystemEntity` 按 `namespace:name` 在模块级 `SYSTEM_ENTITY_IDENTITIES` 比对（跨实例共享）；[RxDB.ts:1764](../../packages/rxdb/src/RxDB.ts#L1764) 既有库路径 `#ensureEntityTables` 据此 `continue` 跳过建表。新库路径（972 行附近）无此过滤。
- **触发与影响**：同一进程内实例 A `use()` 过插件（注册 `rxdb:Commit`），实例 B 的用户实体若撞名（`@Entity({namespace:'rxdb', name:'Commit'})`，namespace 未校验、默认 `public`）在既有库上被静默跳过建表，首次仓库查询报 `no such table` 且错误不指向实体注册；实例级的 class 引用检查（SchemaManager）不会拦。
- **修复建议**：`isSystemEntity` 改为类引用（或实例作用域注册表）比对，或既有库路径跳过前增加冲突显式报错；补双实例撞名用例。
- **降级理由（P1 → P2）+ 未处理原因**：机制属实，但触发要同时满足三件事：同一进程内两个实例、其中一个 `use()` 过插件、另一个的用户实体**精确撞上** `rxdb:Commit` 这类保留身份（`namespace` 显式写成 `'rxdb'`，默认是 `public`）。这是用户主动占用本库保留命名空间的结果，不是日常路径。修法要动核心注册表的身份口径，属 `packages/rxdb` 公开面变更。

### [P2] ⬇ 降级 — StaleActiveBranchError 的 expected token 用当前分支 id 伪造（原报 P1）

- **证据**：[switch-branch-options.ts:93-99](../../packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L93) 构造 `{branchId: token.branchId, activationRevision: expectedActivationRevision}`；类契约（[write-entry.ts:346-347](../../packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L346)）定义 `expected` 为「调用方捕获的 token」，同仓其余调用点传完整捕获值。
- **触发与影响**：调用方捕获 `{branchId:A, activationRevision:3}`，另一 realm 切到 B（revision 7），调用方再带旧凭据操作 → 错误 `expected={branchId:B, activationRevision:3}`，消息「写入时持有 B@3，库里现在是 B@7」——一个从未存在过的 token，误导按 `expected.branchId` 定位问题的跨 realm 消费者。spec 只覆盖同分支场景。
- **修复建议**：expected 用调用方完整捕获值（branchId 为调用时所在分支）；补跨分支后旧凭据被拒的用例断言错误字段。
- **降级理由（P1 → P2）+ 未处理原因**：**拒绝本身是对的**——旧凭据该被拒，也确实被拒了，没有任何写入穿过去；坏的只有错误对象里 `expected.branchId` 这一格，属诊断质量而非正确性。**诚实的修法拿不到需要的输入**：这一格要填的是「调用方发起时所在的分支」，而公开入口 [`RxDBBranchSwitchPreconditions`](../../packages/rxdb/src/rxdb-plugin-system.ts#L107) 刻意只携带 `{requireClean, expectedActivationRevision}` 两个字段，且被一条「不多不少就这两个字段」的类型级断言钉住。要么扩这个公开形状，要么让 `expected` 变成可选——都不是就地能改的。
  **2026-09-24 更新**：原本挡着它的那一问（跨 realm 是否在威胁模型内）已由 [`threat-model.md`](../../specs/001-working-tree-commits/threat-model.md) §6 定为**在模型内**，D-1 的传播通道也已落地。于是这一条不再有前置决策可等，剩下的纯是「要不要为一格诊断字段扩 `RxDBBranchSwitchPreconditions`」——归 `next-0912-branch-review.md` §4.2 决策 1（core 公开面边界）。

## 3. 顺延项排期（⏸ Deferred —— 架构级，需单独排期）

原 3 条里两条已落地（跨 realm 能力传播走 `CAPABILITY_ENABLED_EVENT` + 网关广播；切换前置条件随 `prepare` 回调进最终事务），第 2 条也只剩后两截：

1. **首次物化流水线整条没接线**：`commitBranchMaterialization`（远端分支首次物化未接公开入口）与 `markBranchCorrupted`（检测到损坏不落盘隔离标记）仍是「函数写好了但生产代码没有调用点」——`bumpActivationRevision` 那一截已随切换事务落地。排期口径以 `next-0912-branch-review.md` §4.1 第 1 组为准（那边连 staging 续传与分页指纹一共四条，同属这一条流水线）。

另有一条本轮复核**新发现**但**这一侧修不了**的：**`normalizeCreateEntity` 的平行数组下标配对**（pglite [`pglite.utils.ts:479-497`](../../packages/rxdb-adapter-pglite/src/pglite.utils.ts#L479) + sqlite-core [`sqlite-core.utils.ts:482-503`](../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L482)，两份逐字相同）。它是已修的 `normalizeUpdateEntity` 分歧在 INSERT 侧的镜像，同一个缺陷形态——但核心里根本没有 `normalizeCreateEntity` 可指（只在 `entity.utils.ts:171` 的注释里被提到）。要先往 `@aiao/rxdb` 补一份 keyed 实现再让两个适配器改指，是新增核心公开导出，须与 `next-0912-branch-review.md` §4.2 第 2 条（core ↔ plugin 公开面边界）一起决策。

## 4. 尚未排期

- [ ] §2 里两条卡在核心公开面决策上的 P2（系统实体 namespace 身份口径、StaleActiveBranchError 诊断字段）——同归 `next-0912-branch-review.md` §4.2 决策 1
- [ ] §3 那条流水线落地后，本报告与 `next-0912-branch-review.md` 一并归档
