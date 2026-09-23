# next-0912 分支对 main 评审（max 独立复核轮）

- **评审日期**：2026-09-18（独立于同日「复核」的完整 max 评审）
- **评审分支**：`next-0912`
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`
- **变更规模**：427 个文件，`+61,111 / -2,904`
- **评审强度**：max（9 个分区 finder 全角度扫描 → 44 条候选 → 每条独立对抗式验证 → 1 轮 sweep 查漏）
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **本轮复核**：2026-09-18（同基准 `de70a1a9` → `9e5ddc92`）。逐条复核 + 按裁决落地修复；已修条目、经复核证伪或判定不值得做的条目均按本目录「只留尚未处理的条目」约定从报告删除（修法与判据写在代码注释与 TSDoc 里），架构项标 Deferred。
- **结论（复核后）**：🟡 **可合并性取决于 D 档排期**。仍阻塞合并的是 **4 条架构级顺延项**（§5.1；原 6 条里的双重捕获与 diff 分页已于 2026-09-19 修复）；另有 §2 的三条未处理 P2 与 §4 的未处理发现。它们需要单独排期，不在「确定项 + 测试 + 文档」范围内。
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
- **上限说明**：报告 Top 榜上限 15 条，correctness 优先；其余 32 条已验证发现见 §4。

## 2. Top 发现（按严重度 —— 已修条目按约定删除，剩未处理 5 条）

> **标记说明**：`⏸ Deferred` = 判定成立但属架构级，单独排期（§5.1）；`⬇ 降级` = 原严重度高估，附降级理由。

### [P1] ⏸ Deferred — 跨 realm 能力启用后，旧连接写入静默绕过捕获（与上一轮 [P1] 独立复现）

- **证据**：[rxdb-adapter.ts:182-189](../../packages/rxdb/src/rxdb-adapter.ts#L182) 的能力位以「适配器实例是否挂了捕获钩子」代理且 **fail-open**；[plugin.ts:105-117](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读一次能力位，[working-tree-facade.ts:155-165](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L155) 的 `enable()` 只给发起调用的 adapter 装钩子。全仓无 BroadcastChannel / storage 事件 / 重连传播。
- **触发与影响**：Tab A、B 在能力未启用时连上同一库；A `enable()`；B 继续 `save()` / `rawQuery`——无捕获、无 stale-token 校验、无报错，B 的编辑不进工作树，随后 B 的 `commit()` 提不到这些编辑（或报 `empty_commit`）。`status()` 从库读能力位仍报告已启用，与 FR-037「已启用库上的 writer 必须被拒」相反。本轮新增证据：[entity-manager.ts:548-554](../../packages/rxdb/src/entity/entity-manager.ts#L548) 的 `notifyExternalUpdate` 同样 fail-open 绕过 `gateExternalNotify`。对应场景无任何测试。
- **修复建议**：能力状态跨连接变化时（storage 事件或轮询能力位），在旧连接下一次写之前装钩子或拒绝写入（fail-closed）；补两个真实适配器实例共享持久库的回归用例。
- **本轮处理（⏸ Deferred，D-1）**：判定复核成立，是六条顺延项里**最该先排的一条**——两份报告独立复现，且违反 FR-037。修法要引入跨连接的能力变更传播通道（BroadcastChannel / storage 事件 / 轮询），这是新的运行时机制，不是改一处判断。见 §5.1 顺延项。

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

### [P2] raw 判定第 2 步受信 intent 豁免没有生产通道

- **证据**：[capture-hook.ts:459-461](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L459) 是唯一生产构造点，传 `{capabilityEnabled, domain}` 无 `intent`；核心 [raw-write-gate.ts:45-56](../../packages/rxdb/src/capture/raw-write-gate.ts#L45) 的 `RawWriteContext`/`RawWriteGate` 签名均无 intent 槽位；9 个 `TRUSTED_CALLSITE_REGISTRY` 条目全是 `switchBranch`/`mergeChanges`，无 raw 调用点。`intent` 只在测试（capture.suite.ts:1060）被填充。
- **触发与影响**：契约（epic-006 与 adapter-contract.md §2）规定「调用携带内部受信 intent → 放行」，但生产没有任何通道能声明它；未来新增内部受信 raw 写路径会被第 4 步确定性拒绝——契约-接线缺口。
- **修复建议**：给 `RawWriteGate`/`RawWriteContext` 增加 intent 传递槽位并接入受信声明通道，或从契约中删除该豁免条款；补生产通道用例。
- **本轮未处理**：判定复核成立（前瞻性缺口，当前无生产 raw 受信调用点因此无实际泄漏）。两条修法是**互斥的方向决策**——加槽位是扩公开面，删条款是缩契约——需要先定「未来是否会有内部受信 raw 写路径」。本轮不做这个决策。

### [P2] ⏸ Deferred — bench-working-tree 相对门禁未接入 CI

- **证据**：[benchmarks/project.json:51](../../benchmarks/project.json#L51) 定义 target，但唯一基准 job（[ci-template.yml:1052-1067](../../.github/workflows/ci-template.yml#L1052)）只跑 `benchmarks:search-ci`；全仓 workflows / scripts / package.json 无任何 `bench-working-tree` 调用。契约 [benchmark-report.md §3.1](../../specs/001-working-tree-commits/contracts/benchmark-report.md) 与 tasks.md T097（标完成）均声称它是「普通 PR CI 的唯一硬门禁」。
- **触发与影响**：PR 改动落在 packages/ 或 benchmarks/（`need_benchmark=true`）时工作树测点（status/diff/commit/restore）出现相对回归会静默合入。
- **本轮处理（⏸ Deferred，D-6）+ 事实更新**：接线确实缺失。**T132 已于 2026-09-18 关闭**（`tasks.md:495`，按同日 T109 复冻的 reference 复跑 `✓ PASS`，4m0s，四项 ratio 全在 110% 内），因此「阻塞在 T132 基线复冻」的旧说法过期；但 `benchmarks/reports/working-tree-reference.json` 的 `regeneratedBecause` 仍写着「待静默后复冻」（与已关闭的 T132 不符，文案过期），且**CI 接线仍未做**——这是本条剩下的事实。

## 3. 与上一轮评审的关系

- **[P1] 跨 realm fail-open 为独立复现**：上一轮 2026-09-18 复核的 [P1]「已连接实例在另一实例启用后继续绕过捕获」与本轮 §2 第 2 条同机制；本轮新增证据（`notifyExternalUpdate` 同样 fail-open），两轮互证。
- **[P1] 丢失 changeSet 行误报**（已修）与上一轮 [P2]「检测到提交图损坏后没有持久化隔离标记」同文件相邻，是不同缺陷：上一轮讲损坏后不落盘标记，本轮讲成因分支不可达。
- **上一轮的 4 P1 + 4 P2 不在本轮 Top 榜**（如切分支不推进 activation revision、首次物化未接公开入口、切换校验与写入分属两个事务、并发受信声明互相覆盖、staging 崩溃续传、分页指纹未验证）：两轮互补，未互相证伪。
- 两轮合计：**上一轮 8 条 + 本轮 Top 15 条（其中 1 条互证）**，建议合并前统筹排期。
- **本轮复核补充**：上一轮那 4 P1 + 4 P2 已在本轮逐条复核，结论写在 `next-0912-branch-review.md` 里。两轮**去重后**真正阻塞合并的架构项是 6 条（§5.1，现剩 4 条），其余已修（已删）或降级。

## 4. 其余已验证发现（超出 Top 15 上限，原共 32 条 + 1 条 PLAUSIBLE；已修或判定不做的按约定删除，剩 15 条）

### 4.1 效率（3 条）

| 位置                                                                                                           | 摘要                                                                                                              |
| -------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| [commit-graph-guard.ts:113-116](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L113) | 每次 commit()/restore()/switch 对每个可达 commit 顺序一条 `=` 查询；commit 行已按层 `in` 批量化，changeSet 未批。 |
| [capture-runtime.ts:341-351](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L341) | 捕获热路径每变更 ~7-8 次查询（token 重验、entry 双读、状态行读+写），同事务内均可提升到批级。                     |
| [rxdb-adapter.ts:182-189](../../packages/rxdb/src/rxdb-adapter.ts#L182)                                        | 启用态 getter 每次 rawQuery 分配新 context 对象 + gate 闭包；可像禁用态那样缓存单例。                             |

### 4.2 重复 / 简化（5 条）

| 位置                                                                                                                                             | 摘要                                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [branch-commit-rows.ts:180-184](../../packages/rxdb-plugin-working-tree/src/commit/branch-commit-rows.ts#L180)                                   | `readBranchEntries` 与 [commit-command.ts:97-101](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L97) 逐字节相同；id-asc 顺序是内容指纹输入，漂移即指纹分叉。                                                                                                                                                                                                 |
| [read_current_branch_id.ts:22-42](../../packages/rxdb-adapter-sqlite-core/src/version/read_current_branch_id.ts#L22)                             | sqlite-core 双份「读当前分支」实现（另一份 with_triggers_disabled.ts:33-56），通道/列索引/报错文案各异；docstring 引用的 `#readCurrentBranchId` 不存在；pglite 只有一份。<br>**另**：本文件 25-26 行仍带 `?? 'id'` / `?? 'activated'` 列名兜底——当年修复只落在 pglite 副本，sqlite-core 这份是「无 fallback 兜底」铁律的残余违反，与 pglite 侧已修的 `read_current_branch_id.ts` 同缺陷。 |
| [working-tree-restore-session.entity.ts:12](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-restore-session.entity.ts#L12) | 存储枚举 `'conflicted'` 全库无写入点（status 从修订号推导），死值引诱未来双真源。                                                                                                                                                                                                                                                                                                         |
| 三份 use-working-tree spec（angular 648 行 / react 681 / vue 653）                                                                               | ~150 行夹具逐字三拷贝；核心 `./testing` 子路径正是共享测试支撑位，夹具可下沉。                                                                                                                                                                                                                                                                                                            |
| [commit-error-codes.spec.ts:45-48](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/commit-error-codes.spec.ts#L45)                  | 「互为全集」断言是同义反复（数组 = Object.values 同一对象）；同文件 25-37 行手写字面量才是真钉，此断言冗余。                                                                                                                                                                                                                                                                              |

### 4.3 测试缺陷（6 条）

| 位置                                                                                                                                                  | 摘要                                                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| [commit.suite.ts:1543-1555](../../packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts#L1543)                                   | discard 版本号断言拿 result 与事后重读比（同源）；删掉 +1 六后端全绿，仅 mock 场景钉住。                             |
| [metadata-only-branch-switch.spec.ts:567-570](../../packages/rxdb-plugin-working-tree/src/__tests__/version/metadata-only-branch-switch.spec.ts#L567) | staging 不变性检查读种子期旧实例；removeMany+saveMany 换行后照样绿，其余兄弟检查都重读 probe。                       |
| [capability-enable.spec.ts:111](../../packages/rxdb-plugin-working-tree/src/__tests__/commit/capability-enable.spec.ts#L111)                          | find mock 无视 where 参数恒返回种子行；读路径字段/操作符改错测试全绿，真后端才炸。                                   |
| [react use-working-tree.ts:89-95](../../packages/rxdb-plugin-working-tree-react/src/use-working-tree.ts#L89)                                          | 「命令引用跨 render 稳定」契约（25-26 行文档）无任何测试钉住；丢掉 useMemo 全 spec 绿而消费者 effect 死循环。        |
| [vue use-working-tree.spec.ts:205-214](../../packages/rxdb-plugin-working-tree-vue/src/__tests__/use-working-tree.spec.ts#L205)                       | mountWithProvider 丢弃 wrapper 且无 afterEach 卸载，~40 个组件挂满整个文件；React/Angular 两侧都有清理。             |
| 三端 a11y spec（angular:217 / react:183 / vue:183）                                                                                                   | 空 span `Number(''.trim())` 折成 0 并归档 0ms；面板初始渲染态恰为空 span，注释宣称的「读不出来直接红」只挡元素缺失。 |

### 4.4 PLAUSIBLE（1 条）

| 位置                                                                                          | 摘要                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [capture-interceptor.ts:345-354](../../packages/rxdb/src/capture/capture-interceptor.ts#L345) | uninstall 的 SAVED-miss 兜底把 install 期 bound 原语焊成自有属性，破坏 this 多态后 mergeChanges 自锁死等；机制真实但仓库内唯一调用方保证先 install 后 uninstall，风险仅外部直调/双副本场景。 |

## 5. 未处理条目的排期

### 5.1 顺延项（⏸ Deferred —— 架构级，需单独排期）

这 4 条是**当前真正阻塞合并的全部内容**，按建议优先级排（原第 3 条 `merge_branch('normal')` 双重捕获与第 5 条 diff 分页切断事务**已于 2026-09-19 修复**并按约定删除）：

1. **跨 realm 能力启用后旧连接静默绕过捕获**（§2）——两份报告独立复现，违反 FR-037，最该先排。要新增跨连接的能力变更传播通道。
2. **三个未接线的失效保护**：`bumpActivationRevision`（普通切换不推进 activation revision，A→B→A 可重用旧凭据）/ `commitBranchMaterialization`（远端分支首次物化未接公开入口）/ `markBranchCorrupted`（检测到损坏不落盘隔离标记）——三者都是「函数写好了但生产代码没有调用点」。详见 `next-0912-branch-review.md`。
3. **切换前置条件与最终写入分属两个事务**——详见 `next-0912-branch-review.md`。
4. **`bench-working-tree` 接 CI**（§2）——T132 已于 2026-09-18 按 T109 复冻基线跑 `✓ PASS`，**剩 CI 接线**；顺带把 `working-tree-reference.json` 的 `regeneratedBecause` 过期文案一并清掉。

第 5 条是本轮复核**新发现**的：**`normalizeCreateEntity` 的平行数组下标配对**（pglite `pglite.utils.ts:479-497` + sqlite-core `sqlite-core.utils.ts:482-503`，两份逐字相同）。它是已修的 `normalizeUpdateEntity` 分歧在 INSERT 侧的镜像，同一个缺陷形态——但**这一侧修不了**：核心里根本没有 `normalizeCreateEntity` 可指（只在 `entity.utils.ts:171` 的注释里被提到）。要先往 `@aiao/rxdb` 补一份 keyed 实现再让两个适配器改指，是新增核心公开导出。详见 `next-0912-branch-review.md` 的「清理与架构类」一节。

### 5.2 尚未排期

- [ ] §4.1 效率 3 条、§4.2 重复/简化 5 条、§4.3 测试缺陷 6 条、§4.4 PLAUSIBLE 1 条
- [ ] §2 里标「本轮未处理」的 3 条 P2（系统实体 namespace、StaleActiveBranchError 诊断字段、raw intent 豁免方向决策）
- [ ] D 档剩余 4 条全部落地后，本报告与 `next-0912-branch-review.md` 一并归档（`status: Resolved`）
