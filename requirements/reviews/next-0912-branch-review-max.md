# next-0912 分支对 main 评审（max 独立复核轮）

- **评审日期**：2026-09-18（独立于同日「复核」的完整 max 评审）
- **评审分支**：`next-0912`
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`
- **变更规模**：427 个文件，`+61,111 / -2,904`
- **评审强度**：max（9 个分区 finder 全角度扫描 → 44 条候选 → 每条独立对抗式验证 → 1 轮 sweep 查漏）
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **本轮复核**：2026-09-18（同基准 `de70a1a9` → `9e5ddc92`）。逐条复核 + 按裁决落地修复；已修条目按本目录「只留尚未处理的条目」约定从报告删除（修法与判据写在代码注释与 TSDoc 里），证伪项留档于 §4、架构项标 Deferred。
- **结论（复核后）**：🟡 **可合并性取决于 D 档排期**。仍阻塞合并的是 **6 条架构级顺延项**（§6.1）；另有 §2 的三条未处理 P2 与 §5 的未处理发现。它们需要单独排期，不在「确定项 + 测试 + 文档」范围内。
- **原结论（2026-09-18 首轮，存档）**：🔴 **不建议合并**。本轮新确认 **2 条 P0、8 条 P1、5 条 P2**（Top 15），另有 32 条已验证发现因报告上限未进 Top 榜，其中一条与上一轮 [P1] 独立复现。全部 15 条 Top 榜均为独立验证后的 CONFIRMED，2 条候选被证伪剔除。

## 评审基准（SHA）

| 角色             | SHA                                        | 说明                                               |
| ---------------- | ------------------------------------------ | -------------------------------------------------- |
| `main` 顶端      | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | commit `feat(aiao): 拆分 rxdb 功能为 plugin (#61)` |
| `next-0912` HEAD | `9e5ddc92cdca4c781d991a4332ef9a81aab7cf0b` | 2026-09-18 评审时 HEAD                             |
| merge-base       | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | 与 main 顶端相同，无分叉                           |

## 1. 范围与方法

- **范围**：`git diff main...HEAD` 全部 427 个文件。核心区域：`packages/rxdb-plugin-working-tree`（~15K 行源码 + 3.3K 行套件）、三框架绑定（angular/react/vue）、`packages/rxdb` 的 capture / trusted-write / plugin-system 基础设施、6 个适配器集成、`rxdb-plugin-history`、`scripts/audit` 五个脚本、benchmarks、三个 demo app 及其 e2e、specs/website 契约与文档。
- **方法**：9 个并行 finder 按分区扫描全部角度（逐行、删除行为审计、跨文件调用追踪、语言陷阱、包装器正确性、复用/简化/效率/altitude/规范），产出 44 条候选；每条候选由**独立验证 agent 对抗式验证**（能实测的全部实测复现，例如 SQL 判定用 node 直接跑出结果）；随后一轮全新视角 sweep 补查 5 条新候选并同样独立验证。终局：**46 CONFIRMED + 1 PLAUSIBLE + 2 REFUTED**。
- **验证方式说明**：本报告条目以静态跨文件追踪 + 局部实测为准；未跑全量 `pnpm test-all` 或 E2E。
- **上限说明**：报告 Top 榜上限 15 条，correctness 优先；其余 32 条已验证发现见 §5。

## 2. Top 发现（按严重度 —— 已修条目按约定删除，剩未处理 7 条）

> **标记说明**：`⏸ Deferred` = 判定成立但属架构级，单独排期（§6.1）；`⬇ 降级` = 原严重度高估，附降级理由。

### [P1] ⏸ Deferred — 调用方事务内 mergeChanges 被双重捕获

- **证据**：[capture-hook.ts:342-343](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L342) 挂载点 1 的 watermark 后扫对同一批 change 行二次捕获；`CAPTURE_OWNED_TRANSACTION` 只保护运行时自开事务。而 [merge-branch.ts:118-139](../../packages/rxdb-plugin-history/src/merge-branch.ts#L118) 的 `'normal'` 策略在调用方开启的事务里调 `executor.mergeChanges(singleActions, undefined, false)`。
- **触发与影响**：挂载点 2 捕获一次（entrance `domain_recompute`），挂载点 1 再捕获一次（entrance 覆写为 `'crud'`、origin 翻成 `CAPTURE_LOCAL`）——每次合并变更 `workingTreeRevision` +2（「一次合并推两格」，文件自身文档视为设计破坏），unitId/transactionId 被第二遍覆写；未来 remote 入口的受信调用会被误标为本地编辑，discard 会撤销远程同步。所有嵌套合并测试都恰好用 `disableTriggers: true` 绕过了此路径。
- **修复建议**：把「本次事务内的变更已由内层挂载点消费」的信息沿事务上下文传递（不依赖运行时自开标记），或用 watermark 排除内层已写入的修订号；补 `merge_branch('normal')` 端到端用例断言 revision 只 +1。
- **本轮处理（⏸ Deferred，D-3）**：判定复核成立，本轮不实现。修法要么给事务上下文加一条「本事务的变更已被内层消费」的传递位，要么改 watermark 的语义——两者都动捕获管线的契约面，不属本轮「确定项 + 测试 + 文档」范围。见 §6.1 顺延项。2026-09-18 第三次复核（HEAD `fc30f1da`）再次确认仍未修，条目同步在 [`next-0912-branch-review.md`](./next-0912-branch-review.md) 第三次复核节。

### [P1] ⏸ Deferred — 跨 realm 能力启用后，旧连接写入静默绕过捕获（与上一轮 [P1] 独立复现）

- **证据**：[rxdb-adapter.ts:182-189](../../packages/rxdb/src/rxdb-adapter.ts#L182) 的能力位以「适配器实例是否挂了捕获钩子」代理且 **fail-open**；[plugin.ts:105-117](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读一次能力位，[working-tree-facade.ts:155-165](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L155) 的 `enable()` 只给发起调用的 adapter 装钩子。全仓无 BroadcastChannel / storage 事件 / 重连传播。
- **触发与影响**：Tab A、B 在能力未启用时连上同一库；A `enable()`；B 继续 `save()` / `rawQuery`——无捕获、无 stale-token 校验、无报错，B 的编辑不进工作树，随后 B 的 `commit()` 提不到这些编辑（或报 `empty_commit`）。`status()` 从库读能力位仍报告已启用，与 FR-037「已启用库上的 writer 必须被拒」相反。本轮新增证据：[entity-manager.ts:548-554](../../packages/rxdb/src/entity/entity-manager.ts#L548) 的 `notifyExternalUpdate` 同样 fail-open 绕过 `gateExternalNotify`。对应场景无任何测试。
- **修复建议**：能力状态跨连接变化时（storage 事件或轮询能力位），在旧连接下一次写之前装钩子或拒绝写入（fail-closed）；补两个真实适配器实例共享持久库的回归用例。
- **本轮处理（⏸ Deferred，D-1）**：判定复核成立，是六条顺延项里**最该先排的一条**——两份报告独立复现，且违反 FR-037。修法要引入跨连接的能力变更传播通道（BroadcastChannel / storage 事件 / 轮询），这是新的运行时机制，不是改一处判断。见 §6.1 顺延项。

### [P2] ⬇ 降级 — 系统实体注册表跨实例按 namespace:name 吞掉用户建表（原报 P1）

- **证据**：[system-entities.ts:51-54](../../packages/rxdb/src/system/system-entities.ts#L51) 的 `isSystemEntity` 按 `namespace:name` 在模块级 `SYSTEM_ENTITY_IDENTITIES` 比对（跨实例共享）；[RxDB.ts:1764](../../packages/rxdb/src/RxDB.ts#L1764) 既有库路径 `#ensureEntityTables` 据此 `continue` 跳过建表。新库路径（972 行附近）无此过滤。
- **触发与影响**：同一进程内实例 A `use()` 过插件（注册 `rxdb:Commit`），实例 B 的用户实体若撞名（`@Entity({namespace:'rxdb', name:'Commit'})`，namespace 未校验、默认 `public`）在既有库上被静默跳过建表，首次仓库查询报 `no such table` 且错误不指向实体注册；实例级的 class 引用检查（SchemaManager）不会拦。
- **修复建议**：`isSystemEntity` 改为类引用（或实例作用域注册表）比对，或既有库路径跳过前增加冲突显式报错；补双实例撞名用例。
- **降级理由（P1 → P2）+ 本轮未处理**：机制属实，但触发要同时满足三件事：同一进程内两个实例、其中一个 `use()` 过插件、另一个的用户实体**精确撞上** `rxdb:Commit` 这类保留身份（`namespace` 显式写成 `'rxdb'`，默认是 `public`）。这是用户主动占用本库保留命名空间的结果，不是日常路径。修法（`isSystemEntity` 改类引用比对）要动核心注册表的身份口径，本轮范围外。

### [P2] ⬇ 降级 — StaleActiveBranchError 的 expected token 用当前分支 id 伪造（原报 P1）

- **证据**：[switch-branch-options.ts:94-97](../../packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L94) 构造 `{branchId: token.branchId, activationRevision: expectedActivationRevision}`；类契约（[write-entry.ts:346-347](../../packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L346)）定义 `expected` 为「调用方捕获的 token」，同仓其余调用点传完整捕获值。
- **触发与影响**：调用方捕获 `{branchId:A, activationRevision:3}`，另一 realm 切到 B（revision 7），调用方再带旧凭据操作 → 错误 `expected={branchId:B, activationRevision:3}`，消息「写入时持有 B@3，库里现在是 B@7」——一个从未存在过的 token，误导按 `expected.branchId` 定位问题的跨 realm 消费者。spec 只覆盖同分支场景。
- **修复建议**：expected 用调用方完整捕获值（branchId 为调用时所在分支）；补跨分支后旧凭据被拒的用例断言错误字段。
- **降级理由（P1 → P2）+ 本轮未处理**：**拒绝本身是对的**——旧凭据该被拒，也确实被拒了，没有任何写入穿过去。坏的只有错误对象里 `expected.branchId` 这一格的取值，影响面是「按该字段定位问题的跨 realm 消费者读到一个从未存在过的 token」。属诊断质量而非正确性，原报排 P1 是高估。修法本身不大，但要连带调整 `expected` 的语义契约与跨 realm 用例，与 D-1 同一场景，建议并入那次排期。

### [P1] ⏸ Deferred — diff 分页把同一事务切成两个半组

- **证据**：[diff.ts:242-251](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L242) 先 `readEntryPage`（`rows.slice(0, limit)`，185 行）后 `groupByTransaction`。实测 limit=2、3 条目事务 → 页 1 `{e1,e2}`、页 2 `{e3}`，两组同 `transactionId`。
- **触发与影响**：类型设计上组 = 一个原子事务（null 事务每条目一组正是为此）；消费者按组整体渲染或按 `transactionId` 去重会得到两个幻影事务或静默丢半组条目。分页 + 事务粒度组合无测试、无 TSDoc/契约允许切分，也没有任何调用方合并页。
- **修复建议**：分页边界改为按事务边界对齐（取整组后再截断页），或对跨页事务做延续标记并在文档中约定；补组合用例。
- **本轮处理（⏸ Deferred，D-5）**：判定复核成立，本轮不实现。两条修法都要改**分页游标的语义**（按事务边界对齐要允许页大小浮动；延续标记要在 `WorkingTreeDiff` 上加字段并写进已冻结的契约 §3），属公开面变更。见 §6.1 顺延项。第三次复核降为 P2 并确认仍未修（见 [`next-0912-branch-review.md`](./next-0912-branch-review.md)），本报告保留原判定。

### [P2] raw 判定第 2 步受信 intent 豁免没有生产通道

- **证据**：[capture-hook.ts:459-461](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L459) 是唯一生产构造点，传 `{capabilityEnabled, domain}` 无 `intent`；核心 [raw-write-gate.ts:45-56](../../packages/rxdb/src/capture/raw-write-gate.ts#L45) 的 `RawWriteContext`/`RawWriteGate` 签名均无 intent 槽位；9 个 `TRUSTED_CALLSITE_REGISTRY` 条目全是 `switchBranch`/`mergeChanges`，无 raw 调用点。`intent` 只在测试（capture.suite.ts:1060）被填充。
- **触发与影响**：契约（epic-006 与 adapter-contract.md §2）规定「调用携带内部受信 intent → 放行」，但生产没有任何通道能声明它；未来新增内部受信 raw 写路径会被第 4 步确定性拒绝——契约-接线缺口。
- **修复建议**：给 `RawWriteGate`/`RawWriteContext` 增加 intent 传递槽位并接入受信声明通道，或从契约中删除该豁免条款；补生产通道用例。
- **本轮未处理**：判定复核成立（前瞻性缺口，当前无生产 raw 受信调用点因此无实际泄漏）。两条修法是**互斥的方向决策**——加槽位是扩公开面，删条款是缩契约——需要先定「未来是否会有内部受信 raw 写路径」。本轮不做这个决策。

### [P2] ⏸ Deferred — bench-working-tree 相对门禁未接入 CI

- **证据**：[benchmarks/project.json:51](../../benchmarks/project.json#L51) 定义 target，但唯一基准 job（[ci-template.yml:1052-1067](../../.github/workflows/ci-template.yml#L1052)）只跑 `benchmarks:search-ci`；全仓 workflows / scripts / package.json 无任何 `bench-working-tree` 调用。契约 [benchmark-report.md §3.1](../../specs/001-working-tree-commits/contracts/benchmark-report.md) 与 tasks.md T097（标完成）均声称它是「普通 PR CI 的唯一硬门禁」。
- **触发与影响**：PR 改动落在 packages/ 或 benchmarks/（`need_benchmark=true`）时工作树测点（status/diff/commit/restore）出现相对回归会静默合入。
- **本轮处理（⏸ Deferred，D-6）+ 事实更新**：接线确实缺失。**T132 已于 2026-09-18 关闭**（`tasks.md:495`，按同日 T109 复冻的 reference 复跑 `✓ PASS`，4m0s，四项 ratio 全在 110% 内），因此「阻塞在 T132 基线复冻」的旧说法过期；但 `benchmarks/reports/working-tree-reference.json` 的 `regeneratedBecause` 仍写着「待静默后复冻」（与已关闭的 T132 不符，文案过期），且**CI 接线仍未做**——这是本条剩下的事实。
- **事实更正（2026-09-18 复核）**：本条旧版末句「当前冻结 reference 缺 restore 键，该门禁在 HEAD 上即使手动跑也必然红」**已证伪**。实测 `medianRatios` 的键是 `["status","diff","restore","commit"]`，restore 在；契约 §3.1 的样例也带该键。§5.1 对应那条同步标 Stale。

## 3. 与上一轮评审的关系

- **[P1] 跨 realm fail-open 为独立复现**：上一轮 2026-09-18 复核的 [P1]「已连接实例在另一实例启用后继续绕过捕获」与本轮 §2 第 2 条同机制；本轮新增证据（`notifyExternalUpdate` 同样 fail-open），两轮互证。
- **[P1] 丢失 changeSet 行误报**（已修）与上一轮 [P2]「检测到提交图损坏后没有持久化隔离标记」同文件相邻，是不同缺陷：上一轮讲损坏后不落盘标记，本轮讲成因分支不可达。
- **上一轮的 4 P1 + 4 P2 不在本轮 Top 榜**（如切分支不推进 activation revision、首次物化未接公开入口、切换校验与写入分属两个事务、并发受信声明互相覆盖、staging 崩溃续传、分页指纹未验证）：两轮互补，未互相证伪。
- 两轮合计：**上一轮 8 条 + 本轮 Top 15 条（其中 1 条互证）**，建议合并前统筹排期。
- **本轮复核补充**：上一轮那 4 P1 + 4 P2 已在本轮逐条复核，结论写在 `next-0912-branch-review.md` 里。两轮**去重后**真正阻塞合并的架构项是 6 条（§6.1），其余已修（已删）或降级。

## 4. 证伪项（REFUTED，勿再报）

| 候选                                                                              | 结论依据                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| raw-bypass-judgment.spec.ts:538 的 500ms 墙钟断言 flaky                           | 实测线性路径 0.34–0.82ms，500ms 上限有 >600 倍余量（文档亦注明「留三个量级的余量」）；普通 CI 争用不足以触发。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| **[原报 P0] CTE 别名 UPDATE/DELETE/INSERT 绕过版本表闸门**（2026-09-18 复核移入） | **前提不成立**。判定确实返回 `{kind:'allow', step:5, reason:'out_of_domain'}`，但**那条语句根本执行不了**：`WITH t AS (SELECT * FROM post) UPDATE t SET title = 'x'` 在 PGlite 上报 `relation "t" does not exist`，在 `node:sqlite` 上报 `no such table: t`；`DELETE FROM t` / `INSERT INTO t` 两种别名形态同样报错。原报的前提「PGlite 支持可更新单基表 CTE」不成立——CTE 名字不是可写目标，两个引擎都只把它当只读关系，且 UPDATE/DELETE 的目标名解析根本不看 WITH 列表。判定放行的是一条会被引擎自己拒绝的语句，没有写入穿过去。<br>**真正可执行的数据修改型 CTE**（`WITH x AS (UPDATE post … RETURNING *) SELECT …`）现有判定**拦得住**——目标表名 `post` 在语法位上是显式的。 |
| apps/dev-rxdb-react / vue 的 package.json 缺 working-tree 依赖登记                | 缺登记属实，但 nx 从 tsconfig references 推断静态边（`nx graph` 实测四条边齐全），`nx affected` 不受影响，vite 走 tsconfigPaths 到源码；降级为 hygiene 级，不计入。                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |

## 5. 其余已验证发现（超出 Top 15 上限，原共 32 条 + 1 条 PLAUSIBLE；已修 11 条按约定删除，剩 19 条）

### 5.1 契约 / 文档漂移（7 条 —— 已修 6 条删除；剩 1 条 Stale 记录）

| 位置                                                                                             | 摘要                                                                                                                                                                                                                                                                                            |
| ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [benchmark-report.md:65](../../specs/001-working-tree-commits/contracts/benchmark-report.md#L65) | ⚠️ **Stale（2026-09-18 复核证伪）** 原称冻结 reference 的 medianRatios 缺 `restore` 键。实测 `benchmarks/reports/working-tree-reference.json` 的键是 `["status","diff","restore","commit"]`，契约 §3.1 的样例也带该键——该条已不成立。（门禁未接 CI 是另一回事，见 §2 的 bench 条与 §6.1 D-6。） |

### 5.2 效率（4 条）

| 位置                                                                                                                     | 摘要                                                                                                                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [restore-precheck.ts:170-189,236-266](../../packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L170) | 线性历史 N 次提交时预检约 3N 次顺序往返（两次 BFS 每层一查 + 每路径节点一查 changeSet），且全在调用方写事务内；可用 `in` 批量化（`loadCommitsByIds` 已有此模式，changeSet 侧未批）。 |
| [commit-graph-guard.ts:113-116](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L113)           | 每次 commit()/restore()/switch 对每个可达 commit 顺序一条 `=` 查询；commit 行已按层 `in` 批量化，changeSet 未批。                                                                    |
| [capture-runtime.ts:341-351](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L341)           | 捕获热路径每变更 ~7-8 次查询（token 重验、entry 双读、状态行读+写），同事务内均可提升到批级。                                                                                        |
| [rxdb-adapter.ts:182-189](../../packages/rxdb/src/rxdb-adapter.ts#L182)                                                  | 启用态 getter 每次 rawQuery 分配新 context 对象 + gate 闭包；可像禁用态那样缓存单例。                                                                                                |

### 5.3 重复 / 简化（7 条）

| 位置                                                                                                                                             | 摘要                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [list-commits.ts:137-147](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L137)                                               | `nextFrontier` 与 [commit-graph-guard.ts:172-182](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L172) `nextParents` 逐字相同；改一处必漂移。                                                                                                                                                                                                                   |
| [branch-commit-rows.ts:180-184](../../packages/rxdb-plugin-working-tree/src/commit/branch-commit-rows.ts#L180)                                   | `readBranchEntries` 与 [commit-command.ts:97-101](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L97) 逐字节相同；id-asc 顺序是内容指纹输入，漂移即指纹分叉。                                                                                                                                                                                                 |
| [branch-materialization.ts:164-171](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L164)                     | `canonicalJson` 与 [capture-runtime.ts:79-89](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L79) `canonicalize` 输出等价可安全合并；文件注释「收敛口径各不相同」对本对不成立。                                                                                                                                                                              |
| [read_current_branch_id.ts:22-42](../../packages/rxdb-adapter-sqlite-core/src/version/read_current_branch_id.ts#L22)                             | sqlite-core 双份「读当前分支」实现（另一份 with_triggers_disabled.ts:33-56），通道/列索引/报错文案各异；docstring 引用的 `#readCurrentBranchId` 不存在；pglite 只有一份。<br>**另**：本文件 25-26 行仍带 `?? 'id'` / `?? 'activated'` 列名兜底——当年修复只落在 pglite 副本，sqlite-core 这份是「无 fallback 兜底」铁律的残余违反，与 pglite 侧已修的 `read_current_branch_id.ts` 同缺陷。 |
| [working-tree-restore-session.entity.ts:12](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-restore-session.entity.ts#L12) | 存储枚举 `'conflicted'` 全库无写入点（status 从修订号推导），死值引诱未来双真源。                                                                                                                                                                                                                                                                                                         |
| 三份 use-working-tree spec（angular 648 行 / react 681 / vue 653）                                                                               | ~150 行夹具逐字三拷贝；核心 `./testing` 子路径正是共享测试支撑位，夹具可下沉。                                                                                                                                                                                                                                                                                                            |
| [commit-error-codes.spec.ts:45-48](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-error-codes.spec.ts#L45)                  | 「互为全集」断言是同义反复（数组 = Object.values 同一对象）；同文件 25-37 行手写字面量才是真钉，此断言冗余。                                                                                                                                                                                                                                                                              |

### 5.4 测试缺陷（9 条 —— 已修 3 条删除，剩 6 条）

| 位置                                                                                                                                                  | 摘要                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [commit.suite.ts:1543-1555](../../packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts#L1543)                                   | discard 版本号断言拿 result 与事后重读比（同源）；删掉 +1 六后端全绿，仅 mock 场景钉住。                             |
| [metadata-only-branch-switch.spec.ts:567-570](../../packages/rxdb-plugin-working-tree/src/__tests__/version/metadata-only-branch-switch.spec.ts#L567) | staging 不变性检查读种子期旧实例；removeMany+saveMany 换行后照样绿，其余兄弟检查都重读 probe。                       |
| [capability-enable.spec.ts:111](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/capability-enable.spec.ts#L111)                          | find mock 无视 where 参数恒返回种子行；读路径字段/操作符改错测试全绿，真后端才炸。                                   |
| [react use-working-tree.ts:89-95](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L89)                                          | 「命令引用跨 render 稳定」契约（25-26 行文档）无任何测试钉住；丢掉 useMemo 全 spec 绿而消费者 effect 死循环。        |
| [vue use-working-tree.spec.ts:205-214](../../packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts#L205)                       | mountWithProvider 丢弃 wrapper 且无 afterEach 卸载，~40 个组件挂满整个文件；React/Angular 两侧都有清理。             |
| 三端 a11y spec（angular:217 / react:183 / vue:183）                                                                                                   | 空 span `Number(''.trim())` 折成 0 并归档 0ms；面板初始渲染态恰为空 span，注释宣称的「读不出来直接红」只挡元素缺失。 |

### 5.5 PLAUSIBLE（1 条）

| 位置                                                                                          | 摘要                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [capture-interceptor.ts:345-354](../../packages/rxdb/src/capture/capture-interceptor.ts#L345) | uninstall 的 SAVED-miss 兜底把 install 期 bound 原语焊成自有属性，破坏 this 多态后 mergeChanges 自锁死等；机制真实但仓库内唯一调用方保证先 install 后 uninstall，风险仅外部直调/双副本场景。 |

## 6. 解决记录

> 2026-09-18 复核轮已处理的条目（raw 写判定单趟扫描器重写、changeSet 成因换序、同分支守卫文档改正、pglite normalizer 改指核心实现、callsite drift 闸门三种形态、core-plugin 边界偏移互换法、契约 §3/§4/§5 重冻结、§5.1 已修 6 条、§5.4 已修 3 条等）按本目录约定从报告删除——修法与判据写在代码注释与 TSDoc 里。以下保留未处理的条目与优先级。

### 6.1 顺延项（⏸ Deferred —— 架构级，需单独排期）

这 6 条是**当前真正阻塞合并的全部内容**，按建议优先级排：

1. **跨 realm 能力启用后旧连接静默绕过捕获**（§2）——两份报告独立复现，违反 FR-037，最该先排。要新增跨连接的能力变更传播通道。
2. **三个未接线的失效保护**：`bumpActivationRevision`（普通切换不推进 activation revision，A→B→A 可重用旧凭据）/ `commitBranchMaterialization`（远端分支首次物化未接公开入口）/ `markBranchCorrupted`（检测到损坏不落盘隔离标记）——三者都是「函数写好了但生产代码没有调用点」。详见 `next-0912-branch-review.md`。
3. **`merge_branch('normal')` 路径双重捕获**（§2）——要改事务上下文的传递位或 watermark 语义。
4. **切换前置条件与最终写入分属两个事务**——详见 `next-0912-branch-review.md`。
5. **diff 分页把同一事务切成两个半组**（§2）——两条修法都要改分页游标的公开语义。
6. **`bench-working-tree` 接 CI**（§2）——T132 已于 2026-09-18 按 T109 复冻基线跑 `✓ PASS`，**剩 CI 接线**；顺带把 `working-tree-reference.json` 的 `regeneratedBecause` 过期文案一并清掉。

第 7 条是本轮复核**新发现**的：**`normalizeCreateEntity` 的平行数组下标配对**（pglite `pglite.utils.ts:479-497` + sqlite-core `sqlite-core.utils.ts:482-503`，两份逐字相同）。它是已修的 `normalizeUpdateEntity` 分歧在 INSERT 侧的镜像，同一个缺陷形态——但**这一侧修不了**：核心里根本没有 `normalizeCreateEntity` 可指（只在 `entity.utils.ts:171` 的注释里被提到）。要先往 `@aiao/rxdb` 补一份 keyed 实现再让两个适配器改指，是新增核心公开导出。详见 `next-0912-branch-review.md` §4.1。

第 8 条相关但更小：**时钟口径统一**（`corruptedAt` / `enabledAt` 用客户端时钟）。本轮判定为**改不了**——`CURRENT_TIMESTAMP` 在 SQLite 上求值成 `'YYYY-MM-DD HH:MM:SS'`，与本仓日期列的 ISO 存储形态对不上，而仓储层没有写 SQL 表达式的口子。本轮只在两处补了说明边界的 TSDoc（见 `next-0912-branch-review.md` §3）；统一要先给仓储层加能力。

### 6.2 尚未排期

- [ ] §5.2 效率 4 条、§5.3 重复/简化 7 条、§5.4 剩余测试缺陷 6 条、§5.5 PLAUSIBLE 1 条
- [ ] §2 里标「本轮未处理」的 3 条 P2（系统实体 namespace、StaleActiveBranchError 诊断字段、raw intent 豁免方向决策）
- [ ] D 档 6 条全部落地后，本报告与 `next-0912-branch-review.md` 一并归档（`status: Resolved`）
