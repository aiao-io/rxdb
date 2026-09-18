# next-0912 分支对 main 评审

- **评审日期**：2026-09-16（2026-09-17、2026-09-18 两轮复核）
- **评审分支**：`next-0912`
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`
- **变更规模**：427 个文件，`+61,111 / -2,904`
- **评审强度**：2026-09-17 的 max 评审 + 2026-09-18 对新增代码与关键调用链的复核
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **结论**：🔴 **当前不建议合并**。2026-09-17 的 14 条核心正确性问题已处理；本轮在当前 HEAD 确认 4 条 P1、4 条 P2，其中并发受信声明原已记在旧 §3。本轮确认的问题见下方「2026-09-18 复核」；旧 §3、§4 是上一轮留下的独立待办。

## 评审基准（SHA）

| 角色             | SHA                                        | 说明                                                                                       |
| ---------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| `main` 顶端      | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | commit `feat(aiao): 拆分 rxdb 功能为 plugin (#61)`，2026-09-16 16:30 +0800                 |
| `next-0912` HEAD | `9e5ddc92cdca4c781d991a4332ef9a81aab7cf0b` | 2026-09-18 复核时的 HEAD；上一轮 HEAD 为 `263e5a31`                         |
| merge-base       | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | 与 main 顶端相同：next-0912 已把 main 合入，无分叉                                         |

- 本轮 diff 范围 = `git diff main...HEAD` 全部 427 文件（`+61,111 / -2,904`）；`main` 与 merge-base 相同。复核开始时工作区 clean，报告本身的修订不计入上述统计。
- **2026-09-17 重新对齐说明**：初版基准为 main `68b0ba97` / HEAD `e4f2813c`（337 文件）。此后 main 推进到 `de70a1a9`（即 next-0915 的插件拆包 #61），next-0912 已通过 `263e5a31` 将其合入。逐条复核后：Top 榜 15 条中 **14 条在当前树上仍然成立，1 条（原 #14）证伪**（详见 §2）；这 14 条已于 2026-09-17 全部处理，按本目录「只留尚未处理的条目」的约定从报告里删除。
- **working-tree 那套仍未进 main**——`packages/rxdb-plugin-working-tree` 尚有 115 个文件、三框架绑定另有 41 个文件只存在于本分支，因此这一轮修复赶在它进 main 之前落了地。
- 记录 SHAs 的等价命令：`git rev-parse main` / `git rev-parse HEAD` / `git merge-base main HEAD`。

## 2026-09-18 复核：合并阻塞项

本轮对公开入口、适配器事务、跨连接启用、提交图损坏处理与首次物化做跨文件追踪；检查了三端 `src/index.ts` 的实际导出。`pnpm nx test rxdb-plugin-working-tree --run --outputStyle=static --skipRemoteCache` 通过（63 文件、1013 用例；语句覆盖率 97.07%，分支覆盖率 90.41%），`git diff --check main...HEAD` 通过；**未跑全量 `pnpm test-all` 或 E2E**。这些测试没有覆盖下面的多连接时序，也没有从公开 `switchBranch()` 走首次物化。

### [P1] 已连接实例在另一实例启用后继续绕过捕获

- **证据**：[`plugin.ts:105-117`](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读一次能力位，未启用便不装钩子；[`working-tree-facade.ts:155-165`](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L155) 的 `enable()` 只给发起调用的 adapter 装钩子。无钩子的适配器写原语仍走原路径，raw-write 门也把它视为未启用。
- **触发与影响**：A、B 先后连接同一未启用的库；A `enable()`，B 不重连就 `save()`。B 的业务写入成功，但不生成 `WorkingTreeEntry`，之后的 `status()` / `commit()` 漏掉它。Local-first 多标签页是正常用法，不是损坏库才会触发。
- **改进**：能力状态跨连接变化时，在 B 的下一次写之前装钩子或拒绝旧连接继续写；增加两个真实适配器实例共享持久库的回归用例。

### [P1] 普通切分支不推进 activation revision，A→B→A 可重用旧凭据

- **证据**：[`VersionManager.ts:287-300`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L287) 直接调用 adapter 切换；两种适配器的 `switch_branch` 都只改 `RxDBBranch`。生产代码对 `bumpActivationRevision()` 的唯一调用是[`branch-materialization.ts:630`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L630)的远端首次物化屏障。
- **触发与影响**：读取 A 的 `{branchId, activationRevision}`，切 B 再切回 A；旧 revision 不变，`expectedActivationRevision` 与提交/丢弃/恢复的激活凭据误以为没有经历过切换，ABA 防护失效。
- **改进**：每次真实切换都在同一提交事务内对激活 revision 做 CAS 推进；增加 A→B→A 后旧凭据必被拒的跨适配器用例。

### [P1] metadata-only 远端分支的首次物化没有接到公开切换入口

- **证据**：`syncBranches()` 新建远端分支只写 metadata，不建 ref；[`plugin.ts:119-127`](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L119) 的切换守卫无条件调用 `assertSwitchTargetIntact()`，后者通过 `readCommitBranchRef()` 对缺 ref 抛错。[`commitBranchMaterialization()`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L583) 在生产代码没有调用点，只有测试直接调用。
- **触发与影响**：能力已启用后首次 `switchBranch(remoteId)` 永远停在缺 ref 的错误上，不会下载或物化远端快照，也不会得到契约规定的 `branch_not_materialized` 失败出口。
- **改进**：把预取、staging、复核和提交屏障接入该公开入口；图守卫仅在目标已物化时检查 ref，并补公开入口的端到端用例。

### [P1] 切换前置条件与最终写入分属两个事务

- **证据**：[`VersionManager.ts:287-300`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L287) 先在只读事务校验 `requireClean` / `expectedActivationRevision`，随后异步计算 actions，再把**只有** `{branchId, actions}` 的对象交给适配器；SQLite 和 PGlite 的最终切换事务均未接收或复核这些条件。
- **触发与影响**：校验后另一个连接写脏当前工作树或切换了 active 分支，本次调用依旧可以提交用旧状态计算的投影；调用方显式提出的前置条件不再成立。即使修好上一条 revision 不递增，此窗口仍独立存在。
- **改进**：让条件随切换请求进入最终事务，在业务投影写入前于同一事务复核，并让 CAS 落败回滚整次切换。

### [P2] 分页 staging 没有真正的崩溃续传路径

- **证据**：[`stageBranchMaterialization():338-353`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L338) 用同一个传入的 executor 写头行、全部分页和 `staged`；真实进程在中途崩溃会回滚整个事务。测试为保留半份分页，是在事务体**内部捕获异常**后正常提交；[`findResumableMaterializationAttempt():705-706`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L705) 虽返回 `nextPageIndex`，写入函数却始终从页 0 开始并重插相同 `attemptId` 的头行。
- **触发与影响**：网络错误向外传播或进程崩溃后无法从上次落盘页继续；已存在 pending attempt 时直接重试会撞主键。
- **改进**：把头行和每页放在独立可提交事务，提供从既有 attempt 的页号追加分页、最后单独置 `staged` 的入口；用真正的事务回滚/重启测试续传。

### [P2] 检测到提交图损坏后没有持久化隔离标记

- **证据**：[`assertCommitGraphIntact()`](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L198) 只读并抛错；[`markBranchCorrupted():230`](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L230) 是唯一把 ref 置为 `corrupted_read_only` 的函数，但生产代码没有调用它，只有测试直接调用。
- **触发与影响**：某个可达 commit 内容或父链损坏时，`commit()` / `restore()` / switch-to 会报错，但 ref 一直保持 `ok`，每次重试重新扫整张图，`corruptedAt` 诊断也永远缺席。当前 `status()` API 不返回 `branchStatus`，不要误写成「status 显示 ok」。
- **改进**：捕获 `CommitGraphCorruptedError`，在失败事务回滚后另开事务调用 `markBranchCorrupted()`；测试要从真实公开入口触发，而不是先手动标记。

### [P2] adapter 级受信声明在并发 merge 中互相覆盖

- **证据**：[`trusted-write-scope.ts:68-103`](../../packages/rxdb/src/trusted-write/trusted-write-scope.ts#L68) 的 WeakMap 每个 adapter 只存一条声明；[`capture-hook.ts:366-383`](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L366) 的 `interceptMergeChanges()` 排队取得事务后才消费声明。`merge_branch` 的 squash 与 `restore_entity` 都先在同一个 adapter 上声明再调用 `mergeChanges()`。
- **触发与影响**：两个调用并发排队时，后声明覆盖前声明；先执行的操作可能拿错意图，后执行者因无声明被 `WorkingTreeWriteRejectedError` 拒绝。`switchBranch` 在调用钩子时同步消费，不属于这个竞态。
- **改进**：把声明绑定到单次调用或事务上下文，不以共享 adapter 对象充当待消费槽；增加两条 adapter 级 `mergeChanges()` 并发用例。

### [P2] 首次物化未验证分页 payload 的指纹

- **证据**：[`assertStagingUsable():441-463`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L441) 只校验状态、页数、水位和 scope；存下的 stage/page `fingerprint` 没有在屏障前用于内容验证，页号也未验证从 0 连续。
- **触发与影响**：staging 中某页 payload 被改变、缺页后被不同页数补齐，屏障仍将它交给 `applyPage` 并宣布物化成功。唯一索引保证不重复页号，不保证页号连续或内容正确。
- **改进**：在任何 `applyPage` 前复算并核对分页内容指纹、冻结意图指纹及连续页序；加入篡改 payload/页序的拒绝用例。

**三端核对**：Angular、React、Vue 的 `src/index.ts` 均导出 `useWorkingTree` 和 `WorkingTreeResource`；命令共用 `createWorkingTreeCommands()`，本轮未发现公开导出缺端。此结论不抵消上述核心写入/切换问题。

## 1. 范围与方法

核心区域：

| 区域                               | 内容                                                                                                                                                                                                      |
| ---------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/rxdb/src`                | capture 拦截器、raw-write-gate、trusted-write、插件系统、sha256 / sql-literal、capability 水印、active-branch-guard、version 切换逻辑重写                                                                 |
| `rxdb-plugin-working-tree`（新包） | commit 图（CAS / codec / 指纹）+ working-tree（捕获钩子 / 冷重放 / 判断矩阵）约 8k 行源码，115 个文件                                                                                                     |
| `rxdb-plugin-history`              | main 的 #61 把历史 / 分支 / 合并从 core 拆到此包；本分支在其上再改 17 个文件（`merge-branch` / `undo-redo-apply` / `switch-branch-actions` / `restore-entity`）。**#1 的生产调用点现在在这里，不在 core** |
| 三框架绑定（新包）                 | Angular / React / Vue 的 `useWorkingTree`，41 个文件                                                                                                                                                      |
| 6 个存储适配器                     | pglite / sqlite-core / wa-sqlite / sqlite / sqlite-wasm / sqliteai / electron：switch_branch、system schema 迁移、一致性套件                                                                              |
| `scripts/audit`                    | 四个新审计脚本（core 边界、需求一致性、callsite 漂移、套件调用点）+ 发布门                                                                                                                                |

**流程**：16 个 finder agent × 10 个角度（逐行 ×5 区域、删除行为审计、跨文件追踪 ×3、语言陷阱、包装器正确性、复用、简化、效率、根因深度、规范）产出 74 条候选 → 去重后经 8 个验证 agent 逐条裁决（CONFIRMED / PLAUSIBLE / REFUTED）→ 1 个查漏 agent 补充 3 条新发现 → 2026-09-17 在新基线上逐条复核。

**2026-09-17 当时的结论**：14 条 CONFIRMED 正确性发现（已全部处理）。当时最突出的系统性问题是：**捕获层的实体身份解析损坏、系统实体隔离失效、以及多处「写了但没接线」的失效保险**——三者都已修复并接线。2026-09-18 的新发现和当前合并结论以上文复核章节为准。

## 2. 被证伪的候选（无需处理，记录防复提）

- **原 #14「`diff({entities:[]})` 拼出 `IN ()` 语法错误」——REFUTED（2026-09-17 复核）**。两个后端都对空数组做了短路：
  [`query_sql.utils.ts:584`](../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.utils.ts#L584) 把空 `in`/`notIn` 编译成 `1 = 0` / `1 = 1`，
  [`query_sql.ts:294`](../../packages/rxdb-adapter-pglite/src/query/query_sql.ts#L294) 同样返回 `1=0` / `1=1`（注释：「避免 `IN (NULL)` 的错误语义」）。
  `diff({entities:[]})` 返回空集，语义正确，不崩。
- **restore-session 实体的 `activeKey` 列级唯一约束「全局唯一」判定**——`activeKey` 的值就是 branchId（非终态时 = branchId，committed 时置 null），列级唯一恰好实现「每分支至多一个未结束会话」语义，不是缺陷。
- **修正**：双重捕获（#2）的「origin 被覆盖成 local / push echo」子断言不成立——现有路径内外两次捕获的 origin 都是 local，真实危害是重复条目 + revision 双跳；且因 #1 的存在，外层捕获（裸 ID）根本不与内层条目（`'rxid1'`）折叠，而是各写各的。
- **修正**：capability 水印盲区（旧 watermark 4/5 库被无插件客户端打开）的触发条件仅限**从未发布的 dev 构建**创建的库；且「被移除的旧全局版本门」归属有误——旧门本来就只拒「库比进程新」，真正移出 core 的是严格相等的能力三元断言。代码在 [`migration.ts:36-38`](../../packages/rxdb/src/system/migration.ts#L36) 自己承认了这个缺口。

## 3. 次要发现（验证通过但未进 Top 榜）

| 位置                                                                                                                                                                                                                                          | 缺陷                                                                                            | 验证结论与触发条件                                                                                                                                                                                                                                                                                                                          |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [read_current_branch_id.ts:38-39](../../packages/rxdb-adapter-pglite/src/version/read_current_branch_id.ts#L38)                                                                                                                               | `metadata.propertyMap?.get('id')?.columnName ?? 'id'` 元数据缺失时静默兜底裸列名                | CONFIRMED（**违反「无 fallback 兜底」铁律**）：本仓 `write-commit.ts` 的 `columnOf` 明确拒绝的正是这个形态（「列名一旦被改，兜底会拼出一条语法正确、却永远匹配不到任何行的 UPDATE」），且同包 [`migrate_system_schema.ts:87-89`](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L87) 对同样场景是抛错。从清理类提级 |
| [activation-state.ts:144](../../packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L144)                                                                                                                                  | `allocateBranchGeneration` 读-改-写无 CAS，两连接可发出相同分支代际 → 同 operationId 撞唯一索引 | PLAUSIBLE：rollback-journal 模式静默丢失更新；WAL/OPFS 下是响亮的 `SQLITE_BUSY_SNAPSHOT`；PGlite 无跨进程共享                                                                                                                                                                                                                               |
| [migrate_system_schema.ts:146](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L146)                                                                                                                                   | 零 active 且无 main 行时恢复 UPDATE 静默 no-op，水印照写提交                                    | PLAUSIBLE：状态难以到达（remove_branch 拒删 main），且 pull 路径会先走 resolve 自愈；sqlite 侧注释称该 no-op 为刻意设计                                                                                                                                                                                                                     |
| [testing.ts:180](../../packages/rxdb-adapter-pglite/src/testing.ts#L180)（sqlite-core 同）                                                                                                                                                    | `cleanup_db` 清库后不恢复插件单例行                                                             | PLAUSIBLE：代码注释承认是刻意取舍并计划加「由调用方传入初始行」入口；当前仓内无触发路径                                                                                                                                                                                                                                                     |
| [capture-hook.ts:358](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L358)                                                                                                                                          | raw-write 判定从不传入 intent，step 2 受信放行是死代码                                          | CONFIRMED（前瞻性）：当前注册表无 rawQuery 调用点，但管道结构上无法携带 intent                                                                                                                                                                                                                                                              |
| [commit-graph-guard.ts:238](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L238) / [commit-capability.ts:216](../../packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L216)                         | `corruptedAt` / `enabledAt` 用客户端时钟                                                        | CONFIRMED：违反本子系统自己的 DB 时钟规则（`write-commit.ts:284` 明确禁止）；时钟偏斜产生误导性诊断时间戳                                                                                                                                                                                                                                   |
| [use-working-tree.ts:130](../../packages/rxdb-plugin-working-tree-angular/src/use-working-tree.ts#L130)（React/Vue 同）                                                                                                                       | 三框架 hook 不校验 `workingTree` 存在性直接传给命令构造器                                       | CONFIRMED：未装插件时 hook 返回全 idle 状态，首个命令调用抛裸 TypeError，而非文档承诺的创建期拒绝                                                                                                                                                                                                                                           |
| [switch_branch.ts:203](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L203)                                                                                                                                             | switch_branch 把事务体所有错误重新包装成 `RxDBAdapterSqliteError`                               | CONFIRMED（状态级不一致）：与分支新加的 rethrow-as-is 契约（`RxDBAdapterSqliteBase.ts:1364-1375`）自相矛盾；pglite 侧包装成另一个类，两端 `instanceof` 领域错误都失败                                                                                                                                                                       |
| [RxDBAdapterSqliteBase.ts:620](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L620)                                                                                                                                     | 迁移重建的变更触发器不传 branchId，回落 `'main'`，而 pglite 侧读 active 分支传入                | CONFIRMED（不对称，损失窗口窄）：默认事务每次会按真实当前分支重建触发器自愈；仅绕过事务日志的窗口期写入会被标错分支                                                                                                                                                                                                                         |
| [migrate_system_schema.ts:111](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L111)（sqlite-core:155 同）                                                                                                             | 旧库含 2+ 行 `activated=true` 时迁移抛错，connect 永久失败，无库内恢复路径                      | CONFIRMED（有意的 FR-048 行为）：旧 schema 无约束允许该状态，守卫文档明确「不挑一个留下」；升级即无法打开库                                                                                                                                                                                                                                 |
| [core-plugin-boundary.mjs:71](../../scripts/audit/core-plugin-boundary.mjs#L71) / [126](../../scripts/audit/core-plugin-boundary.mjs#L126)、[working-tree-suite-callsites.mjs:185](../../scripts/audit/working-tree-suite-callsites.mjs#L185) | 审计脚本另 3 个解析缺陷                                                                         | CONFIRMED（已实测）：字符串字面量里的 `from '…'` 被当 import；嵌套 `__tests__` 目录被扫进边界门；`if (cond) /['"]/` 正则字面量导致词法器清空文件其余部分                                                                                                                                                                                    |

## 4. 清理与架构类发现

**判定图例**：✅ 值得做 ｜ ❌ 不值得做（附理由，防复提）｜ ⚠️ 需澄清（前置决策未定，不要直接开工）

### 4.1 复用（重复实现）

| 判定 | 位置                                                                                                 | 内容与理由                                                                                                                                                                                                                              |
| ---- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [migration.ts:133](../../packages/rxdb/src/system/migration.ts#L133)                                 | `isUniqueConstraintViolation` 三份实现（core / sqlite-core / [pglite-keyring-storage.ts:57](../../packages/rxdb-adapter-pglite/src/keyring/pglite-keyring-storage.ts#L57) 内联），keyring 版缺 `23505` 分支——已是正确性缺陷，不只是复用 |
| ✅   | [sql-literal.ts:43](../../packages/rxdb/src/system/sql-literal.ts#L43)                               | SQL 标识符/字符串引号工具共 3 份副本（core 新写 + pglite.utils + sqlite-core.utils），**NUL 处理策略已分歧**——分歧即缺陷                                                                                                                |
| ✅   | [pglite.utils.ts:503](../../packages/rxdb-adapter-pglite/src/pglite.utils.ts#L503)                   | `normalizeEntity` 逐行复制 core `normalizeUpdateEntity`（sqlite-core 是 re-export）；**两份副本已分歧**（readonly FK 过滤不同）                                                                                                         |
| ✅   | [switch-result.utils.ts](../../packages/rxdb-adapter-pglite/src/version/switch-result.utils.ts#L127) | 约 300 行 switch 结果 SQL 脚手架跨 pglite / sqlite-core 复制，注释自承「两家在这一格上必须长得一样」，但 `hasNoWritableColumn` 已调用不同 normalizer——「两端各写一遍、写着写着就分岔」的同一根因                                        |
| ⚠️   | 各 adapter `__tests__/*-factory.ts`                                                                  | 6 个测试工厂复制同一骨架（QueryCounting 子类、WeakMap、插件先于 connect 的顺序规则仅靠复制的注释维系）——抽取需先定 `@aiao/rxdb-test` 的边界，与 next-0915 的同类债务同源，应一起排期                                                    |
| ⚠️   | [testing.ts:219](../../packages/rxdb-adapter-pglite/src/testing.ts#L219)                             | `cloneEntityClasses` 逐字复制 sqlite-core 版，走 `ɵMetadata` 内部符号——共享前先决定该内部符号是否要转正为受支持入口                                                                                                                     |
| ⚠️   | [test-utils.ts:55](../../packages/rxdb-adapter-sqlite-core/src/__tests__/test-utils.ts#L55)          | `cleanup_db` 重复实现 `@aiao/rxdb-test` 的 `cleanupSqliteTestAdapter`——同上，依赖 `rxdb-test` 边界先定                                                                                                                                  |

### 4.2 简化（冗余状态与复制粘贴）

| 判定 | 位置                                                                                                                                                                                                                  | 内容与理由                                                                                                                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [branch.ts:50](../../packages/rxdb/src/system/branch.ts#L50)                                                                                                                                                          | `activeKey` 是 `activated` 的第二份拷贝（`activated ? '*active*' : null`），约 10 处生产写点手工共写，每处都带「漏写一处就绕过唯一约束」注释；生成列或部分唯一索引可一处编码不变量                                                                                                                                                      |
| ✅   | [bulk-write-gate.ts:20](../../packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L20)                                                                                                              | `BulkWriteOperation` 重声明 core 的 `InterceptedBulkWrite` + 三张按操作键的查找表；**类型漂移无编译错误**——是静默失效风险，不只是重复                                                                                                                                                                                                   |
| ✅   | `columnOf`                                                                                                                                                                                                            | 同一 helper 三份副本（commit-capability / write-commit / working-tree-state-sql），仅错误消息不同——低成本合并                                                                                                                                                                                                                           |
| ✅   | [commit-graph-guard.ts:168](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L168)                                                                                                            | `nextParents` 与 [`list-commits.ts:124`](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L124) 的 `nextFrontier` 字节级相同，同包内应导入而非重定义                                                                                                                                                                  |
| ⚠️   | `MAIN_BRANCH_ID = 'main'`                                                                                                                                                                                             | 3+ 包重复声明 + 裸字面量，各带「与其他一致」注释——跨包共享常量会新增静态 import，Nx 图插件会据此生成依赖边并可能成环，须先确认放在哪个包不会破坏 `run-many`                                                                                                                                                                             |
| ⚠️   | [migrate_system_schema.ts:80](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L80) / [RxDBAdapterSqliteBase.ts:126](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L126) | 约 90 行 activeKey 回填序列跨两后端复制（仅方言差异），且两端的语句收集协议也不同（逐个执行 vs `---STATEMENT_SEPARATOR---` 拼接）——抽取前要先统一语句收集协议，否则抽出来的只是壳                                                                                                                                                       |
| ❌   | [sha256.ts](../../packages/rxdb/src/system/sha256.ts)                                                                                                                                                                 | **不要换成依赖**。文件头已论证：`crypto.subtle.digest` 是异步的且只在 secure context 可用；`node:crypto` 不能进浏览器；`@aiao/utils` 的实现同样是异步的；而指纹写在不可变提交历史里，算法一旦更换无法回溯。151 行实现本身经核验正确，唯一消费者是 [`index.ts:139`](../../packages/rxdb/src/index.ts#L139)。此条为净负面建议，记录防复提 |
| ❌   | [rxdb-plugin-system.ts:47](../../packages/rxdb/src/rxdb-plugin-system.ts#L47)                                                                                                                                         | 单字段 context 包装对象——文档已给出「以后加字段」的理由，拆掉是反向重构，收益为零。记录防复提                                                                                                                                                                                                                                           |

### 4.3 效率

| 判定 | 位置                                                                                                       | 内容与理由                                                                                                                                                                                                                                                                                                           |
| ---- | ---------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [commit-graph-guard.ts:199](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L199) | 每次 commit/discard/switch 全量重验整张可达提交图（[`commit-command.ts:239`](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L239) 无条件调用）：每提交一次顺序查询 + 全部变更单元重哈希，1 万提交时每次保存 O(N) 查询——图是只追加的，可持久化「最后已验证 HEAD」水位。**本节最高收益项** |
| ✅   | [capture-runtime.ts:245](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L245) | 每个被捕获变更重读 active-branch token（同事务里上一行刚读过）：一实体一写 4 次查询，M 实体 2M 次冗余查询——捕获热路径                                                                                                                                                                                                |
| ✅   | [capture-runtime.ts:254](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L254) | `persistEntry` 重复 `readEntry` 刚做过的 findEntry 唯一索引查询；`bumpWorkingTreeRevision` 每变更读/写一次状态行而非每批一次——同上，热路径                                                                                                                                                                           |
| ✅   | [list-commits.ts:158](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L158)             | 线性历史下 BFS 每层一次往返 = 每提交一次顺序查询；`idx_commit_first_parent` 索引与批量 `in` 查询已存在却未用——改动小、收益直接                                                                                                                                                                                       |
| ✅   | [RxDB.ts:1692](../../packages/rxdb/src/RxDB.ts#L1692)                                                      | 每次 connect 约 14 次顺序 `isTableExisted` 探测（系统实体）——每次 connect 都付，可一次元数据查询批量取回                                                                                                                                                                                                             |
| ⚠️   | [status.ts:152](../../packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L152)                   | 两个顺序 `COUNT(*)` 而非一个 `GROUP BY origin`；三框架 hook 每次 commit/discard/enable 后都自动调 status——单次收益很小，是否值得改取决于 hook 的自动调用频次是否要收敛                                                                                                                                               |
| ⚠️   | [write-commit.ts:374](../../packages/rxdb-plugin-working-tree/src/commit/write-commit.ts#L374)             | `writeCommit` / `readCommitLogPage` 在同一事务里二次读取刚读过的 CommitBranchRef 行——同事务内重复读代价低，收益边际                                                                                                                                                                                                  |

### 4.4 根因深度

| 判定 | 位置                                                                                                               | 内容与理由                                                                                                                                                                                                                                                                                                           |
| ---- | ------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [versioned-domain.ts:234](../../packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L234)       | 插件用 `'$'` 字符串拼接重建各后端物理表名（复制 sqlite-core 的命名规则），而非由拥有命名规则的适配器暴露解析——命名规则一变，raw-write 门对受版本表静默放行（文件注释自承「漏登记的后果是静默放行」）。**与已修的系统实体域判定同根因**：那一条是身份按裸名匹配，这一条是表名靠字符串重拼，都是「把别人的规则抄一份」 |
| ✅   | [capture-mount-points.ts:60](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-mount-points.ts#L60) | 挂载点注册表第三处编码 core 的原语清单（参数名序列靠源文本 spec 对齐），且运行时从不调用——漏改只会在测试里响。**与上一条同根因**                                                                                                                                                                                     |
| ✅   | [active-branch-guard.ts:95](../../packages/rxdb/src/system/active-branch-guard.ts#L95)                             | 错误码字符串 core 与 plugin 各一份，靠「钉住两者的测试」维系——只修一边则 catch 分支匹配不到。单源化成本极低                                                                                                                                                                                                          |
| ✅   | [switch_branch.ts:78](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L78)                    | 分支翻转修复与 activeKey 回填按后端各写一遍，且两端修复同一根因（多语句 RETURNING 丢行）用了不同机制——与 §4.1 的 switch-result 脚手架复制同属跨后端对称问题，应合并处理                                                                                                                                              |
| ⚠️   | [trusted-write-scope.ts:77](../../packages/rxdb/src/trusted-write/trusted-write-scope.ts#L77)                      | 受信写标记是公开导出的自报（文件·符号·意图）字符串键，运行时只查表不校验调用方；唯一机械校验是词法审计脚本且只扫 `packages/`——第三方适配器可仿冒已注册键让写入无条件受信。深层修复（意图做成写入原语选项上的结构化字段）是大改，**先定「第三方适配器是否在威胁模型内」再动**                                         |
| ⚠️   | [active-branch-guard.ts:47](../../packages/rxdb/src/system/active-branch-guard.ts#L47)                             | `'*active*'` 哨兵与用户数据同命名空间，安全性仅靠「`*` 不是合法分支 ID」的注释级约定，无任何创建/导入路径校验——同属威胁模型问题，与上一条一起定                                                                                                                                                                      |
| ⚠️   | [working-tree-callsite-drift.mjs:68](../../scripts/audit/working-tree-callsite-drift.mjs#L68)                      | 审计脚本硬编码接收者变量名/文件名清单与运行时闸门策略重复——变量一改名就要改脚本，包外代码又完全扫不到。根治要换成类型/AST 级校验，与下一条一起评估                                                                                                                                                                   |
| ⚠️   | [working-tree-callsite-drift.mjs:324](../../scripts/audit/working-tree-callsite-drift.mjs#L324)                    | 漂移扫描器用字段顺序正则重新解析 TS 里的受信注册表（第二份编码）——无害格式化改动即断 CI，或部分匹配静默审计旧形状。**「词法扫描器当门禁」的系统性问题**：套件调用点那份脚本这一轮已按括号深度加固（顶层调用 + 修饰符只认包住调用点的那个），但两份脚本都还停在词法层，建议一次性决定是否全面改用 AST                 |

### 4.5 规范符合性（CLAUDE.md / AGENTS.md）

- **[AGENTS.md:36 / CLAUDE.md:69](../../AGENTS.md)「ESLint 零警告，禁止忽略警告」**：4 处新增 `// eslint-disable-next-line @nx/enforce-module-boundaries`（[trusted-callsite-registry.spec.ts:61](../../packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts#L61)、[capture-mount-points.spec.ts:35](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/capture-mount-points.spec.ts#L35)、[trusted-callsite-capture.spec.ts:26](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/trusted-callsite-capture.spec.ts#L26)、[write-entry-matrix.spec.ts:47](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/write-entry-matrix.spec.ts#L47)）——均为跨包读 `specs/` 契约原文或核心源码 `?raw`。**判定 ❌ 不改**：均为单行、有注释理由的定向抑制，lint 仍报零警告，属「字面违反禁令、实质争议」。
- 「无 fallback 兜底」的实质违反项（`read_current_branch_id.ts`）已提级至 §3。

## 5. 剩余项与优先级建议

> 2026-09-17 的 8 条 P1 + 6 条 P2 已处理并从报告删除；2026-09-18 复核又确认 4 条 P1 + 4 条 P2。以下按当前风险排序。

1. 先处理本轮 4 条 P1：跨连接启用绕过捕获、切换时 activation revision 不递增、远端分支首次物化未接线、切换条件与最终写入的事务窗口。
2. 再处理本轮 4 条 P2：staging 崩溃续传、损坏图持久隔离、并发受信声明覆盖、物化分页指纹校验。
3. 复核 §3 的 11 条次要项；其中 `read_current_branch_id` 静默兜底、错误重包装契约、三框架 hook 校验与客户端时钟问题优先确认影响。
4. §4.4 打 ✅ 的四项：表名解析归属适配器、挂载点清单单源、错误码单源、跨后端脚手架共享。
5. §4.4 打 ⚠️ 的四项需先定第三方适配器威胁模型，以及词法扫描门禁是否改用 AST；§4.1–4.3 打 ✅ 的优化再按成本收益排期。
