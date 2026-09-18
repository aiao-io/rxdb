# next-0912 分支对 main 评审（max 独立复核轮）

- **评审日期**：2026-09-18（独立于同日「复核」的完整 max 评审）
- **评审分支**：`next-0912`
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`
- **变更规模**：427 个文件，`+61,111 / -2,904`
- **评审强度**：max（9 个分区 finder 全角度扫描 → 44 条候选 → 每条独立对抗式验证 → 1 轮 sweep 查漏）
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **结论**：🔴 **不建议合并**。本轮新确认 **2 条 P0、8 条 P1、5 条 P2**（Top 15），另有 32 条已验证发现因报告上限未进 Top 榜，其中一条与上一轮 [P1] 独立复现。全部 15 条 Top 榜均为独立验证后的 CONFIRMED，2 条候选被证伪剔除。

## 评审基准（SHA）

| 角色             | SHA                                        | 说明                                   |
| ---------------- | ------------------------------------------ | -------------------------------------- |
| `main` 顶端      | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | commit `feat(aiao): 拆分 rxdb 功能为 plugin (#61)` |
| `next-0912` HEAD | `9e5ddc92cdca4c781d991a4332ef9a81aab7cf0b` | 2026-09-18 评审时 HEAD                |
| merge-base       | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | 与 main 顶端相同，无分叉              |

- 评审开始时工作区 clean；本报告文件本身不计入变更统计。

## 1. 范围与方法

- **范围**：`git diff main...HEAD` 全部 427 个文件。核心区域：`packages/rxdb-plugin-working-tree`（~15K 行源码 + 3.3K 行套件）、三框架绑定（angular/react/vue）、`packages/rxdb` 的 capture / trusted-write / plugin-system 基础设施、6 个适配器集成、`rxdb-plugin-history`、`scripts/audit` 五个脚本、benchmarks、三个 demo app 及其 e2e、specs/website 契约与文档。
- **方法**：9 个并行 finder 按分区扫描全部角度（逐行、删除行为审计、跨文件调用追踪、语言陷阱、包装器正确性、复用/简化/效率/altitude/规范），产出 44 条候选；每条候选由**独立验证 agent 对抗式验证**（能实测的全部实测复现，例如 SQL 判定用 node 直接跑出结果）；随后一轮全新视角 sweep 补查 5 条新候选并同样独立验证。终局：**46 CONFIRMED + 1 PLAUSIBLE + 2 REFUTED**。
- **验证方式说明**：本报告条目以静态跨文件追踪 + 局部实测为准；未跑全量 `pnpm test-all` 或 E2E。
- **上限说明**：报告 Top 榜上限 15 条，correctness 优先；其余 32 条已验证发现见 §5。

## 2. Top 15 发现（按严重度）

### [P0] raw 写判定先剥注释后掩字面量，字符串字面量可隐藏被跟踪列

- **证据**：[raw-write-judgment.ts:222-224](../../packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L222) 的 `normalizeSql` 先 `replace(COMMENT_PATTERN, ' ')` 再 `replace(STRING_LITERAL_PATTERN, ...)`。实测 `UPDATE post SET remoteId = 'a -- ', title = 'x'` 归一化为 `"update post set remoteid = 'a  "`——`-- ` 后的第二个赋值整段被当作注释吞掉，判定只见 `['remoteid']`。
- **触发与影响**：`remoteId` 未跟踪而 `title` 已跟踪时，判定走第 5 步 `untracked_only` 放行，适配器执行原始 SQL 写入 `title`——无工作树单元、无变更日志，cold-replay 永久分叉。批处理形式（注释符后跟第二句）整条第二语句被吞。反向误拒同样存在：合法写入的字符串值含 `--` 或 `/*` 会被过拒。插件无任何 RAISE/ABORT/触发器兜底，两个适配器 `rawQuery` 只包 `gateRawWrite`。
- **修复建议**：把掩码顺序反过来（先掩字面量、再剥注释），或对注释符做引号感知的状态机扫描；补充「字符串字面量内含注释符」的判定用例（当前 spec 的注释用例只覆盖未闭合注释与 CWE-1333）。

### [P0] CTE 别名 UPDATE/DELETE/INSERT 绕过版本表闸门

- **证据**：[raw-write-judgment.ts:433](../../packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts#L433) 只从语法显式表名解析目标表。实测 `judgeRawWrite("WITH t AS (SELECT * FROM post) UPDATE t SET title = 'x'", {versionedTables:['post']})` 返回 `{kind:'allow', step:5, reason:'out_of_domain'}`。
- **触发与影响**：PGlite 支持可更新单基表 CTE，语句实际变更版本表 `post`，却因 `tables=['t']` 不在 versionedTables 而被视为域外写放行——无捕获、无变更日志，静默破坏 cold-replay 不变量。`DELETE FROM t` / `INSERT INTO t` 别名形式同理。
- **修复建议**：在判定中加入 CTE 定义展开（把 `WITH` 子句里显式表名并入候选目标集），或对含 `WITH ... UPDATE/DELETE` 形式的语句保守拒绝（fail-closed）；补三形式 CTE 别名用例。

### [P1] 调用方事务内 mergeChanges 被双重捕获

- **证据**：[capture-hook.ts:342-343](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L342) 挂载点 1 的 watermark 后扫对同一批 change 行二次捕获；`CAPTURE_OWNED_TRANSACTION` 只保护运行时自开事务。而 [merge-branch.ts:118-139](../../packages/rxdb-plugin-history/src/merge-branch.ts#L118) 的 `'normal'` 策略在调用方开启的事务里调 `executor.mergeChanges(singleActions, undefined, false)`。
- **触发与影响**：挂载点 2 捕获一次（entrance `domain_recompute`），挂载点 1 再捕获一次（entrance 覆写为 `'crud'`、origin 翻成 `CAPTURE_LOCAL`）——每次合并变更 `workingTreeRevision` +2（「一次合并推两格」，文件自身文档视为设计破坏），unitId/transactionId 被第二遍覆写；未来 remote 入口的受信调用会被误标为本地编辑，discard 会撤销远程同步。所有嵌套合并测试都恰好用 `disableTriggers: true` 绕过了此路径。
- **修复建议**：把「本次事务内的变更已由内层挂载点消费」的信息沿事务上下文传递（不依赖运行时自开标记），或用 watermark 排除内层已写入的修订号；补 `merge_branch('normal')` 端到端用例断言 revision 只 +1。

### [P1] 跨 realm 能力启用后，旧连接写入静默绕过捕获（与上一轮 [P1] 独立复现）

- **证据**：[rxdb-adapter.ts:182-189](../../packages/rxdb/src/rxdb-adapter.ts#L182) 的能力位以「适配器实例是否挂了捕获钩子」代理且 **fail-open**；[plugin.ts:105-117](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读一次能力位，[working-tree-facade.ts:155-165](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L155) 的 `enable()` 只给发起调用的 adapter 装钩子。全仓无 BroadcastChannel / storage 事件 / 重连传播。
- **触发与影响**：Tab A、B 在能力未启用时连上同一库；A `enable()`；B 继续 `save()` / `rawQuery`——无捕获、无 stale-token 校验、无报错，B 的编辑不进工作树，随后 B 的 `commit()` 提不到这些编辑（或报 `empty_commit`）。`status()` 从库读能力位仍报告已启用，与 FR-037「已启用库上的 writer 必须被拒」相反。本轮新增证据：[entity-manager.ts:547-550](../../packages/rxdb/src/entity/entity-manager.ts#L547) 的 `notifyExternalUpdate` 同样 fail-open 绕过 `gateExternalNotify`。对应场景无任何测试。
- **修复建议**：能力状态跨连接变化时（storage 事件或轮询能力位），在旧连接下一次写之前装钩子或拒绝写入（fail-closed）；补两个真实适配器实例共享持久库的回归用例。

### [P1] 丢失 changeSet 行被误报为指纹不匹配，成因区分失效

- **证据**：[change-unit.ts:262](../../packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L262) 指纹恒含 `u${units.length}:` 前缀；[commit-graph-guard.ts:121-124](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L121) 先比指纹、后比行数。
- **触发与影响**：N 行 changeSet 丢一行后，N-1 行重算的指纹不可能等于存储值，先抛 `fingerprint_mismatch`；`change_set_count_mismatch` 分支对其宣称的成因（丢行）**永远不可达**，仅单独篡改 `changeSetCount` 列时可达。文档（102-103 行）承诺的「行数少一行时指纹对得上、可区分两个成因」不成立，用户按内容篡改方向误排查。
- **修复建议**：指纹不含行数（单独存行数并先行比较），或先比对 `changeSetCount` 再比指纹；补「删一行 changeSet」用例断言抛 `change_set_count_mismatch`。

### [P1] 同分支 switchBranch 跳过前置条件与 SC-013 损坏守卫

- **证据**：[VersionManager.ts:279-287](../../packages/rxdb-plugin-history/src/VersionManager.ts#L279) 的同分支提前 `return` 在 `#assert_branch_switchable` 之前且不看 `preconditions`；该守卫文档（474 行）称「无条件跑，不只在带了选项时跑」。
- **触发与影响**：脏树上 `switchBranch(当前分支, {requireClean: true})` 静默返回成功；当前分支提交图损坏时切自己返回成功，切任何其他分支才抛 `commit_graph_corrupted`——调用方显式提出的前置条件被静默忽略，行为不一致。无测试覆盖「同分支 + 前置条件」组合。
- **修复建议**：把同分支早退移到守卫之后（或保留早退但先跑校验）；补同分支带 `requireClean` 与损坏图两个用例。

### [P1] 系统实体注册表跨实例按 namespace:name 吞掉用户建表

- **证据**：[system-entities.ts:51-54](../../packages/rxdb/src/system/system-entities.ts#L51) 的 `isSystemEntity` 按 `namespace:name` 在模块级 `SYSTEM_ENTITY_IDENTITIES` 比对（跨实例共享）；[RxDB.ts:1764](../../packages/rxdb/src/RxDB.ts#L1764) 既有库路径 `#ensureEntityTables` 据此 `continue` 跳过建表。新库路径（972 行附近）无此过滤。
- **触发与影响**：同一进程内实例 A `use()` 过插件（注册 `rxdb:Commit`），实例 B 的用户实体若撞名（`@Entity({namespace:'rxdb', name:'Commit'})`，namespace 未校验、默认 `public`）在既有库上被静默跳过建表，首次仓库查询报 `no such table` 且错误不指向实体注册；实例级的 class 引用检查（SchemaManager）不会拦。
- **修复建议**：`isSystemEntity` 改为类引用（或实例作用域注册表）比对，或既有库路径跳过前增加冲突显式报错；补双实例撞名用例。

### [P1] PGlite 与 sqlite-core 的空更新闸门用不同归一化器，行为分裂

- **证据**：[pglite switch-result.utils.ts:126-127](../../packages/rxdb-adapter-pglite/src/version/switch-result.utils.ts#L126) 用本地 `normalizeEntity`（外键循环无 readonly 检查，[pglite.utils.ts:515-520](../../packages/rxdb-adapter-pglite/src/version/pglite.utils.ts#L515)）；[sqlite-core switch-result.utils.ts:124-125](../../packages/rxdb-adapter-sqlite-core/src/version/switch-result.utils.ts#L124) 用核心 `normalizeUpdateEntity`（readonly 外键显式 `continue` 过滤，[entity.utils.ts:265](../../packages/rxdb/src/entity/entity.utils.ts#L265)）。
- **触发与影响**：switch/merge 更新 patch 只含 readonly 外键关系字段（如 `{reviewerId: 'x'}`）：sqlite 归一化后 `{}` → 跳过整行；pglite 归一化出 `{reviewer_id: 'x'}` → 发出 UPDATE 并触发变更日志——闸门要防止的「空写」恰在 PGlite 侧发生，与闸门自身注释要求的双端一致相反。核心 spec「使用物理列名并过滤 readonly 外键」已钉死该分歧。
- **修复建议**：pglite 侧改调核心 `normalizeUpdateEntity`（或补同样的 readonly 过滤）；补双后端对同一 patch 的对称用例。

### [P1] StaleActiveBranchError 的 expected token 用当前分支 id 伪造

- **证据**：[switch-branch-options.ts:95](../../packages/rxdb-plugin-working-tree/src/working-tree/switch-branch-options.ts#L95) 构造 `{branchId: token.branchId, activationRevision: expectedActivationRevision}`；类契约（[write-entry.ts:346-347](../../packages/rxdb-plugin-working-tree/src/working-tree/write-entry.ts#L346)）定义 `expected` 为「调用方捕获的 token」，同仓其余调用点传完整捕获值。
- **触发与影响**：调用方捕获 `{branchId:A, activationRevision:3}`，另一 realm 切到 B（revision 7），调用方再带旧凭据操作 → 错误 `expected={branchId:B, activationRevision:3}`，消息「写入时持有 B@3，库里现在是 B@7」——一个从未存在过的 token，误导按 `expected.branchId` 定位问题的跨 realm 消费者。spec 只覆盖同分支场景。
- **修复建议**：expected 用调用方完整捕获值（branchId 为调用时所在分支）；补跨分支后旧凭据被拒的用例断言错误字段。

### [P1] diff 分页把同一事务切成两个半组

- **证据**：[diff.ts:242-251](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L242) 先 `readEntryPage`（`rows.slice(0, limit)`，185 行）后 `groupByTransaction`。实测 limit=2、3 条目事务 → 页 1 `{e1,e2}`、页 2 `{e3}`，两组同 `transactionId`。
- **触发与影响**：类型设计上组 = 一个原子事务（null 事务每条目一组正是为此）；消费者按组整体渲染或按 `transactionId` 去重会得到两个幻影事务或静默丢半组条目。分页 + 事务粒度组合无测试、无 TSDoc/契约允许切分，也没有任何调用方合并页。
- **修复建议**：分页边界改为按事务边界对齐（取整组后再截断页），或对跨页事务做延续标记并在文档中约定；补组合用例。

### [P2] raw 判定第 2 步受信 intent 豁免没有生产通道

- **证据**：[capture-hook.ts:460](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L460) 是唯一生产构造点，传 `{capabilityEnabled, domain}` 无 `intent`；核心 [raw-write-gate.ts:45-56](../../packages/rxdb/src/capture/raw-write-gate.ts#L45) 的 `RawWriteContext`/`RawWriteGate` 签名均无 intent 槽位；9 个 `TRUSTED_CALLSITE_REGISTRY` 条目全是 `switchBranch`/`mergeChanges`，无 raw 调用点。`intent` 只在测试（capture.suite.ts:1060）被填充。
- **触发与影响**：契约（epic-006 与 adapter-contract.md §2）规定「调用携带内部受信 intent → 放行」，但生产没有任何通道能声明它；未来新增内部受信 raw 写路径会被第 4 步确定性拒绝——契约-接线缺口。
- **修复建议**：给 `RawWriteGate`/`RawWriteContext` 增加 intent 传递槽位并接入受信声明通道，或从契约中删除该豁免条款；补生产通道用例。

### [P2] bench-working-tree 相对门禁未接入 CI

- **证据**：[benchmarks/project.json:51](../../benchmarks/project.json#L51) 定义 target，但唯一基准 job（[ci-template.yml:1020](../../.github/workflows/ci-template.yml#L1020)）只跑 `benchmarks:search-ci`；全仓 workflows / scripts / package.json 无任何 `bench-working-tree` 调用。契约 [benchmark-report.md](../../specs/001-working-tree-commits/contracts/benchmark-report.md) §3.1 与 tasks.md T097（标完成）均声称它是「普通 PR CI 的唯一硬门禁」。
- **触发与影响**：PR 改动落在 packages/ 或 benchmarks/（`need_benchmark=true`）时工作树测点（status/diff/commit/restore）出现相对回归会静默合入；T132 仍为手工。顺带：当前冻结 reference 缺 restore 键，该门禁在 HEAD 上即使手动跑也必然红（详见 §5 C04）。
- **修复建议**：把 `bench-working-tree` 挂进基准 job（或恢复 CI 前先完成 T132 的 reference 重冻结），并让契约 §3.1 与实际接线一致。

### [P2] 受信调用 drift 闸门对可选链/非空断言/下标调用全盲

- **证据**：[working-tree-callsite-drift.mjs:284](../../scripts/audit/working-tree-callsite-drift.mjs#L284) 的 `CALL_PATTERN` 要求接收者与方法之间是裸点号。实测 `adapter?.switchBranch()`、`adapter!.mergeChanges()`、`adapter['switchBranch']()` 全部零命中；eslint 关闭了 `no-non-null-assertion`，spec 未覆盖这三种形式。
- **触发与影响**：核心/插件代码用这三种形式调用受信原语时，调用永不与 `TRUSTED_CALLSITE_REGISTRY` 比对，未登记受信调用静默通过审计（exit 0）——fail-dangerous 的登记表盲点，与文件自身「未登记即报出」教义相反；当前无此类调用属侥幸。
- **修复建议**：扩展模式覆盖 `?.` / `!.` / 下标形式（或改用 TS AST 解析）；spec 补三种形式用例。

### [P2] core-plugin 边界闸门把字符串字面量误扫为越界依赖

- **证据**：[core-plugin-boundary.mjs:72](../../scripts/audit/core-plugin-boundary.mjs#L72) 的 `findSpecifiers` 只清注释不清字符串（`blankStrings: false`，旁路 `blankStringLiterals` helper 从未应用）。实测纯字符串 `"use import('./working-tree/x.js') instead"` 被提取为越界说明符。
- **触发与影响**：核心文件新增任何含 `from './commit/…'` 或 `import('./working-tree/…')` 的字符串（如错误消息引路径），`pnpm audit:core-boundary` 报未登记越界、退出 1——纯文档改动红 CI 的潜在陷阱；当前通过只因尚无此类字符串，spec 只测注释不测字符串。
- **修复建议**：对源码先做字符串掩码（应用现成的 `blankStringLiterals`）再扫说明符；spec 补字符串字面量用例。

### [P2] 冻结契约的 WorkingTreeStatus 与实现字段对不上

- **证据**：[core-api.md:71,79](../../specs/001-working-tree-commits/contracts/core-api.md#L71) 冻结 `headCommitId: string | null` 与 `branchStatus: 'ok' | 'corrupted_read_only'`；实现 [status.ts:49-76](../../packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L49) 实际是 `clean`/`restoring`/`activationRevision`，且全仓唯一 `WorkingTreeStatus` 就在该文件。契约第 5 行声明形状与语义为**规范性冻结**，specs/ 内无修正或 superseded 注记。
- **触发与影响**：按契约 §3 编写类型断言、消费者代码或对称性审计在发布包上编译失败；仓库自身 `requirements-consistency` 审计对这块形同虚设。同族的 `status$()` 声明未实现、CommitOptions 必填字段矛盾见 §5（C02/C03）。
- **修复建议**：以实现为准重冻结 §3（或实现补齐契约字段），并把 `status$`/CommitOptions 一并裁决后更新契约；让 requirements-consistency 覆盖 contracts/。

## 3. 与上一轮评审的关系

- **[P1] 跨 realm fail-open 为独立复现**：上一轮 2026-09-18 复核的 [P1]「已连接实例在另一实例启用后继续绕过捕获」与本轮 §2 第 4 条同机制；本轮新增证据（`notifyExternalUpdate` 同样 fail-open），两轮互证。
- **[P1] 丢失 changeSet 行误报** 与上一轮 [P2]「检测到提交图损坏后没有持久化隔离标记」同文件相邻，是不同缺陷：上一轮讲损坏后不落盘标记，本轮讲成因分支不可达。
- **上一轮的 4 P1 + 4 P2 不在本轮 Top 榜**（如切分支不推进 activation revision、首次物化未接公开入口、切换校验与写入分属两个事务、并发受信声明互相覆盖、staging 崩溃续传、分页指纹未验证）：两轮互补，未互相证伪；本轮未对它们逐条复验。
- 两轮合计：**上一轮 8 条 + 本轮 Top 15 条（其中 1 条互证）**，建议合并前统筹排期。

## 4. 证伪项（REFUTED，勿再报）

| 候选 | 结论依据 |
| ---- | -------- |
| raw-bypass-judgment.spec.ts:538 的 500ms 墙钟断言 flaky | 实测线性路径 0.34–0.82ms，500ms 上限有 >600 倍余量（文档亦注明「留三个量级的余量」）；普通 CI 争用不足以触发。 |
| apps/dev-rxdb-react / vue 的 package.json 缺 working-tree 依赖登记 | 缺登记属实，但 nx 从 tsconfig references 推断静态边（`nx graph` 实测四条边齐全），`nx affected` 不受影响，vite 走 tsconfigPaths 到源码；降级为 hygiene 级，不计入。 |

## 5. 其余已验证发现（超出 Top 15 上限，共 32 条 + 1 条 PLAUSIBLE）

### 5.1 契约 / 文档漂移（7 条）

| 位置 | 摘要 |
| ---- | ---- |
| [core-api.md:62](../../specs/001-working-tree-commits/contracts/core-api.md#L62) | 契约声明 `status$(): Observable<WorkingTreeStatus>`，实现只有命令式 `status()`，src 内无任何 `status$`。 |
| [core-api.md:118](../../specs/001-working-tree-commits/contracts/core-api.md#L118) | 契约 CommitOptions 全可选（`author?`、无 `expectedBranch`），实现必填 `authorId`/`operationId`/`expectedBranch`；`restore(target, options?)` 同样实现必填。 |
| [benchmark-report.md:65](../../specs/001-working-tree-commits/contracts/benchmark-report.md#L65) | 冻结 reference 的 medianRatios 缺 `restore` 键，而 bench 无条件测 restore，`evaluateRelativeGate` 对缺键硬失败；CI 当前不跑该 gate（见 §2 S1），但 HEAD 上手动跑必红。 |
| [conformance-suites.md:13](../../specs/001-working-tree-commits/contracts/conformance-suites.md#L13) | 契约称套件从 `packages/rxdb` 导出，实际在 `rxdb-plugin-working-tree/testing`；suite-callsites 门禁的 SUITE_ENTRY 也是后者。 |
| [tri-framework-api.md:23](../../specs/001-working-tree-commits/contracts/tri-framework-api.md#L23) | 契约称 Angular 入口是 `WorkingTreeService` + `Signal<WorkingTreeStatus>`/`status$`，实际只有 `useWorkingTree()` 返回 `statusState: Signal<WorkingTreeQueryState<WorkingTreeStatus>>`。 |
| [working-tree-split.md:84](../../website/docs/migration/working-tree-split.md#L84) | 迁移文档称「七个状态字段」，实际 `WorkingTreeAsyncStates` 十个字段且绑定与 README 都写十。 |
| [compare.md:14](../../website/docs/getting-started/compare.md#L14) | 称 restore 与工作树语义 switchBranch「尚在路线图上」，两者均已实现并有测试；collaboration/branch.md:175 同款过时。 |

### 5.2 效率（4 条）

| 位置 | 摘要 |
| ---- | ---- |
| [restore-precheck.ts:264](../../packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L264) | 线性历史 N 次提交时预检约 3N 次顺序往返（两次 BFS 每层一查 + 每路径节点一查 changeSet），且全在调用方写事务内；可用 `in` 批量化（`loadCommitsByIds` 已有此模式）。 |
| [commit-graph-guard.ts:110](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L110) | 每次 commit()/restore()/switch 对每个可达 commit 顺序一条 `=` 查询；commit 行已按层 `in` 批量化，changeSet 未批。 |
| [capture-runtime.ts:349](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L349) | 捕获热路径每变更 ~7-8 次查询（token 重验、entry 双读、状态行读+写），同事务内均可提升到批级。 |
| [rxdb-adapter.ts:185](../../packages/rxdb/src/rxdb-adapter.ts#L185) | 启用态 getter 每次 rawQuery 分配新 context 对象 + gate 闭包；可像禁用态那样缓存单例。 |

### 5.3 重复 / 简化（7 条）

| 位置 | 摘要 |
| ---- | ---- |
| [list-commits.ts:137](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L137) | `nextFrontier` 与 [commit-graph-guard.ts:168](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L168) `nextParents` 逐字相同；改一处必漂移。 |
| [branch-commit-rows.ts:180](../../packages/rxdb-plugin-working-tree/src/commit/branch-commit-rows.ts#L180) | `readBranchEntries` 与 [commit-command.ts:97](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L97) 逐字节相同；id-asc 顺序是内容指纹输入，漂移即指纹分叉。 |
| [branch-materialization.ts:164](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L164) | `canonicalJson` 与 [capture-runtime.ts:79](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L79) `canonicalize` 输出等价可安全合并；文件注释「收敛口径各不相同」对本对不成立。 |
| [read_current_branch_id.ts:22](../../packages/rxdb-adapter-sqlite-core/src/version/read_current_branch_id.ts#L22) | sqlite-core 双份「读当前分支」实现（另一份 with_triggers_disabled.ts:42），通道/列索引/报错文案各异；docstring 引用的 `#readCurrentBranchId` 不存在；pglite 只有一份。 |
| [working-tree-restore-session.entity.ts:12](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-restore-session.entity.ts#L12) | 存储枚举 `'conflicted'` 全库无写入点（status 从修订号推导），死值引诱未来双真源。 |
| 三份 use-working-tree spec（angular:175 / react / vue） | ~150 行夹具逐字三拷贝；核心 `./testing` 子路径正是共享测试支撑位，夹具可下沉。 |
| [commit-error-codes.spec.ts:46](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-error-codes.spec.ts#L46) | 「互为全集」断言是同义反复（数组 = Object.values 同一对象）；同文件 25-37 行手写字面量才是真钉，此断言冗余。 |

### 5.4 规范 / 清洁（4 条）

| 位置 | 摘要 |
| ---- | ---- |
| [working-tree-materialization-page.entity.ts:87](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-materialization-page.entity.ts#L87) | 关系字段 `stage` 未用 `declare`：es2025 + useDefineForClassFields 下每行实例自带 `stage: undefined` 幻影自有属性；四个兄弟实体都用了 `declare` 并有注释说明理由。 |
| [vue tsconfig.lib.json:26](../../packages/rxdb-plugin-working-tree-vue/tsconfig.lib.json#L26) | include 未排除 `src/__tests__/`，dts 插件把 setup-harness/rxdb-provider-harness 声明发进 dist（已实测存在），`files` 的否定只挡 src 不挡 dist；React/Angular 产物干净。 |
| [react use-working-tree.ts:2](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L2) | 头注释「九格」与同文件 20 行「十个」及核心类型矛盾（T123 加的 switchBranchState）。 |
| [http errors.ts:9](../../packages/rxdb-adapter-http/src/errors.ts#L9) | doc 注释把 epic-006 码表登记在 `@aiao/rxdb` 的 `commit/commit-error-codes.ts`，实际在插件包，路径不存在。 |

### 5.5 测试缺陷（9 条）

| 位置 | 摘要 |
| ---- | ---- |
| [status.spec.ts:156](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/status.spec.ts#L156) | CAS 失败断言 `restoring` 键误读 `status.conflicted`；实现若错误残留 restore 会话照样绿。 |
| [commit.suite.ts:1555](../../packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts#L1555) | discard 版本号断言拿 result 与事后重读比（同源）；删掉 +1 六后端全绿，仅 mock 场景钉住。 |
| [metadata-only-branch-switch.spec.ts:568](../../packages/rxdb-plugin-working-tree/src/__tests__/version/metadata-only-branch-switch.spec.ts#L568) | staging 不变性检查读种子期旧实例；removeMany+saveMany 换行后照样绿，其余兄弟检查都重读 probe。 |
| [storage-contract.spec.ts:43](../../packages/rxdb-plugin-working-tree/src/__tests__/system/storage-contract.spec.ts#L43) | 「不对 rxdb_change 建外键」闸门循环零次执行（foreignKeys 只来自实体显式选项，两个守卫实体都没声明）。 |
| [restore-encryption.spec.ts:389](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/restore-encryption.spec.ts#L389) | 密文泄漏检查在未抛异常时真空通过（`thrown === null ? [] : ...`），且未断言确实抛错。 |
| [capability-enable.spec.ts:111](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/capability-enable.spec.ts#L111) | find mock 无视 where 参数恒返回种子行；读路径字段/操作符改错测试全绿，真后端才炸。 |
| [react use-working-tree.ts:93](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L93) | 「命令引用跨 render 稳定」契约（25-26 行文档）无任何测试钉住；丢掉 useMemo 全 spec 绿而消费者 effect 死循环。 |
| [vue use-working-tree.spec.ts:207](../../packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts#L207) | mountWithProvider 丢弃 wrapper 且无 afterEach 卸载，~40 个组件挂满整个文件；React/Angular 两侧都有清理。 |
| 三端 a11y spec（angular:183 / react / vue） | 空 span `Number(''.trim())` 折成 0 并归档 0ms；面板初始渲染态恰为空 span，注释宣称的「读不出来直接红」只挡元素缺失。 |

### 5.6 PLAUSIBLE（1 条）

| 位置 | 摘要 |
| ---- | ---- |
| [capture-interceptor.ts:352](../../packages/rxdb/src/capture/capture-interceptor.ts#L352) | uninstall 的 SAVED-miss 兜底把 install 期 bound 原语焊成自有属性，破坏 this 多态后 mergeChanges 自锁死等；机制真实但仓库内唯一调用方保证先 install 后 uninstall，风险仅外部直调/双副本场景。 |

## 6. 解决记录

- [ ] P0 ×2（raw 判定旁路两条）修复并补实测用例
- [ ] P1 ×8 修复或裁决（其中跨 realm fail-open 与上一轮 [P1] 同案并处理）
- [ ] P2 ×5 修复或裁决（bench CI 接线与 T132 reference 重冻结联动）
- [ ] §5 的 32 条排期：契约 7 条建议在发布前重冻结；测试缺陷 9 条建议与对应修复同 PR 处理
- [ ] 修复 PR 合并后，本报告与上一轮 `next-0912-branch-review.md` 一并归档（`status: Resolved`）
