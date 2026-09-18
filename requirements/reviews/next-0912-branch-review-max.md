# next-0912 分支对 main 评审（max 独立复核轮）

- **评审日期**：2026-09-18（独立于同日「复核」的完整 max 评审）
- **评审分支**：`next-0912`
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`
- **变更规模**：427 个文件，`+61,111 / -2,904`
- **评审强度**：max（9 个分区 finder 全角度扫描 → 44 条候选 → 每条独立对抗式验证 → 1 轮 sweep 查漏）
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **本轮复核**：2026-09-18（同基准 `de70a1a9` → `9e5ddc92`，工作区无新提交）。逐条复核 + 按裁决落地修复，本文件按结果就地改写：证伪项移入 §4、已修项标 Resolved、架构项标 Deferred。
- **结论（复核后）**：🟡 **可合并性取决于 D 档排期**。原报 2 条 P0 中 **1 条证伪**（CTE 别名，见 §4），另 1 条已修；8 条 P1 中 **4 条高估、降为 P2**，2 条已修，2 条顺延；5 条 P2 中 3 条已修、1 条顺延、1 条未处理。§5 的 32 条里已修 11 条。**仍阻塞合并的是 6 条架构级顺延项**（§6），它们需要单独排期，不在本轮「确定项 + 测试 + 文档」范围内。
- **原结论（2026-09-18 首轮，存档）**：🔴 **不建议合并**。本轮新确认 **2 条 P0、8 条 P1、5 条 P2**（Top 15），另有 32 条已验证发现因报告上限未进 Top 榜，其中一条与上一轮 [P1] 独立复现。全部 15 条 Top 榜均为独立验证后的 CONFIRMED，2 条候选被证伪剔除。

## 评审基准（SHA）

| 角色             | SHA                                        | 说明                                               |
| ---------------- | ------------------------------------------ | -------------------------------------------------- |
| `main` 顶端      | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | commit `feat(aiao): 拆分 rxdb 功能为 plugin (#61)` |
| `next-0912` HEAD | `9e5ddc92cdca4c781d991a4332ef9a81aab7cf0b` | 2026-09-18 评审时 HEAD                             |
| merge-base       | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | 与 main 顶端相同，无分叉                           |

- 评审开始时工作区 clean；本报告文件本身不计入变更统计。

## 1. 范围与方法

- **范围**：`git diff main...HEAD` 全部 427 个文件。核心区域：`packages/rxdb-plugin-working-tree`（~15K 行源码 + 3.3K 行套件）、三框架绑定（angular/react/vue）、`packages/rxdb` 的 capture / trusted-write / plugin-system 基础设施、6 个适配器集成、`rxdb-plugin-history`、`scripts/audit` 五个脚本、benchmarks、三个 demo app 及其 e2e、specs/website 契约与文档。
- **方法**：9 个并行 finder 按分区扫描全部角度（逐行、删除行为审计、跨文件调用追踪、语言陷阱、包装器正确性、复用/简化/效率/altitude/规范），产出 44 条候选；每条候选由**独立验证 agent 对抗式验证**（能实测的全部实测复现，例如 SQL 判定用 node 直接跑出结果）；随后一轮全新视角 sweep 补查 5 条新候选并同样独立验证。终局：**46 CONFIRMED + 1 PLAUSIBLE + 2 REFUTED**。
- **验证方式说明**：本报告条目以静态跨文件追踪 + 局部实测为准；未跑全量 `pnpm test-all` 或 E2E。
- **上限说明**：报告 Top 榜上限 15 条，correctness 优先；其余 32 条已验证发现见 §5。

## 2. Top 15 发现（按严重度）

> **复核标记说明**：`✅ Resolved` = 本轮已修并有测试钉住；`⏸ Deferred` = 判定成立但属架构级，单独排期（§6）；`⬇ 降级` = 原严重度高估，附降级理由；`❌ 证伪` = 前提不成立，已移入 §4。

### [P0] ✅ Resolved — raw 写判定先剥注释后掩字面量，字符串字面量可隐藏被跟踪列

- **证据**：[raw-write-judgment.ts:222-224](../../packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L222) 的 `normalizeSql` 先 `replace(COMMENT_PATTERN, ' ')` 再 `replace(STRING_LITERAL_PATTERN, ...)`。实测 `UPDATE post SET remoteId = 'a -- ', title = 'x'` 归一化为 `"update post set remoteid = 'a  "`——`-- ` 后的第二个赋值整段被当作注释吞掉，判定只见 `['remoteid']`。
- **触发与影响**：`remoteId` 未跟踪而 `title` 已跟踪时，判定走第 5 步 `untracked_only` 放行，适配器执行原始 SQL 写入 `title`——无工作树单元、无变更日志，cold-replay 永久分叉。批处理形式（注释符后跟第二句）整条第二语句被吞。反向误拒同样存在：合法写入的字符串值含 `--` 或 `/*` 会被过拒。插件无任何 RAISE/ABORT/触发器兜底，两个适配器 `rawQuery` 只包 `gateRawWrite`。
- **修复建议**：把掩码顺序反过来（先掩字面量、再剥注释），或对注释符做引号感知的状态机扫描；补充「字符串字面量内含注释符」的判定用例（当前 spec 的注释用例只覆盖未闭合注释与 CWE-1333）。
- **本轮处理（✅ Resolved）**：**「把顺序反过来」这条建议是错的** —— 先掩字面量的话，`-- don't` 里的撇号会开出一个假字面量，同一个洞换个方向再开一次。落地的是第二条：`normalizeSql` 重写成**单趟、左到右、引号感知**的扫描器（`DELIMITER_PATTERN` + `lexemeAt`/`lineCommentEnd`/`blockCommentEnd`/`stringLiteralEnd`/`quotedIdentifierLexeme`），注释与字面量在同一趟里谁先出现谁先吃，三种引号标识符也并进同一趟（`"a'b"` 不再开假字面量）。`COMMENT_PATTERN` / `STRING_LITERAL_PATTERN` / `QUOTED_IDENTIFIER_PATTERN` 三个正则随之删除，改用 `indexOf` 推进（天然 O(n)，CWE-1333 防护不再依赖正则形状）。红测试两条（字面量里的 `/*` 不开注释、注释里的撇号不开字面量）先红后绿；既有的三条约束（十万次 `a/*` 毫秒量级、未闭合 `/*` 吃到串尾、闭合 `/* */` 只吃到 `*/`）仍绿。

### [P1] ⏸ Deferred — 调用方事务内 mergeChanges 被双重捕获

- **证据**：[capture-hook.ts:342-343](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L342) 挂载点 1 的 watermark 后扫对同一批 change 行二次捕获；`CAPTURE_OWNED_TRANSACTION` 只保护运行时自开事务。而 [merge-branch.ts:118-139](../../packages/rxdb-plugin-history/src/merge-branch.ts#L118) 的 `'normal'` 策略在调用方开启的事务里调 `executor.mergeChanges(singleActions, undefined, false)`。
- **触发与影响**：挂载点 2 捕获一次（entrance `domain_recompute`），挂载点 1 再捕获一次（entrance 覆写为 `'crud'`、origin 翻成 `CAPTURE_LOCAL`）——每次合并变更 `workingTreeRevision` +2（「一次合并推两格」，文件自身文档视为设计破坏），unitId/transactionId 被第二遍覆写；未来 remote 入口的受信调用会被误标为本地编辑，discard 会撤销远程同步。所有嵌套合并测试都恰好用 `disableTriggers: true` 绕过了此路径。
- **修复建议**：把「本次事务内的变更已由内层挂载点消费」的信息沿事务上下文传递（不依赖运行时自开标记），或用 watermark 排除内层已写入的修订号；补 `merge_branch('normal')` 端到端用例断言 revision 只 +1。
- **本轮处理（⏸ Deferred，D-3）**：判定复核成立，本轮不实现。修法要么给事务上下文加一条「本事务的变更已被内层消费」的传递位，要么改 watermark 的语义——两者都动捕获管线的契约面，不属本轮「确定项 + 测试 + 文档」范围。见 §6 顺延项。

### [P1] ⏸ Deferred — 跨 realm 能力启用后，旧连接写入静默绕过捕获（与上一轮 [P1] 独立复现）

- **证据**：[rxdb-adapter.ts:182-189](../../packages/rxdb/src/rxdb-adapter.ts#L182) 的能力位以「适配器实例是否挂了捕获钩子」代理且 **fail-open**；[plugin.ts:105-117](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读一次能力位，[working-tree-facade.ts:155-165](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L155) 的 `enable()` 只给发起调用的 adapter 装钩子。全仓无 BroadcastChannel / storage 事件 / 重连传播。
- **触发与影响**：Tab A、B 在能力未启用时连上同一库；A `enable()`；B 继续 `save()` / `rawQuery`——无捕获、无 stale-token 校验、无报错，B 的编辑不进工作树，随后 B 的 `commit()` 提不到这些编辑（或报 `empty_commit`）。`status()` 从库读能力位仍报告已启用，与 FR-037「已启用库上的 writer 必须被拒」相反。本轮新增证据：[entity-manager.ts:547-550](../../packages/rxdb/src/entity/entity-manager.ts#L547) 的 `notifyExternalUpdate` 同样 fail-open 绕过 `gateExternalNotify`。对应场景无任何测试。
- **修复建议**：能力状态跨连接变化时（storage 事件或轮询能力位），在旧连接下一次写之前装钩子或拒绝写入（fail-closed）；补两个真实适配器实例共享持久库的回归用例。
- **本轮处理（⏸ Deferred，D-1）**：判定复核成立，是六条顺延项里**最该先排的一条**——两份报告独立复现，且违反 FR-037。修法要引入跨连接的能力变更传播通道（BroadcastChannel / storage 事件 / 轮询），这是新的运行时机制，不是改一处判断。见 §6 顺延项。

### [P2] ⬇ 降级 + ✅ Resolved — 丢失 changeSet 行被误报为指纹不匹配，成因区分失效（原报 P1）

- **证据**：[change-unit.ts:262](../../packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L262) 指纹恒含 `u${units.length}:` 前缀；[commit-graph-guard.ts:121-124](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L121) 先比指纹、后比行数。
- **触发与影响**：N 行 changeSet 丢一行后，N-1 行重算的指纹不可能等于存储值，先抛 `fingerprint_mismatch`；`change_set_count_mismatch` 分支对其宣称的成因（丢行）**永远不可达**，仅单独篡改 `changeSetCount` 列时可达。文档（102-103 行）承诺的「行数少一行时指纹对得上、可区分两个成因」不成立，用户按内容篡改方向误排查。
- **修复建议**：指纹不含行数（单独存行数并先行比较），或先比对 `changeSetCount` 再比指纹；补「删一行 changeSet」用例断言抛 `change_set_count_mismatch`。
- **降级理由（P1 → P2）**：机制属实，但**结论不受影响**——两条分支都判「这个提交坏了」，都拒绝继续，都不会放一份损坏的历史过去。失效的只是**成因细分**（用户按内容篡改方向排查而实际是丢行），属诊断质量而非正确性。原报把它排进 P1 是高估。
- **本轮处理（✅ Resolved，A5）**：采纳第二条建议——`assertCommitIntact` 先比 `changeSetCount` 再比 `fingerprint`。**没有**改指纹定义：`u${units.length}:` 前缀是内容指纹的一部分，动它要重刷已落库的不可变历史。同时改写了那段虚假 TSDoc（原文称「行数少一行时指纹仍然对得上」，而指纹恒含行数，这个前提从来不成立）。红测试：删一行 changeSet，断言成因是 `change_set_count_mismatch` 而非 `fingerprint_mismatch`。

### [P2] ⬇ 降级 + ✅ Resolved（改文档）— 同分支 switchBranch 跳过前置条件与 SC-013 损坏守卫（原报 P1）

- **证据**：[VersionManager.ts:279-287](../../packages/rxdb-plugin-history/src/VersionManager.ts#L279) 的同分支提前 `return` 在 `#assert_branch_switchable` 之前且不看 `preconditions`；该守卫文档（474 行）称「无条件跑，不只在带了选项时跑」。
- **触发与影响**：脏树上 `switchBranch(当前分支, {requireClean: true})` 静默返回成功；当前分支提交图损坏时切自己返回成功，切任何其他分支才抛 `commit_graph_corrupted`——调用方显式提出的前置条件被静默忽略，行为不一致。无测试覆盖「同分支 + 前置条件」组合。
- **修复建议**：把同分支早退移到守卫之后（或保留早退但先跑校验）；补同分支带 `requireClean` 与损坏图两个用例。
- **降级理由（P1 → P2）+ 行为判定为正确**：**这条的修复建议方向是反的**。A→A 的调用不发生切换——分支没换、目标分支的历史没被重放、工作树一行都不动，没有要防的东西。把早退去掉好让守卫「真的无条件」反而制造新问题：切到当前分支会因为它自己的历史损坏而失败，而这次切换本来什么都不做。`requireClean` 在 A→A 上静默成功同样是对的：前置条件的语义是「切换发生前工作树必须干净」，而切换没有发生。真正的缺陷只有一条 —— **守卫的 TSDoc 说了假话**（称「无条件跑」），属文档漂移。
- **本轮处理（✅ Resolved，C6）**：**改文档不改代码**。`#assert_branch_switchable` 的 @remarks 改成「每一次**真正发生**的切换上都跑，与调用方提没提条件无关」，并写明 A→A 在 `switchBranch` 上方就早返回了、以及为什么不该把早返回去掉。

### [P2] ⬇ 降级 — 系统实体注册表跨实例按 namespace:name 吞掉用户建表（原报 P1）

- **证据**：[system-entities.ts:51-54](../../packages/rxdb/src/system/system-entities.ts#L51) 的 `isSystemEntity` 按 `namespace:name` 在模块级 `SYSTEM_ENTITY_IDENTITIES` 比对（跨实例共享）；[RxDB.ts:1764](../../packages/rxdb/src/RxDB.ts#L1764) 既有库路径 `#ensureEntityTables` 据此 `continue` 跳过建表。新库路径（972 行附近）无此过滤。
- **触发与影响**：同一进程内实例 A `use()` 过插件（注册 `rxdb:Commit`），实例 B 的用户实体若撞名（`@Entity({namespace:'rxdb', name:'Commit'})`，namespace 未校验、默认 `public`）在既有库上被静默跳过建表，首次仓库查询报 `no such table` 且错误不指向实体注册；实例级的 class 引用检查（SchemaManager）不会拦。
- **修复建议**：`isSystemEntity` 改为类引用（或实例作用域注册表）比对，或既有库路径跳过前增加冲突显式报错；补双实例撞名用例。
- **降级理由（P1 → P2）+ 本轮未处理**：机制属实，但触发要同时满足三件事：同一进程内两个实例、其中一个 `use()` 过插件、另一个的用户实体**精确撞上** `rxdb:Commit` 这类保留身份（`namespace` 显式写成 `'rxdb'`，默认是 `public`）。这是用户主动占用本库保留命名空间的结果，不是日常路径。修法（`isSystemEntity` 改类引用比对）要动核心注册表的身份口径，本轮范围外。

### [P1] ✅ Resolved — PGlite 与 sqlite-core 的空更新闸门用不同归一化器，行为分裂

- **证据**：[pglite switch-result.utils.ts:126-127](../../packages/rxdb-adapter-pglite/src/version/switch-result.utils.ts#L126) 用本地 `normalizeEntity`（外键循环无 readonly 检查，[pglite.utils.ts:515-520](../../packages/rxdb-adapter-pglite/src/pglite.utils.ts#L515)）；[sqlite-core switch-result.utils.ts:124-125](../../packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L124) 用核心 `normalizeUpdateEntity`（readonly 外键显式 `continue` 过滤，[entity.utils.ts:265](../../packages/rxdb/src/entity/entity.utils.ts#L265)）。
- **触发与影响**：switch/merge 更新 patch 只含 readonly 外键关系字段（如 `{reviewerId: 'x'}`）：sqlite 归一化后 `{}` → 跳过整行；pglite 归一化出 `{reviewer_id: 'x'}` → 发出 UPDATE 并触发变更日志——闸门要防止的「空写」恰在 PGlite 侧发生，与闸门自身注释要求的双端一致相反。核心 spec「使用物理列名并过滤 readonly 外键」已钉死该分歧。
- **修复建议**：pglite 侧改调核心 `normalizeUpdateEntity`（或补同样的 readonly 过滤）；补双后端对同一 patch 的对称用例。
- **本轮处理（✅ Resolved，A2）**：采纳第一条——删掉 pglite 的本地 `normalizeEntity`，改成 `export { normalizeUpdateEntity } from '@aiao/rxdb';`，与 sqlite-core 的做法逐字对齐（六个适配器里只剩它是分裂的）。顺带修掉本地实现的第二个缺陷：它用 `foreignKeyNames` / `foreignKeyColumnNames` 两个**平行数组按下标配对**还带 `|| []` 兜底，核心版走 keyed 的 `foreignKeyRelationMap`；核心版的注释逐字写明了两数组长度不等时「会把值写进相邻的列，且完全无声」。三个调用点与 spec 一并改指核心实现。

### [P2] ⬇ 降级 — StaleActiveBranchError 的 expected token 用当前分支 id 伪造（原报 P1）

- **证据**：[switch-branch-options.ts:95](../../packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L95) 构造 `{branchId: token.branchId, activationRevision: expectedActivationRevision}`；类契约（[write-entry.ts:346-347](../../packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L346)）定义 `expected` 为「调用方捕获的 token」，同仓其余调用点传完整捕获值。
- **触发与影响**：调用方捕获 `{branchId:A, activationRevision:3}`，另一 realm 切到 B（revision 7），调用方再带旧凭据操作 → 错误 `expected={branchId:B, activationRevision:3}`，消息「写入时持有 B@3，库里现在是 B@7」——一个从未存在过的 token，误导按 `expected.branchId` 定位问题的跨 realm 消费者。spec 只覆盖同分支场景。
- **修复建议**：expected 用调用方完整捕获值（branchId 为调用时所在分支）；补跨分支后旧凭据被拒的用例断言错误字段。
- **降级理由（P1 → P2）+ 本轮未处理**：**拒绝本身是对的**——旧凭据该被拒，也确实被拒了，没有任何写入穿过去。坏的只有错误对象里 `expected.branchId` 这一格的取值，影响面是「按该字段定位问题的跨 realm 消费者读到一个从未存在过的 token」。属诊断质量而非正确性，原报排 P1 是高估。修法本身不大，但要连带调整 `expected` 的语义契约与跨 realm 用例，与 D-1 同一场景，建议并入那次排期。

### [P1] ⏸ Deferred — diff 分页把同一事务切成两个半组

- **证据**：[diff.ts:242-251](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L242) 先 `readEntryPage`（`rows.slice(0, limit)`，185 行）后 `groupByTransaction`。实测 limit=2、3 条目事务 → 页 1 `{e1,e2}`、页 2 `{e3}`，两组同 `transactionId`。
- **触发与影响**：类型设计上组 = 一个原子事务（null 事务每条目一组正是为此）；消费者按组整体渲染或按 `transactionId` 去重会得到两个幻影事务或静默丢半组条目。分页 + 事务粒度组合无测试、无 TSDoc/契约允许切分，也没有任何调用方合并页。
- **修复建议**：分页边界改为按事务边界对齐（取整组后再截断页），或对跨页事务做延续标记并在文档中约定；补组合用例。
- **本轮处理（⏸ Deferred，D-5）**：判定复核成立，本轮不实现。两条修法都要改**分页游标的语义**（按事务边界对齐要允许页大小浮动；延续标记要在 `WorkingTreeDiff` 上加字段并写进已冻结的契约 §3），属公开面变更。见 §6 顺延项。

### [P2] raw 判定第 2 步受信 intent 豁免没有生产通道

- **证据**：[capture-hook.ts:460](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L460) 是唯一生产构造点，传 `{capabilityEnabled, domain}` 无 `intent`；核心 [raw-write-gate.ts:45-56](../../packages/rxdb/src/capture/raw-write-gate.ts#L45) 的 `RawWriteContext`/`RawWriteGate` 签名均无 intent 槽位；9 个 `TRUSTED_CALLSITE_REGISTRY` 条目全是 `switchBranch`/`mergeChanges`，无 raw 调用点。`intent` 只在测试（capture.suite.ts:1060）被填充。
- **触发与影响**：契约（epic-006 与 adapter-contract.md §2）规定「调用携带内部受信 intent → 放行」，但生产没有任何通道能声明它；未来新增内部受信 raw 写路径会被第 4 步确定性拒绝——契约-接线缺口。
- **修复建议**：给 `RawWriteGate`/`RawWriteContext` 增加 intent 传递槽位并接入受信声明通道，或从契约中删除该豁免条款；补生产通道用例。
- **本轮未处理**：判定复核成立（前瞻性缺口，当前无生产 raw 受信调用点因此无实际泄漏）。两条修法是**互斥的方向决策**——加槽位是扩公开面，删条款是缩契约——需要先定「未来是否会有内部受信 raw 写路径」。本轮不做这个决策。

### [P2] ⏸ Deferred — bench-working-tree 相对门禁未接入 CI

- **证据**：[benchmarks/project.json:51](../../benchmarks/project.json#L51) 定义 target，但唯一基准 job（[ci-template.yml:1020](../../.github/workflows/ci-template.yml#L1020)）只跑 `benchmarks:search-ci`；全仓 workflows / scripts / package.json 无任何 `bench-working-tree` 调用。契约 [benchmark-report.md](../../specs/001-working-tree-commits/contracts/benchmark-report.md) §3.1 与 tasks.md T097（标完成）均声称它是「普通 PR CI 的唯一硬门禁」。
- **触发与影响**：PR 改动落在 packages/ 或 benchmarks/（`need_benchmark=true`）时工作树测点（status/diff/commit/restore）出现相对回归会静默合入；T132 仍为手工。顺带：当前冻结 reference 缺 restore 键，该门禁在 HEAD 上即使手动跑也必然红（详见 §5 C04）。
- **修复建议**：把 `bench-working-tree` 挂进基准 job（或恢复 CI 前先完成 T132 的 reference 重冻结），并让契约 §3.1 与实际接线一致。
- **本轮处理（⏸ Deferred，D-6）+ 一处事实更正**：接线确实缺失，**但现在接进去就是稳定假红**——`benchmarks/reports/working-tree-reference.json` 的 `regeneratedBecause` 自己写着「T109 新增 restore 测点；本轮为带机器负载的初版基线，**待静默后复冻**」，十轮 ±19%、旧上限下 6/10 超限。因此这条**阻塞在 T132 的 reference 重冻结**，不是漏做。本轮也因此没有跑这个门禁——基线未复冻时它的红绿没有判读价值。
- **事实更正**：本条末句「当前冻结 reference 缺 restore 键，该门禁在 HEAD 上即使手动跑也必然红」**已过期**。实测 `medianRatios` 的键是 `["status","diff","restore","commit"]`，restore 在；契约 §3.1 的样例也带该键。§5.1 对应那条同步标 Stale。

### [P2] ✅ Resolved — 受信调用 drift 闸门对可选链/非空断言/下标调用全盲

- **证据**：[working-tree-callsite-drift.mjs:284](../../scripts/audit/working-tree-callsite-drift.mjs#L284) 的 `CALL_PATTERN` 要求接收者与方法之间是裸点号。实测 `adapter?.switchBranch()`、`adapter!.mergeChanges()`、`adapter['switchBranch']()` 全部零命中；eslint 关闭了 `no-non-null-assertion`，spec 未覆盖这三种形式。
- **触发与影响**：核心/插件代码用这三种形式调用受信原语时，调用永不与 `TRUSTED_CALLSITE_REGISTRY` 比对，未登记受信调用静默通过审计（exit 0）——fail-dangerous 的登记表盲点，与文件自身「未登记即报出」教义相反；当前无此类调用属侥幸。
- **修复建议**：扩展模式覆盖 `?.` / `!.` / 下标形式（或改用 TS AST 解析）；spec 补三种形式用例。
- **本轮处理（✅ Resolved，A8）**：采纳第一条（词法层扩展；改 AST 是 §4.4 的架构决策，与另一份报告的同类条目一起排）。`CALL_PATTERN` 的接收者链放宽到允许 `?.` / `!.`，末段方法名同时接受 `['name']` / `["name"]`；`findPrimitiveCalls` 改用偏移互换法定位，receiver 用 `matched[1].replace(/[\s?!]/g, '')` 归一。红测试三条（三种形态各一条未声明调用）先红后绿，全仓跑一遍闸门**无新增误报**。
- **性质说明**：当前仓库里这三种形态的受信写调用**一条都没有**（已全仓扫过），所以这是**前瞻性收紧**，不是在补一个正在漏的洞——闸门的意义正在于挡住还没写出来的那一行。

### [P2] ✅ Resolved — core-plugin 边界闸门把字符串字面量误扫为越界依赖

- **证据**：[core-plugin-boundary.mjs:72](../../scripts/audit/core-plugin-boundary.mjs#L72) 的 `findSpecifiers` 只清注释不清字符串（`blankStrings: false`，旁路 `blankStringLiterals` helper 从未应用）。实测纯字符串 `"use import('./working-tree/x.js') instead"` 被提取为越界说明符。
- **触发与影响**：核心文件新增任何含 `from './commit/…'` 或 `import('./working-tree/…')` 的字符串（如错误消息引路径），`pnpm audit:core-boundary` 报未登记越界、退出 1——纯文档改动红 CI 的潜在陷阱；当前通过只因尚无此类字符串，spec 只测注释不测字符串。
- **修复建议**：对源码先做字符串掩码（应用现成的 `blankStringLiterals`）再扫说明符；spec 补字符串字面量用例。
- **本轮处理（✅ Resolved，A7）+ 一处修法更正**：**「先掩码再扫说明符」这条建议直接做会失效**——说明符自己就是一个字符串字面量，掩掉字符串等于把它一起掩掉，结果是零命中而不是正确命中。落地的是 `working-tree-callsite-drift.mjs` 已经在用的**偏移互换法**：`scan()` 的两种输出等长，正则跑在 `stripComments(source)` 上，拿 `match.index` 去 `blankStringLiterals(source)` 的同一位看一眼——字符还在就是真代码，被涂成空白就说明整条躺在字面量里。
- **顺带（纯卫生）**：`SCAN_EXCLUDED_DIRS` 的匹配原先是「相对路径全等」，嵌套的 `plugin/__tests__` 落不进排除集。新增 `EXCLUDED_DIR_NAMES`（按目录名、任意深度）与之并存。**今天零影响**——那个目录里没有指向 `commit/` / `working-tree/` 的相对 import。

### [P2] ✅ Resolved — 冻结契约的 WorkingTreeStatus 与实现字段对不上

- **证据**：[core-api.md:71,79](../../specs/001-working-tree-commits/contracts/core-api.md#L71) 冻结 `headCommitId: string | null` 与 `branchStatus: 'ok' | 'corrupted_read_only'`；实现 [status.ts:49-76](../../packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L49) 实际是 `clean`/`restoring`/`activationRevision`，且全仓唯一 `WorkingTreeStatus` 就在该文件。契约第 5 行声明形状与语义为**规范性冻结**，specs/ 内无修正或 superseded 注记。
- **触发与影响**：按契约 §3 编写类型断言、消费者代码或对称性审计在发布包上编译失败；仓库自身 `requirements-consistency` 审计对这块形同虚设。同族的 `status$()` 声明未实现、CommitOptions 必填字段矛盾见 §5（C02/C03）。
- **修复建议**：以实现为准重冻结 §3（或实现补齐契约字段），并把 `status$`/CommitOptions 一并裁决后更新契约；让 requirements-consistency 覆盖 contracts/。
- **本轮处理（✅ Resolved，C1）**：取「**以实现为准重冻结契约**」方向，实现一行未动。实际偏差比本条列的两个字段大得多，§3/§4/§5 三块按实现整段改写：
  - 删 `status$()`（`WorkingTreeManager` 上根本没有，全仓只有 `plugin.ts` 一句假设性注释提过），并写明响应式那层由三框架绑定各自提供。
  - `WorkingTreeStatus` 按 `status.ts:49-76` 改成九个字段：删 `headCommitId` / `branchStatus`，补 `clean` / `restoring` / `activationRevision`，并注明三个 revision 字段恰好是 `commit()` / `discard()` / `restore()` 要求捕获的那三位、缺一不可。
  - `WorkingTreeDiff` 系列补齐 `granularity` / `transactionId` / `transactions` / `baseHeadCommitId`，`patch` / `inversePatch` 改成 `Record<string, unknown> | null`。
  - `CommitOptions` 整块重写：`extends WorkingTreeCredentials`，五个字段**全部必填**，`commit()` 的 `options` 从可选形参改成必填形参。
  - 本条未列到的两处一并改正：**文件头**（第 5 行原称冻结 `@aiao/rxdb` 的公开面，epic-006 拆包后已不成立，改成逐节标注导出位置）、**§5 的 `restore(target, options?)`**（实现是必填的 `options: WorkingTreeRestoreOptions`）。
  - **未做**：让 `requirements-consistency` 覆盖 `contracts/`——那是给审计脚本加能力，属架构项。

## 3. 与上一轮评审的关系

- **[P1] 跨 realm fail-open 为独立复现**：上一轮 2026-09-18 复核的 [P1]「已连接实例在另一实例启用后继续绕过捕获」与本轮 §2 第 4 条同机制；本轮新增证据（`notifyExternalUpdate` 同样 fail-open），两轮互证。
- **[P1] 丢失 changeSet 行误报** 与上一轮 [P2]「检测到提交图损坏后没有持久化隔离标记」同文件相邻，是不同缺陷：上一轮讲损坏后不落盘标记，本轮讲成因分支不可达。
- **上一轮的 4 P1 + 4 P2 不在本轮 Top 榜**（如切分支不推进 activation revision、首次物化未接公开入口、切换校验与写入分属两个事务、并发受信声明互相覆盖、staging 崩溃续传、分页指纹未验证）：两轮互补，未互相证伪；本轮未对它们逐条复验。
- 两轮合计：**上一轮 8 条 + 本轮 Top 15 条（其中 1 条互证）**，建议合并前统筹排期。
- **本轮复核补充**：上一轮那 4 P1 + 4 P2 已在本轮逐条复核，结论写在 `next-0912-branch-review.md` 里。两轮**去重后**真正阻塞合并的架构项是 6 条（§6），其余已修或降级。

## 4. 证伪项（REFUTED，勿再报）

| 候选                                                                              | 结论依据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| raw-bypass-judgment.spec.ts:538 的 500ms 墙钟断言 flaky                           | 实测线性路径 0.34–0.82ms，500ms 上限有 >600 倍余量（文档亦注明「留三个量级的余量」）；普通 CI 争用不足以触发。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **[原报 P0] CTE 别名 UPDATE/DELETE/INSERT 绕过版本表闸门**（2026-09-18 复核移入） | **前提不成立**。判定确实返回 `{kind:'allow', step:5, reason:'out_of_domain'}`，但**那条语句根本执行不了**：`WITH t AS (SELECT * FROM post) UPDATE t SET title = 'x'` 在 PGlite 上报 `relation "t" does not exist`，在 `node:sqlite` 上报 `no such table: t`；`DELETE FROM t` / `INSERT INTO t` 两种别名形态同样报错。原报的前提「PGlite 支持可更新单基表 CTE」不成立——CTE 名字不是可写目标，两个引擎都只把它当只读关系，且 UPDATE/DELETE 的目标名解析根本不看 WITH 列表。判定放行的是一条会被引擎自己拒绝的语句，没有写入穿过去。<br>**真正可执行的数据修改型 CTE**（`WITH x AS (UPDATE post … RETURNING *) SELECT …`）现有判定**拦得住**——目标表名 `post` 在语法位上是显式的。 |
| apps/dev-rxdb-react / vue 的 package.json 缺 working-tree 依赖登记                | 缺登记属实，但 nx 从 tsconfig references 推断静态边（`nx graph` 实测四条边齐全），`nx affected` 不受影响，vite 走 tsconfigPaths 到源码；降级为 hygiene 级，不计入。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 5. 其余已验证发现（超出 Top 15 上限，共 32 条 + 1 条 PLAUSIBLE）

### 5.1 契约 / 文档漂移（7 条 —— 本轮已修 6 条，1 条 Stale）

| 位置                                                                                                 | 摘要                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [core-api.md:62](../../specs/001-working-tree-commits/contracts/core-api.md#L62)                     | ✅ **Resolved（C1）** 契约声明 `status$(): Observable<WorkingTreeStatus>`，实现只有命令式 `status()`，src 内无任何 `status$`。已删，并写明响应式那层由三框架绑定各自提供。                                                                                                                                                                                                                                                                             |
| [core-api.md:118](../../specs/001-working-tree-commits/contracts/core-api.md#L118)                   | ✅ **Resolved（C1）** 契约 CommitOptions 全可选（`author?`、无 `expectedBranch`），实现必填 `authorId`/`operationId`/`expectedBranch`；`restore(target, options?)` 同样实现必填。§4 整块按实现重写（五字段全必填、`options` 改必填形参），§5 的 `restore` 签名一并改正。                                                                                                                                                                               |
| [benchmark-report.md:65](../../specs/001-working-tree-commits/contracts/benchmark-report.md#L65)     | ⚠️ **Stale（2026-09-18 复核证伪）** 原称冻结 reference 的 medianRatios 缺 `restore` 键。实测 `benchmarks/reports/working-tree-reference.json` 的键是 `["status","diff","restore","commit"]`，契约 §3.1 的样例也带该键——该条在当前 HEAD 上已不成立。（门禁未接 CI 是另一回事，见 §2 的 bench 条与 §6 D-6。）                                                                                                                                            |
| [conformance-suites.md:13](../../specs/001-working-tree-commits/contracts/conformance-suites.md#L13) | ✅ **Resolved（C2）** 契约称套件从 `packages/rxdb` 导出，实际在 `rxdb-plugin-working-tree/testing`；suite-callsites 门禁的 SUITE_ENTRY 也是后者。已改为 `./testing` 子路径导出，并补上共同导出的 `WORKING_TREE_CONFORMANCE_ENTITIES` / `WorkingTreeConformanceSuiteContext`。                                                                                                                                                                          |
| [tri-framework-api.md:23](../../specs/001-working-tree-commits/contracts/tri-framework-api.md#L23)   | ✅ **Resolved（C3）** 契约称 Angular 入口是 `WorkingTreeService` + `Signal<WorkingTreeStatus>`/`status$`，实际只有 `useWorkingTree()` 返回 `statusState: Signal<WorkingTreeQueryState<WorkingTreeStatus>>`。§1 表整段按三端实现重写；**同时改正本条未列到的一处**——契约原称类型「从 `@aiao/rxdb` 再导出」，实际三个框架包只导出 `useWorkingTree` + `WorkingTreeResource` 两个名字，类型一律从插件包直接 import（源码内有注释说明为什么不再导出一遍）。 |
| [working-tree-split.md:84](../../website/docs/migration/working-tree-split.md#L84)                   | ✅ **Resolved（C4）** 迁移文档称「七个状态字段」，实际 `WorkingTreeAsyncStates` 十个字段且绑定与 README 都写十。                                                                                                                                                                                                                                                                                                                                       |
| [compare.md:14](../../website/docs/getting-started/compare.md#L14)                                   | ✅ **Resolved（C5）** 称 restore 与工作树语义 switchBranch「尚在路线图上」，两者均已实现并有测试；collaboration/branch.md:175 同款过时。两处均已改写；**顺带发现第三处**——`branch.md` 的「## 分支合并（规划中）」连示例都是注释掉的，而 `mergeBranch()` 早已实现，已重写为真章节（`strategy` / `deleteSource` / 清空 undo-redo 历史 / 删源失败不回滚合并）。                                                                                           |

### 5.2 效率（4 条）

| 位置                                                                                                         | 摘要                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [restore-precheck.ts:264](../../packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L264) | 线性历史 N 次提交时预检约 3N 次顺序往返（两次 BFS 每层一查 + 每路径节点一查 changeSet），且全在调用方写事务内；可用 `in` 批量化（`loadCommitsByIds` 已有此模式）。 |
| [commit-graph-guard.ts:110](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L110)   | 每次 commit()/restore()/switch 对每个可达 commit 顺序一条 `=` 查询；commit 行已按层 `in` 批量化，changeSet 未批。                                                  |
| [capture-runtime.ts:349](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L349)   | 捕获热路径每变更 ~7-8 次查询（token 重验、entry 双读、状态行读+写），同事务内均可提升到批级。                                                                      |
| [rxdb-adapter.ts:185](../../packages/rxdb/src/rxdb-adapter.ts#L185)                                          | 启用态 getter 每次 rawQuery 分配新 context 对象 + gate 闭包；可像禁用态那样缓存单例。                                                                              |

### 5.3 重复 / 简化（7 条）

| 位置                                                                                                                                             | 摘要                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [list-commits.ts:137](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L137)                                                   | `nextFrontier` 与 [commit-graph-guard.ts:168](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L168) `nextParents` 逐字相同；改一处必漂移。                                       |
| [branch-commit-rows.ts:180](../../packages/rxdb-plugin-working-tree/src/commit/branch-commit-rows.ts#L180)                                       | `readBranchEntries` 与 [commit-command.ts:97](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L97) 逐字节相同；id-asc 顺序是内容指纹输入，漂移即指纹分叉。                     |
| [branch-materialization.ts:164](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L164)                         | `canonicalJson` 与 [capture-runtime.ts:79](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L79) `canonicalize` 输出等价可安全合并；文件注释「收敛口径各不相同」对本对不成立。 |
| [read_current_branch_id.ts:22](../../packages/rxdb-adapter-sqlite-core/src/version/read_current_branch_id.ts#L22)                                | sqlite-core 双份「读当前分支」实现（另一份 with_triggers_disabled.ts:42），通道/列索引/报错文案各异；docstring 引用的 `#readCurrentBranchId` 不存在；pglite 只有一份。                                    |
| [working-tree-restore-session.entity.ts:12](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-restore-session.entity.ts#L12) | 存储枚举 `'conflicted'` 全库无写入点（status 从修订号推导），死值引诱未来双真源。                                                                                                                         |
| 三份 use-working-tree spec（angular:175 / react / vue）                                                                                          | ~150 行夹具逐字三拷贝；核心 `./testing` 子路径正是共享测试支撑位，夹具可下沉。                                                                                                                            |
| [commit-error-codes.spec.ts:46](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-error-codes.spec.ts#L46)                     | 「互为全集」断言是同义反复（数组 = Object.values 同一对象）；同文件 25-37 行手写字面量才是真钉，此断言冗余。                                                                                              |

### 5.4 规范 / 清洁（4 条 —— 本轮全部已修）

| 位置                                                                                                                                                       | 摘要                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [working-tree-materialization-page.entity.ts:87](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-materialization-page.entity.ts#L87) | ✅ **Resolved（B5）** 关系字段 `stage` 未用 `declare`：es2025 + useDefineForClassFields 下每行实例自带 `stage: undefined` 幻影自有属性；四个兄弟实体都用了 `declare` 并有注释说明理由。       |
| [vue tsconfig.lib.json:26](../../packages/rxdb-plugin-working-tree-vue/tsconfig.lib.json#L26)                                                              | ✅ **Resolved（B4）** include 未排除 `src/__tests__/`，dts 插件把 setup-harness/rxdb-provider-harness 声明发进 dist（已实测存在），`files` 的否定只挡 src 不挡 dist；React/Angular 产物干净。 |
| [react use-working-tree.ts:2](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L2)                                                    | ✅ **Resolved（B6）** 头注释「九格」与同文件 20 行「十个」及核心类型矛盾（T123 加的 switchBranchState）。                                                                                     |
| [http errors.ts:9](../../packages/rxdb-adapter-http/src/errors.ts#L9)                                                                                      | ✅ **Resolved（B6）** doc 注释把 epic-006 码表登记在 `@aiao/rxdb` 的 `commit/commit-error-codes.ts`，实际在插件包，路径不存在。                                                               |

### 5.5 测试缺陷（9 条 —— 本轮已修 3 条）

| 位置                                                                                                                                              | 摘要                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [status.spec.ts:156](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/status.spec.ts#L156)                                      | ✅ **Resolved（B1）** CAS 失败断言 `restoring` 键误读 `status.conflicted`；实现若错误残留 restore 会话照样绿。                                                          |
| [commit.suite.ts:1555](../../packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts#L1555)                                    | discard 版本号断言拿 result 与事后重读比（同源）；删掉 +1 六后端全绿，仅 mock 场景钉住。                                                                                |
| [metadata-only-branch-switch.spec.ts:568](../../packages/rxdb-plugin-working-tree/src/__tests__/version/metadata-only-branch-switch.spec.ts#L568) | staging 不变性检查读种子期旧实例；removeMany+saveMany 换行后照样绿，其余兄弟检查都重读 probe。                                                                          |
| [storage-contract.spec.ts:43](../../packages/rxdb-plugin-working-tree/src/__tests__/system/storage-contract.spec.ts#L43)                          | ✅ **Resolved（B3）** 「不对 rxdb_change 建外键」闸门循环零次执行（foreignKeys 只来自实体显式选项，两个守卫实体都没声明）。改成对整个数组一次性断言，真长出外键时会红。 |
| [restore-encryption.spec.ts:389](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/restore-encryption.spec.ts#L389)              | ✅ **Resolved（B2）** 密文泄漏检查在未抛异常时真空通过（`thrown === null ? [] : ...`），且未断言确实抛错。先断言 `thrown` 非 null（这条用例的前提就是必抛），再查泄漏。 |
| [capability-enable.spec.ts:111](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/capability-enable.spec.ts#L111)                      | find mock 无视 where 参数恒返回种子行；读路径字段/操作符改错测试全绿，真后端才炸。                                                                                      |
| [react use-working-tree.ts:93](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L93)                                         | 「命令引用跨 render 稳定」契约（25-26 行文档）无任何测试钉住；丢掉 useMemo 全 spec 绿而消费者 effect 死循环。                                                           |
| [vue use-working-tree.spec.ts:207](../../packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts#L207)                       | mountWithProvider 丢弃 wrapper 且无 afterEach 卸载，~40 个组件挂满整个文件；React/Angular 两侧都有清理。                                                                |
| 三端 a11y spec（angular:183 / react / vue）                                                                                                       | 空 span `Number(''.trim())` 折成 0 并归档 0ms；面板初始渲染态恰为空 span，注释宣称的「读不出来直接红」只挡元素缺失。                                                    |

### 5.6 PLAUSIBLE（1 条）

| 位置                                                                                      | 摘要                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [capture-interceptor.ts:352](../../packages/rxdb/src/capture/capture-interceptor.ts#L352) | uninstall 的 SAVED-miss 兜底把 install 期 bound 原语焊成自有属性，破坏 this 多态后 mergeChanges 自锁死等；机制真实但仓库内唯一调用方保证先 install 后 uninstall，风险仅外部直调/双副本场景。 |

## 6. 解决记录

### 6.1 本轮（2026-09-18 复核）已处理

| 条目                                    | 处置                                                                                                       |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| [P0] raw 写判定先剥注释后掩字面量       | ✅ Resolved（A1）——`normalizeSql` 重写为单趟引号感知扫描器；**原修复建议「反转顺序」被判定为错的**，见该条 |
| [P0] CTE 别名绕过版本表闸门             | ❌ 证伪，移入 §4。两个引擎都拒绝执行那条语句，前提不成立                                                   |
| [P1] PGlite 与 sqlite-core 归一化器分裂 | ✅ Resolved（A2）——pglite 改调核心 `normalizeUpdateEntity`，顺带消掉平行数组下标配对                       |
| [P1] 丢失 changeSet 行被误报            | ⬇ P2 + ✅ Resolved（A5）——换序 + 改写虚假 TSDoc                                                            |
| [P1] 同分支 switchBranch 跳过守卫       | ⬇ P2 + ✅ Resolved（C6）——**行为正确，改文档不改代码**；原修复建议方向是反的                               |
| [P1] 系统实体 namespace 冲突            | ⬇ P2，本轮未处理（触发要用户主动占用保留命名空间）                                                         |
| [P1] StaleActiveBranchError 伪造 token  | ⬇ P2，本轮未处理（拒绝本身是对的，坏的只有诊断字段）；建议并入 D-1 排期                                    |
| [P2] 受信调用 drift 闸门三种形态全盲    | ✅ Resolved（A8）——前瞻性收紧，当前仓库无此类调用                                                          |
| [P2] core-plugin 边界闸门误扫字符串     | ✅ Resolved（A7）——偏移互换法；**原修复建议直接做会零命中**                                                |
| [P2] 冻结契约 WorkingTreeStatus 对不上  | ✅ Resolved（C1）——以实现为准重冻结 §3/§4/§5，实现一行未动                                                 |
| [P2] raw 判定第 2 步受信 intent 豁免    | 本轮未处理——两条修法互斥，要先定方向                                                                       |
| §5.1 契约/文档漂移 7 条                 | ✅ 已修 6（C1–C5），1 条标 Stale（bench reference 的 restore 键实际存在）                                  |
| §5.4 规范/清洁 4 条                     | ✅ 全部 Resolved（B4/B5/B6）                                                                               |
| §5.5 测试缺陷 9 条                      | ✅ 已修 3（B1/B2/B3），其余 6 条未处理                                                                     |

另有两条本报告**未列到、复核时新发现**的实现/文档偏差一并修掉：`read_current_branch_id.ts` 的 `?? 'id'` / `?? 'activated'` 列名兜底（违反「无 fallback 兜底」铁律，改为抛错）、三框架 hook 不校验 `workingTree` 存在性（未装插件时首个命令抛裸 TypeError，改为创建期抛带包名的 `RxDBError`）。两条都在另一份报告 `next-0912-branch-review.md` §3 里，处置记在那边。

### 6.2 顺延项（⏸ Deferred —— 架构级，需单独排期）

这 6 条是**当前真正阻塞合并的全部内容**，按建议优先级排：

1. **跨 realm 能力启用后旧连接静默绕过捕获**（§2）——两份报告独立复现，违反 FR-037，最该先排。要新增跨连接的能力变更传播通道。
2. **三个未接线的失效保护**：`bumpActivationRevision`（普通切换不推进 activation revision，A→B→A 可重用旧凭据）/ `commitBranchMaterialization`（远端分支首次物化未接公开入口）/ `markBranchCorrupted`（检测到损坏不落盘隔离标记）——三者都是「函数写好了但生产代码没有调用点」。详见 `next-0912-branch-review.md`。
3. **`merge_branch('normal')` 路径双重捕获**（§2）——要改事务上下文的传递位或 watermark 语义。
4. **切换前置条件与最终写入分属两个事务**——详见 `next-0912-branch-review.md`。
5. **diff 分页把同一事务切成两个半组**（§2）——两条修法都要改分页游标的公开语义。
6. **`bench-working-tree` 接 CI**（§2）——**明确阻塞在 T132**：当前 reference 自己标着「待静默后复冻」，十轮 ±19%、旧上限下 6/10 超限，现在接进去是稳定假红。

第 7 条是本轮复核**新发现**的：**`normalizeCreateEntity` 的平行数组下标配对**（pglite `pglite.utils.ts:479` + sqlite-core `sqlite-core.utils.ts:482`，两份逐字相同）。它是 §2 那条已修的 `normalizeUpdateEntity` 分歧在 INSERT 侧的镜像，同一个缺陷形态——但**这一侧修不了**：核心里根本没有 `normalizeCreateEntity` 可指（只在 `entity.utils.ts:171` 的注释里被提到）。要先往 `@aiao/rxdb` 补一份 keyed 实现再让两个适配器改指，是新增核心公开导出。详见 `next-0912-branch-review.md` §4.1。

第 8 条相关但更小：**时钟口径统一**（`corruptedAt` / `enabledAt` 用客户端时钟）。本轮判定为**改不了**——`CURRENT_TIMESTAMP` 在 SQLite 上求值成 `'YYYY-MM-DD HH:MM:SS'`，与本仓日期列的 ISO 存储形态对不上，而仓储层没有写 SQL 表达式的口子。本轮只在两处补了说明边界的 TSDoc（见 `next-0912-branch-review.md` §3）；统一要先给仓储层加能力。

### 6.3 尚未排期

- [ ] §5.2 效率 4 条、§5.3 重复/简化 7 条、§5.5 剩余测试缺陷 6 条、§5.6 PLAUSIBLE 1 条
- [ ] §2 里标「本轮未处理」的 3 条 P2（系统实体 namespace、StaleActiveBranchError 诊断字段、raw intent 豁免方向决策）
- [ ] D 档 6 条全部落地后，本报告与 `next-0912-branch-review.md` 一并归档（`status: Resolved`）
