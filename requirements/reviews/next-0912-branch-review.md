# next-0912 分支对 main 评审

- **评审日期**：2026-09-16（2026-09-17、2026-09-18、2026-09-19 多轮复核；最新第四次复核为 2026-09-19）
- **评审分支**：`next-0912`
- **对比基线**：`main` 顶端 = merge-base `de70a1a9e1c6d89eabb26606a294a80690d29b3b`
- **变更规模**：494 个文件，`+69,417 / -3,107`
- **评审强度**：2026-09-17 的 max 评审 + 2026-09-18、2026-09-19 对关键调用链和后续增量的复核
- **主线改动**：epic-006「工作树 + 提交历史」——捕获钩子 / 原始写闸门 / 受信写声明 / 提交图 CAS + 编解码 + 指纹 / 冷重放
- **本次第四次复核**：2026-09-19，基线 `de70a1a9` → `cef3abf0`；重新检查全部 494 个差异文件，确认 5 条既有 P1、1 条既有 P2 仍成立，并新增 1 条 P1 与 1 条 P2（见下方「第四次复核」）。
- **当前结论**：🔴 **不建议合并**。6 条 P1 可由正常跨连接、切换、合并或 Demo 操作触发；测试通过不能替代这些组合时序与乱序请求的回归用例。本报告另有 6 条 P2 与其他待办。
- **上一轮结论（HEAD `fc30f1da`，存档）**：🔴 **不建议合并**。当时已有 5 条 P1 + 5 条 P2 未处理。

## 评审基准（SHA）

| 角色             | SHA                                        | 说明                                                                       |
| ---------------- | ------------------------------------------ | -------------------------------------------------------------------------- |
| `main` 顶端      | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | commit `feat(aiao): 拆分 rxdb 功能为 plugin (#61)`，2026-09-16 16:30 +0800 |
| `next-0912` HEAD | `cef3abf01ba344b7517967fc2dcf1034a7640236` | 本次第四次复核的 HEAD；第三次评审为 `fc30f1da`                             |
| merge-base       | `de70a1a9e1c6d89eabb26606a294a80690d29b3b` | 与 main 顶端相同：next-0912 已把 main 合入，无分叉                         |

- 本次 diff 范围 = `git diff main...HEAD` 全部 494 文件（`+69,417 / -3,107`）；`main` 与 merge-base 相同。评审开始时工作区干净，本轮只改动本报告及其索引。
- **2026-09-17 重新对齐说明**：初版基准为 main `68b0ba97` / HEAD `e4f2813c`（337 文件）。此后 main 推进到 `de70a1a9`（即 next-0915 的插件拆包 #61），next-0912 已通过 `263e5a31` 将其合入。逐条复核后：Top 榜 15 条中 **14 条在当前树上仍然成立，1 条（原 #14）证伪**（详见 §2）；这 14 条已于 2026-09-17 全部处理，按本目录「只留尚未处理的条目」的约定从报告里删除。
- **working-tree 那套仍未进 main**——`packages/rxdb-plugin-working-tree` 尚有 115 个文件、三框架绑定另有 41 个文件只存在于本分支，因此这一轮修复赶在它进 main 之前落了地。
- 记录 SHAs 的等价命令：`git rev-parse main` / `git rev-parse HEAD` / `git merge-base main HEAD`。

## 2026-09-19 第四次复核：当前合并结论

本轮重新审阅 `main...HEAD` 全部 494 个差异文件，并重点追踪能力启用、写入捕获、分支切换、远端首次物化、`normal` 合并、三端异步状态与 Angular Demo 操作链。Angular / React / Vue 均导出 `useWorkingTree`、`WorkingTreeResource`，并共享 `createWorkingTreeCommands`，三端公开 API 对称。

验证结果：

- `git diff --check main...HEAD` 通过。
- `pnpm nx run-many -t lint typecheck test -p rxdb-plugin-working-tree rxdb-plugin-working-tree-angular rxdb-plugin-working-tree-react rxdb-plugin-working-tree-vue dev-rxdb-angular --output-style=static --parallel=4 --skipRemoteCache` 通过，共 78 个 Nx 任务。
- `pnpm test-scripts` 通过，共 320 个测试。
- 未跑完整 `pnpm test-all` 和浏览器 E2E；现有测试没有覆盖下面的多连接、跨事务、ABA、请求乱序和事务分页边界。

本轮确认 6 条 P1 与 2 条重点 P2。前五条 P1 与事务分页 P2 在第三次复核中已存在；行级 discard 和异步状态乱序是本轮新增。报告下文另有 4 条既有 P2 与其他待办，均未因本轮验证通过而解除。

### [P1] 已连接实例在另一实例启用后继续绕过捕获

- **证据**：[`plugin.ts:105-117`](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读取一次能力位；未启用时不安装捕获 hook。[`working-tree-facade.ts:156-166`](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L156) 的 `enable()` 只给发起调用的 adapter 安装 hook。[`rxdb-adapter.ts:182-188`](../../packages/rxdb/src/rxdb-adapter.ts#L182) 又把是否存在 hook 当成 raw write 能力状态。
- **触发与影响**：A、B 在能力未启用时连接同一持久库；A 调用 `enable()` 后，B 无需重连便可继续 CRUD 或 raw write。业务写成功，但不生成 `WorkingTreeEntry`，`status()` / `commit()` / `discard()` 都看不到它。
- **修复要求**：能力启用必须对所有存量连接可见；B 在下一次写事务开始前必须安装 hook 或拒绝写入。增加两个真实 adapter 实例共享同一持久库的回归用例。

### [P1] 切分支前置条件与最终提交存在 TOCTOU

- **证据**：[`VersionManager.ts:287-300`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L287) 先调用 `#assert_branch_switchable()`，再计算 actions，最后调用 adapter。[`VersionManager.ts:490-503`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L490) 显示前置条件运行在独立只读事务中；[`rxdb-adapter.ts:60-72`](../../packages/rxdb/src/rxdb-adapter.ts#L60) 的 `SwitchBranchOptions` 只有 `{branchId, actions}`，最终事务拿不到 `requireClean` 或 `expectedActivationRevision`。
- **触发与影响**：校验结束后，另一连接可写脏当前工作树或切换 active 分支；本次调用仍会提交基于旧状态计算的投影。调用方显式提出的前置条件只是瞬时检查，不是提交条件。
- **修复要求**：把前置条件传入 adapter，在最终切换事务内、任何投影写入前复核；CAS 落败必须回滚整次切换。

### [P1] 普通切分支不推进 activation revision，ABA 防护失效

- **证据**：[`VersionManager.ts:297-300`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L297) 的普通切换没有传入或推进 revision；SQLite 的最终事务在 [`switch_branch.ts:153-195`](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L153) 只应用 actions 和翻转 active 分支。生产代码对 `bumpActivationRevision()` 的唯一调用位于 [`branch-materialization.ts:630`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L630)。
- **触发与影响**：读取 A 的 `{branchId, activationRevision}`，切到 B 再切回 A；旧 token 再次完全匹配。迟到的提交、丢弃、恢复或捕获写入会被当成仍属于当前激活代际。
- **修复要求**：每次真实分支切换都在最终事务内 CAS 推进 activation revision，并增加 A→B→A 后旧 token 必须失败的跨 adapter 用例。

### [P1] metadata-only 远端分支无法通过公开入口首次物化

- **证据**：[`sync-branches.ts:143-153`](../../packages/rxdb-plugin-sync/src/sync-branches.ts#L143) 只创建远端分支 metadata，不创建 `CommitBranchRef`。[`plugin.ts:119-127`](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L119) 在公开切换前无条件调用图完整性守卫，最终由 `readCommitBranchRef()` 对缺 ref 抛错。`stageBranchMaterialization()` / `commitBranchMaterialization()` 在生产代码中没有调用者。
- **触发与影响**：同步到一条新远端分支后，第一次 `switchBranch(remoteId)` 必然停在缺 ref 错误，不会进入下载、staging 或物化屏障。
- **修复要求**：公开切换入口先分类目标分支；metadata-only 分支接入预取 → staging → 复核 → 提交屏障，只有已物化目标才执行提交图完整性检查。

### [P1] `normal` 合并在同一事务内重复捕获

- **证据**：[`merge-branch.ts:118-141`](../../packages/rxdb-plugin-history/src/merge-branch.ts#L118) 在外层 `adapter.transaction()` 中逐条调用 `executor.mergeChanges()`。内层 merge hook 在 [`capture-hook.ts:357-369`](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L357) 已捕获一次；外层 transaction hook 又在 [`capture-hook.ts:338-346`](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L338) 按原水位线读取并捕获相同业务变更。
- **触发与影响**：实体唯一索引会折叠重复行，但 `workingTreeRevision` 多推进一次，原先逐条捕获的 `unitId` / `transactionId` / `origin` 被外层整批捕获覆盖。
- **修复要求**：同一业务写只能由一个挂载点负责捕获；标记外层事务、传递已消费水位或改成一次批量捕获，并用真实 adapter 断言 revision 和分组身份只变化一次。

### [P1] Angular 行级 Discard 实际丢弃整个工作树

- **证据**：[`working-tree.page.ts:309-327`](../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.ts#L309) 在单条 diff 行上展示 `Discard Changes` 并保存目标实体；[`working-tree.page.ts:364-371`](../../apps/dev-rxdb-angular/src/app/pages/working-tree/working-tree.page.ts#L364) 随后丢弃目标，直接调用全量 `runDiscard()`。核心 [`working-tree-facade.ts:241-243`](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L241) 只支持整棵工作树 discard。
- **触发与影响**：存在多条未提交改动时，用户右键其中一行会在无明确全量提示的情况下删除全部改动。现有 E2E 只使用一条改动，反而把误导行为编码成正常路径。
- **修复要求**：实现真正的 selection discard，或删除行级菜单，将全量操作改名为 `Discard All Changes` 并增加确认；补两条以上改动的防误删 E2E。

### [P2] 共享查询状态会被迟到请求覆盖

- **证据**：[`async-state.ts:232-245`](../../packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L232) 每次查询都直接向同一 sink 发出 `loading → success | empty | error`，没有 request generation 或 latest guard。[`working-tree-commands.ts:227-232`](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-commands.ts#L227) 的所有 `commitChanges()` 调用共享同一个 `commitChangesState`。
- **触发与影响**：用户快速选择提交 A、B，若 B 先完成、A 后完成，最终选中标题是 B，详情状态却被 A 的迟到结果覆盖。共享 commands 使 Angular / React / Vue 三端都受影响。
- **修复要求**：每个状态槽维护单调请求代际，只允许最新请求提交终态；补后发先完成和旧请求失败晚到两类测试。

### [P2] transaction 粒度 diff 分页切断原子组

- **证据**：[`diff.ts:173-190`](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L173) 先按 entry 的 `limit` 截断，[`diff.ts:242-252`](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L242) 才按 `transactionId` 分组。三条同事务记录配 `limit: 2` 时，两页各返回一个同 ID 的半组。
- **触发与影响**：按组渲染会把一个原子操作展示成两组；消费者若按 `transactionId` 跨页去重，可能漏掉后一页数据。
- **修复要求**：按事务边界分页，或把跨页延续状态纳入公开协议；补同一事务跨越 limit 边界的回归用例。

## 2026-09-18 第三次复核：当前合并结论

本轮对 `main...HEAD` 的公开写入、跨连接启用、分支切换、远端首次物化和 `normal` 合并调用链重新追踪。`pnpm nx run rxdb-plugin-working-tree:test --run --outputStyle=static --skipRemoteCache` 通过（63 文件、1026 用例；语句覆盖率 96.96%，分支覆盖率 90.42%），`git diff --check main...HEAD` 通过；**未跑全量 `pnpm test-all` 或 E2E**。Angular、React、Vue 均导出 `useWorkingTree` / `WorkingTreeResource`，状态与命令字段对称。

以下 4 条 P1 在当前 HEAD 仍成立，详细证据与修复建议见下文「2026-09-18 复核」：

1. **跨连接启用后旧连接漏捕获**：连接时能力未启用的实例不会装钩子，另一实例启用后仍可写入业务表而不产生工作树条目。下一次写入前必须获知能力变化或拒绝写入。
2. **普通 A→B→A 切换不推进 activation revision**：旧的 A 分支凭据重新匹配，失效令牌通过校验。每次真实切换要在最终事务内推进 revision。
3. **远端 metadata-only 分支首次物化未接公开入口**：同步只写分支行，公开切换先查缺失的 commit ref 而失败；staging 与提交屏障没有生产调用点。
4. **切换前置条件与最终写入分属两个事务**：`requireClean` / `expectedActivationRevision` 校验后，其他连接可以改写状态，适配器最终事务并不复核条件。需将条件传入最终事务并做 CAS。

### [P1] `normal` 合并在同一事务里重复捕获变更

- **证据**：[`merge-branch.ts:118-141`](../../packages/rxdb-plugin-history/src/merge-branch.ts#L118) 在调用方事务内逐条执行 `executor.mergeChanges(..., false)`。内层捕获挂载点在 [`capture-hook.ts:357-372`](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L357) 按 `domain_recompute` 捕获；外层事务挂载点在同文件 [`338-346`](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L338) 又从原水位线读取同一批 `RxDBChange` 并按 `crud` 捕获。`CAPTURE_OWNED_TRANSACTION` 只标记内层自开的事务体，不会标记调用方的外层事务。
- **影响**：一次合并的 `workingTreeRevision` 多推进，折叠后的条目 `unitId` / `transactionId` / `origin` 被第二次捕获覆盖。改进是让外层水位线扫描排除内层已消费的变更；增加 `mergeBranch({ strategy: 'normal' })` 的真实适配器用例，断言只捕获一次且来源不变。该项此前记在 [`next-0912-branch-review-max.md`](./next-0912-branch-review-max.md)；当前 HEAD 仍未修。

### [P2] 事务粒度 diff 的分页把一个事务拆成两组

- **证据**：[`diff.ts:173-190`](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L173) 先按条目数截断一页，[`diff.ts:242-252`](../../packages/rxdb-plugin-working-tree/src/working-tree/diff.ts#L242) 才按 `transactionId` 分组。三条同事务记录配 `limit: 2` 时，两页各返回一个不完整的事务组。
- **影响**：按组渲染会显示两个半事务；按 `transactionId` 跨页去重的消费者可能漏掉后一页。需按事务边界分页，或给跨页组明确延续语义并补分页回归用例。此前 max 报告将它列为 P1；本次按库中条目未丢失、问题发生在分页消费者解释层，降为 P2，历史报告保留原判定。

**本轮判定**：5 条 P1 + 1 条 P2 是本次重新核验的高优先级问题；下文原有 4 条 P2 仍未处理。本轮没有修改实现或测试，工作区的未提交查询/仓储改动未纳入评审。

## 2026-09-18 复核：合并阻塞项

本轮对公开入口、适配器事务、跨连接启用、提交图损坏处理与首次物化做跨文件追踪；检查了三端 `src/index.ts` 的实际导出。`pnpm nx test rxdb-plugin-working-tree --run --outputStyle=static --skipRemoteCache` 通过（63 文件、1013 用例；语句覆盖率 97.07%，分支覆盖率 90.41%），`git diff --check main...HEAD` 通过；**未跑全量 `pnpm test-all` 或 E2E**。这些测试没有覆盖下面的多连接时序，也没有从公开 `switchBranch()` 走首次物化。

### [P1] ⏸ Deferred — 已连接实例在另一实例启用后继续绕过捕获

- **证据**：[`plugin.ts:105-117`](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L105) 只在连接期读一次能力位，未启用便不装钩子；[`working-tree-facade.ts:155-165`](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts#L155) 的 `enable()` 只给发起调用的 adapter 装钩子。无钩子的适配器写原语仍走原路径，raw-write 门也把它视为未启用。
- **触发与影响**：A、B 先后连接同一未启用的库；A `enable()`，B 不重连就 `save()`。B 的业务写入成功，但不生成 `WorkingTreeEntry`，之后的 `status()` / `commit()` 漏掉它。Local-first 多标签页是正常用法，不是损坏库才会触发。
- **改进**：能力状态跨连接变化时，在 B 的下一次写之前装钩子或拒绝旧连接继续写；增加两个真实适配器实例共享持久库的回归用例。
- **本轮处理（⏸ Deferred，顺延 1）**：复核成立，**六条顺延项里最该先排的一条**——`next-0912-branch-review-max.md` 独立复现同一机制并补充了新证据（`entity-manager.ts` 的 `notifyExternalUpdate` 同样 fail-open），两轮互证；且与 FR-037「已启用库上的 writer 必须被拒」直接相反。不实现的原因：修法要引入**跨连接的能力变更传播通道**（BroadcastChannel / storage 事件 / 轮询能力位），这是新增运行时机制，不是改一处判断。

### [P1] ⏸ Deferred — 普通切分支不推进 activation revision，A→B→A 可重用旧凭据

- **证据**：[`VersionManager.ts:287-300`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L287) 直接调用 adapter 切换；两种适配器的 `switch_branch` 都只改 `RxDBBranch`。生产代码对 `bumpActivationRevision()` 的唯一调用是[`branch-materialization.ts:630`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L630)的远端首次物化屏障。
- **触发与影响**：读取 A 的 `{branchId, activationRevision}`，切 B 再切回 A；旧 revision 不变，`expectedActivationRevision` 与提交/丢弃/恢复的激活凭据误以为没有经历过切换，ABA 防护失效。
- **改进**：每次真实切换都在同一提交事务内对激活 revision 做 CAS 推进；增加 A→B→A 后旧凭据必被拒的跨适配器用例。
- **本轮处理（⏸ Deferred，顺延 2a）**：复核成立。这是「三个未接线的失效保护」中的第一个——`bumpActivationRevision()` 写好了，生产代码唯一的调用点是远端首次物化屏障，普通切换路径上没有。不实现的原因：CAS 推进要进**适配器的最终切换事务**，而当前 `VersionManager` 只把 `{branchId, actions}` 交给适配器（与顺延 4 同一个结构问题）——两条要一起改，否则推进了 revision 也还是在另一个事务里。

### [P1] ⏸ Deferred — metadata-only 远端分支的首次物化没有接到公开切换入口

- **证据**：`syncBranches()` 新建远端分支只写 metadata，不建 ref；[`plugin.ts:119-127`](../../packages/rxdb-plugin-working-tree/src/plugin.ts#L119) 的切换守卫无条件调用 `assertSwitchTargetIntact()`，后者通过 `readCommitBranchRef()` 对缺 ref 抛错。[`commitBranchMaterialization()`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L583) 在生产代码没有调用点，只有测试直接调用。
- **触发与影响**：能力已启用后首次 `switchBranch(remoteId)` 永远停在缺 ref 的错误上，不会下载或物化远端快照，也不会得到契约规定的 `branch_not_materialized` 失败出口。
- **改进**：把预取、staging、复核和提交屏障接入该公开入口；图守卫仅在目标已物化时检查 ref，并补公开入口的端到端用例。
- **本轮处理（⏸ Deferred，顺延 2b）**：复核成立。这是三个未接线失效保护中的第二个——`commitBranchMaterialization()` 生产无调用点，只有测试直接调。不实现的原因：要把**整条物化流水线**（预取 → staging → 复核 → 提交屏障）接进公开切换入口，同时还要改图守卫的触发条件（只在已物化时查 ref），是新增一条完整路径。

### [P1] ⏸ Deferred — 切换前置条件与最终写入分属两个事务

- **证据**：[`VersionManager.ts:287-300`](../../packages/rxdb-plugin-history/src/VersionManager.ts#L287) 先在只读事务校验 `requireClean` / `expectedActivationRevision`，随后异步计算 actions，再把**只有** `{branchId, actions}` 的对象交给适配器；SQLite 和 PGlite 的最终切换事务均未接收或复核这些条件。
- **触发与影响**：校验后另一个连接写脏当前工作树或切换了 active 分支，本次调用依旧可以提交用旧状态计算的投影；调用方显式提出的前置条件不再成立。即使修好上一条 revision 不递增，此窗口仍独立存在。
- **改进**：让条件随切换请求进入最终事务，在业务投影写入前于同一事务复核，并让 CAS 落败回滚整次切换。
- **本轮处理（⏸ Deferred，顺延 3）**：复核成立。不实现的原因：要**扩适配器 `switchBranch` 的入参形状**（当前只收 `{branchId, actions}`），六个适配器同步改，还要在两种方言里各写一遍事务内复核 + CAS 落败回滚。与顺延 2a 同一个结构问题，建议合并排期。

### [P2] 分页 staging 没有真正的崩溃续传路径（本轮未处理）

- **证据**：[`stageBranchMaterialization():338-353`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L338) 用同一个传入的 executor 写头行、全部分页和 `staged`；真实进程在中途崩溃会回滚整个事务。测试为保留半份分页，是在事务体**内部捕获异常**后正常提交；[`findResumableMaterializationAttempt():705-706`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L705) 虽返回 `nextPageIndex`，写入函数却始终从页 0 开始并重插相同 `attemptId` 的头行。
- **触发与影响**：网络错误向外传播或进程崩溃后无法从上次落盘页继续；已存在 pending attempt 时直接重试会撞主键。
- **改进**：把头行和每页放在独立可提交事务，提供从既有 attempt 的页号追加分页、最后单独置 `staged` 的入口；用真正的事务回滚/重启测试续传。
- **本轮未处理**：复核成立。要改 staging 的事务切分与写入入口形状，与顺延 2b 同一条物化流水线，建议一起排。

### [P2] ⏸ Deferred — 检测到提交图损坏后没有持久化隔离标记

- **证据**：[`assertCommitGraphIntact()`](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L203) 只读并抛错；[`markBranchCorrupted():252`](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L252) 是唯一把 ref 置为 `corrupted_read_only` 的函数，但生产代码没有调用它，只有测试直接调用。
- **触发与影响**：某个可达 commit 内容或父链损坏时，`commit()` / `restore()` / switch-to 会报错，但 ref 一直保持 `ok`，每次重试重新扫整张图，`corruptedAt` 诊断也永远缺席。当前 `status()` API 不返回 `branchStatus`，不要误写成「status 显示 ok」。
- **改进**：捕获 `CommitGraphCorruptedError`，在失败事务回滚后另开事务调用 `markBranchCorrupted()`；测试要从真实公开入口触发，而不是先手动标记。
- **本轮处理（⏸ Deferred，顺延 2c）**：复核成立。三个未接线失效保护中的第三个。不实现的原因：接线要在**失败事务回滚之后另开一个事务**——错误路径上的二次事务，要同时考虑二次事务自己失败时不能掩盖原始错误。是错误处理拓扑的改动，不是加一行调用。
- **相关（已做）**：`markBranchCorrupted()` 本身这轮补了一段 TSDoc，写明 `corruptedAt` 用客户端时钟是有意的、边界在哪（见 §3 的时钟条）。

### [P2] adapter 级受信声明在并发 merge 中互相覆盖（本轮未处理）

- **证据**：[`trusted-write-scope.ts:68-103`](../../packages/rxdb/src/trusted-write/trusted-write-scope.ts#L68) 的 WeakMap 每个 adapter 只存一条声明；[`capture-hook.ts:366-383`](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L366) 的 `interceptMergeChanges()` 排队取得事务后才消费声明。`merge_branch` 的 squash 与 `restore_entity` 都先在同一个 adapter 上声明再调用 `mergeChanges()`。
- **触发与影响**：两个调用并发排队时，后声明覆盖前声明；先执行的操作可能拿错意图，后执行者因无声明被 `WorkingTreeWriteRejectedError` 拒绝。`switchBranch` 在调用钩子时同步消费，不属于这个竞态。
- **改进**：把声明绑定到单次调用或事务上下文，不以共享 adapter 对象充当待消费槽；增加两条 adapter 级 `mergeChanges()` 并发用例。
- **本轮未处理**：复核成立。修法要改受信声明的**绑定粒度**（从 adapter 对象改到调用/事务上下文），是 `trusted-write-scope` 的公开面变更；§4.4 的「受信写标记是自报字符串键」是同一处的更深一层，建议一并决策。

### [P2] 首次物化未验证分页 payload 的指纹（本轮未处理）

- **证据**：[`assertStagingUsable():441-463`](../../packages/rxdb-plugin-working-tree/src/working-tree/branch-materialization.ts#L441) 只校验状态、页数、水位和 scope；存下的 stage/page `fingerprint` 没有在屏障前用于内容验证，页号也未验证从 0 连续。
- **触发与影响**：staging 中某页 payload 被改变、缺页后被不同页数补齐，屏障仍将它交给 `applyPage` 并宣布物化成功。唯一索引保证不重复页号，不保证页号连续或内容正确。
- **改进**：在任何 `applyPage` 前复算并核对分页内容指纹、冻结意图指纹及连续页序；加入篡改 payload/页序的拒绝用例。
- **本轮未处理**：复核成立。与顺延 2b / staging 续传同属首次物化流水线，三条一起排更合算。

**三端核对**：Angular、React、Vue 的 `src/index.ts` 均导出 `useWorkingTree` 和 `WorkingTreeResource`；命令共用 `createWorkingTreeCommands()`，本轮未发现公开导出缺端。此结论不抵消上述核心写入/切换问题。

> **2026-09-18 二次评审补充证据（针对上面三条「函数写好了但生产无调用点」）**：`commitBranchMaterialization()`、
> `stageBranchMaterialization()`、`markBranchCorrupted()`、`findResumableMaterializationAttempt()`
> 在 `packages/rxdb-plugin-working-tree` 里**没有任何 barrel 再导出**（该包只有
> `src/index.ts` 一个入口，它不导出 `branch-materialization.ts` 与 `commit-graph-guard.ts`
> 的这些符号），包外唯一提到 `markBranchCorrupted` 的两处都是注释。所以它们的现状不是
> 「留给调用方接线」，而是**连外部调用的可能性都没有**——接线这件事必须由本包内部完成，
> 排期时不要指望适配器或宿主侧能先行。

> **2026-09-18 复核结论（本节 8 条）**：4 条 P1 逐条复核**全部成立**，但**全部是架构级，本轮一条都不实现**——四条各自需要新的运行时机制（跨连接传播通道 / 切换事务内的 CAS 推进 / 物化流水线接公开入口 / 条件随请求进入最终事务），不属本轮「确定项 + 测试 + 文档」的范围。4 条 P2 里「损坏图持久隔离」与上述第 2 条同属「函数写好了但生产无调用点」，一并顺延；其余 3 条本轮未处理。逐条处置见各条末尾。

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

## 3. 次要发现（验证通过但未进 Top 榜 —— 已修条目按约定删除，剩 8 条）

| 位置                                                                                                                                                                                                                                              | 缺陷                                                                                            | 验证结论与触发条件                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [activation-state.ts:134-147](../../packages/rxdb-plugin-working-tree/src/working-tree/activation-state.ts#L134)                                                                                                                                  | `allocateBranchGeneration` 读-改-写无 CAS，两连接可发出相同分支代际 → 同 operationId 撞唯一索引 | PLAUSIBLE：rollback-journal 模式静默丢失更新；WAL/OPFS 下是响亮的 `SQLITE_BUSY_SNAPSHOT`；PGlite 无跨进程共享。代码层无并发防护，仅注释以「本地写队列并发度为 1」辩护                                                                                                                                                                                                                                                                                                                                                                                                                     |
| [migrate_system_schema.ts:130-143](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L130)                                                                                                                                   | 零 active 且无 main 行时恢复 UPDATE 静默 no-op，水印照写提交（:266-273）                        | PLAUSIBLE：状态难以到达（remove_branch 拒删 main），且 pull 路径会先走 resolve 自愈；sqlite 侧注释称该 no-op 为刻意设计。两侧 doc 已补「这里什么都不建」的刻意声明，行为未变                                                                                                                                                                                                                                                                                                                                                                                                              |
| [testing.ts:183-191](../../packages/rxdb-adapter-pglite/src/testing.ts#L183)（sqlite-core 侧现居 [`__tests__/test-utils.ts:84-91`](../../packages/rxdb-adapter-sqlite-core/src/__tests__/test-utils.ts#L84)）                                     | `cleanup_db` 清库后不恢复插件单例行                                                             | PLAUSIBLE：代码注释承认是刻意取舍并计划加「由调用方传入初始行」入口（入口未加）；当前仓内无触发路径                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| [capture-hook.ts:459-461](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-hook.ts#L459)                                                                                                                                          | raw-write 判定从不传入 intent，step 2 受信放行是死代码                                          | CONFIRMED（前瞻性）：判定已重构进 `raw-write-judgment.ts`，上下文类型有可选 `intent` 字段（:57、step 2 在 :683），但唯一生产调用点仍只传 `{capabilityEnabled, domain}`；核心 `gateRawWrite` 与两个适配器调用点整条链均无 intent 槽位，生产路径上 step 2 不可达                                                                                                                                                                                                                                                                                                                            |
| [RxDBAdapterSqliteBase.ts:636-642](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L636)                                                                                                                                     | 迁移重建的变更触发器不传 branchId，回落 `'main'`，而 pglite 侧读 active 分支传入                | CONFIRMED（不对称，损失窗口窄）：默认事务每次会按真实当前分支重建触发器自愈；仅绕过事务日志的窗口期写入会被标错分支。pglite 侧 [`migrate_system_schema.ts:203-241`](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L203) 读 active 分支传入                                                                                                                                                                                                                                                                                                                       |
| [migrate_system_schema.ts:107-112](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L107)（sqlite-core [`RxDBAdapterSqliteBase.ts:155-157`](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L155) 同） | 旧库含 2+ 行 `activated=true` 时迁移抛错，connect 永久失败，无库内恢复路径                      | CONFIRMED（有意的 FR-048 行为）：旧 schema 无约束允许该状态，守卫文档明确「不挑一个留下」；升级即无法打开库                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| [commit-graph-guard.ts:252](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L252) / [commit-capability.ts:216](../../packages/rxdb-plugin-working-tree/src/commit/commit-capability.ts#L216)                             | 📝 **已补注记，判定为改不了** `corruptedAt` / `enabledAt` 用客户端时钟                          | CONFIRMED，但判定为当前改不了：`CURRENT_TIMESTAMP` 在 SQLite 上求值成 `'YYYY-MM-DD HH:MM:SS'`，与本仓日期列的 ISO 存储形态对不上——`sqlTimestampLiteral` 存在的理由正是这个（`branch-materialization.ts:483` 写明）。`corruptedAt` 又是「首次损坏时刻」，列默认值只在 INSERT 时求值而那一行早在建库迁移里就插进去了，用不上。`enabledAt` 走的是手拼 CAS，时刻只能作字面量嵌入。两处已各补一段 TSDoc 写明客户端时钟是有意的、三档边界分别是什么、代价上限是多少（两个值都是诊断/展示值，不参与任何比较）。**统一到数据库时钟要先给仓储层加写 SQL 表达式的能力——架构项，进顺延清单（§5.1）** |
| [switch_branch.ts:203](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L203)                                                                                                                                                 | ❌ **判定不改** switch_branch 把事务体所有错误重新包装成 `RxDBAdapterSqliteError`               | CONFIRMED（状态级不一致），但 2026-09-18 复核判定不改：pglite 同位置（`switch_branch.ts:212-220`）是**同一口径**——两个适配器一致地在 `switchBranch` 入口设错误边界，这是对称的，不是漂移。`RxDBAdapterSqliteBase.ts:1364` 的原样上抛契约作用于**事务包装层**，是另一层。改它要同时动两个适配器的错误类型，收益不抵风险。记录防复提                                                                                                                                                                                                                                                        |

## 4. 清理与架构类发现

**判定图例**：✅ 值得做 ｜ ❌ 不值得做（附理由，防复提）｜ ⚠️ 需澄清（前置决策未定，不要直接开工）

### 4.1 复用（重复实现）

| 判定                          | 位置                                                                                                                                                                                           | 内容与理由                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅                            | [sql-literal.ts:43](../../packages/rxdb/src/system/sql-literal.ts#L43)                                                                                                                         | SQL 标识符/字符串引号工具共 3 份副本（core 新写 + pglite.utils + sqlite-core.utils），**NUL 处理策略已分歧**——分歧即缺陷（core 版对 NUL 抛错，pglite `pglite.utils.ts:133` 与 sqlite-core `sqlite-core.utils.ts:566` 均无检查）                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ✅                            | [switch-result.utils.ts](../../packages/rxdb-adapter-pglite/src/version/switch-result.utils.ts#L127)                                                                                           | 约 300 行 switch 结果 SQL 脚手架跨 pglite / sqlite-core 复制，注释自承「两家在这一格上必须长得一样」。normalizer 分歧已随 §4.1 的 `normalizeEntity` 修复消失（两端现都调核心 `normalizeUpdateEntity`），但「两端各写一遍、写着写着就分岔」的主问题未动                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ⏸ **新增（2026-09-18 复核）** | [pglite.utils.ts:479-497](../../packages/rxdb-adapter-pglite/src/pglite.utils.ts#L479) / [sqlite-core.utils.ts:482-503](../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L482) | **`normalizeCreateEntity` 是已修的 `normalizeUpdateEntity` 分歧在 INSERT 侧的镜像，但两个适配器都还带着那个形态，而核心没有对应实现可指**。两份逐字相同的外键循环：`metadata.foreignKeyNames \|\| []` 配 `metadata.foreignKeyColumnNames \|\| foreignKeyNames`，按下标取 `foreignKeyColumnNames[i]`——两个平行数组长度不等时把值写进相邻的列，且完全无声（核心版 `entity.utils.ts:171` 的注释对此有逐字警告）。UPDATE 侧靠「改指核心实现」修掉了，INSERT 侧**改不动**：`packages/rxdb` 里没有 `normalizeCreateEntity`。修法是先往核心补一份 keyed 实现（对齐 `normalizeUpdateEntity` 的 `foreignKeyRelationMap` 口径），再让两个适配器一起改指——**是给核心加公开导出，属架构项**，本轮不做 |
| ⚠️                            | 各 adapter `__tests__/*-factory.ts`                                                                                                                                                            | 6 个测试工厂复制同一骨架（QueryCounting 子类、WeakMap、插件先于 connect 的顺序规则仅靠复制的注释维系）——抽取需先定 `@aiao/rxdb-test` 的边界，与 next-0915 的同类债务同源，应一起排期                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ⚠️                            | [testing.ts:219](../../packages/rxdb-adapter-pglite/src/testing.ts#L219)                                                                                                                       | `cloneEntityClasses` 逐字复制 sqlite-core 版，走 `ɵMetadata` 内部符号——共享前先决定该内部符号是否要转正为受支持入口                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ⚠️                            | [test-utils.ts:55](../../packages/rxdb-adapter-sqlite-core/src/__tests__/test-utils.ts#L55)                                                                                                    | `cleanup_db` 重复实现 `@aiao/rxdb-test` 的 `cleanupSqliteTestAdapter`——同上，依赖 `rxdb-test` 边界先定                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

### 4.2 简化（冗余状态与复制粘贴）

| 判定 | 位置                                                                                                                                                                                                                  | 内容与理由                                                                                                                                                                                                                                                                                                                              |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [branch.ts:45-54](../../packages/rxdb/src/system/branch.ts#L45)                                                                                                                                                       | `activeKey` 是 `activated` 的第二份拷贝（`activated ? '*active*' : null`），约 10 处生产写点手工共写（`RxDB.ts:971`、`system-repositories.ts:68-76`、`active-branch-guard.ts:175-180` 及两个适配器的 migrate/switch SQL 路径），每处都带「漏写一处就绕过唯一约束」注释；生成列或部分唯一索引可一处编码不变量                            |
| ✅   | [bulk-write-gate.ts:20](../../packages/rxdb-plugin-working-tree/src/working-tree/bulk-write-gate.ts#L20)                                                                                                              | `BulkWriteOperation` 重声明 core 的 `InterceptedBulkWrite` + 三张按操作键的查找表；**类型漂移无编译错误**——是静默失效风险，不只是重复                                                                                                                                                                                                   |
| ✅   | `columnOf`                                                                                                                                                                                                            | 同一 helper **已长到五份副本**（commit-capability / write-commit / working-tree-state-sql / restore-session-transitions.ts:41 / activation-cas.ts:41），仅错误消息不同——低成本合并                                                                                                                                                      |
| ✅   | [commit-graph-guard.ts:172-182](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L172)                                                                                                        | `nextParents` 与 [`list-commits.ts:137-147`](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L137) 的 `nextFrontier` 字节级相同，同包内应导入而非重定义。附带改善：`loadCommitsByIds` 已从 list-commits 导出并被守卫复用（查询层已去重），frontier helper 未去重                                                     |
| ⚠️   | `MAIN_BRANCH_ID = 'main'`                                                                                                                                                                                             | 3+ 包重复声明 + 裸字面量，各带「与其他一致」注释——跨包共享常量会新增静态 import，Nx 图插件会据此生成依赖边并可能成环，须先确认放在哪个包不会破坏 `run-many`                                                                                                                                                                             |
| ⚠️   | [migrate_system_schema.ts:80](../../packages/rxdb-adapter-pglite/src/system/migrate_system_schema.ts#L80) / [RxDBAdapterSqliteBase.ts:126](../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L126) | 约 90 行 activeKey 回填序列跨两后端复制（仅方言差异），且两端的语句收集协议也不同（逐个执行 vs `---STATEMENT_SEPARATOR---` 拼接）——抽取前要先统一语句收集协议，否则抽出来的只是壳                                                                                                                                                       |
| ❌   | [sha256.ts](../../packages/rxdb/src/system/sha256.ts)                                                                                                                                                                 | **不要换成依赖**。文件头已论证：`crypto.subtle.digest` 是异步的且只在 secure context 可用；`node:crypto` 不能进浏览器；`@aiao/utils` 的实现同样是异步的；而指纹写在不可变提交历史里，算法一旦更换无法回溯。151 行实现本身经核验正确，唯一消费者是 [`index.ts:139`](../../packages/rxdb/src/index.ts#L139)。此条为净负面建议，记录防复提 |
| ❌   | [rxdb-plugin-system.ts:47](../../packages/rxdb/src/rxdb-plugin-system.ts#L47)                                                                                                                                         | 单字段 context 包装对象——文档已给出「以后加字段」的理由，拆掉是反向重构，收益为零。记录防复提                                                                                                                                                                                                                                           |

### 4.3 效率

| 判定 | 位置                                                                                                           | 内容与理由                                                                                                                                                                                                                                                                                                                                          |
| ---- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [commit-graph-guard.ts:213-225](../../packages/rxdb-plugin-working-tree/src/commit/commit-graph-guard.ts#L213) | 每次 commit/discard/switch 全量重验整张可达提交图（[`commit-command.ts:246`](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L246) 无条件调用，discard/restore/switch 各一处）：每提交一次顺序查询 + 全部变更单元重哈希，1 万提交时每次保存 O(N) 查询——图是只追加的，可持久化「最后已验证 HEAD」水位。**本节最高收益项** |
| ✅   | [capture-runtime.ts:245](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L245)     | 每个被捕获变更重读 active-branch token（同事务里上一行刚读过）：一实体一写 4 次查询，M 实体 2M 次冗余查询——捕获热路径                                                                                                                                                                                                                               |
| ✅   | [capture-runtime.ts:254](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-runtime.ts#L254)     | `persistEntry` 重复 `readEntry` 刚做过的 findEntry 唯一索引查询；`bumpWorkingTreeRevision` 每变更读/写一次状态行而非每批一次——同上，热路径                                                                                                                                                                                                          |
| ✅   | [list-commits.ts:163-176](../../packages/rxdb-plugin-working-tree/src/commit/list-commits.ts#L163)             | 线性历史下 BFS 每层一次往返 = 每提交一次顺序查询。批量 `in` 已用于同层加载并导出给守卫复用，但逐层往返未变——改动小、收益直接                                                                                                                                                                                                                        |
| ✅   | [RxDB.ts:1737-1776](../../packages/rxdb/src/RxDB.ts#L1737)                                                     | 每次 connect 约 14 次顺序 `isTableExisted` 探测（系统实体 + 实体表两个循环）——每次 connect 都付，可一次元数据查询批量取回                                                                                                                                                                                                                           |
| ⚠️   | [status.ts:152](../../packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L152)                       | 两个顺序 `COUNT(*)` 而非一个 `GROUP BY origin`；三框架 hook 每次 commit/discard/enable 后都自动调 status——单次收益很小，是否值得改取决于 hook 的自动调用频次是否要收敛                                                                                                                                                                              |
| ⚠️   | [write-commit.ts:374](../../packages/rxdb-plugin-working-tree/src/commit/write-commit.ts#L374)                 | `writeCommit` / `readCommitLogPage` 在同一事务里二次读取刚读过的 CommitBranchRef 行——同事务内重复读代价低，收益边际                                                                                                                                                                                                                                 |

### 4.4 根因深度

| 判定 | 位置                                                                                                                  | 内容与理由                                                                                                                                                                                                                                                                                                           |
| ---- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ✅   | [versioned-domain.ts:257-273](../../packages/rxdb-plugin-working-tree/src/working-tree/versioned-domain.ts#L257)      | 插件用 `'$'` 字符串拼接重建各后端物理表名（复制 sqlite-core 的命名规则），而非由拥有命名规则的适配器暴露解析——命名规则一变，raw-write 门对受版本表静默放行（文件注释自承「漏登记的后果是静默放行」）。**与已修的系统实体域判定同根因**：那一条是身份按裸名匹配，这一条是表名靠字符串重拼，都是「把别人的规则抄一份」 |
| ✅   | [capture-mount-points.ts:60-96](../../packages/rxdb-plugin-working-tree/src/working-tree/capture-mount-points.ts#L60) | 挂载点注册表第三处编码 core 的原语清单（参数名序列靠源文本 spec 对齐），且运行时从不调用——漏改只会在测试里响。**与上一条同根因**                                                                                                                                                                                     |
| ✅   | [active-branch-guard.ts:95](../../packages/rxdb/src/system/active-branch-guard.ts#L95)                                | 错误码字符串 core 与 plugin 各一份（`'ambiguous_active_branch'`），靠「钉住两者的测试」维系——只修一边则 catch 分支匹配不到。单源化成本极低                                                                                                                                                                           |
| ✅   | [switch_branch.ts:78-100](../../packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L78)                   | 分支翻转修复与 activeKey 回填按后端各写一遍（pglite 同路径 :97-121），且两端修复同一根因（多语句 RETURNING 丢行）用了不同机制——与 §4.1 的 switch-result 脚手架复制同属跨后端对称问题，应合并处理                                                                                                                     |
| ⚠️   | [trusted-write-scope.ts:77](../../packages/rxdb/src/trusted-write/trusted-write-scope.ts#L77)                         | 受信写标记是公开导出的自报（文件·符号·意图）字符串键，运行时只查表不校验调用方；唯一机械校验是词法审计脚本且只扫 `packages/`——第三方适配器可仿冒已注册键让写入无条件受信。深层修复（意图做成写入原语选项上的结构化字段）是大改，**先定「第三方适配器是否在威胁模型内」再动**                                         |
| ⚠️   | [active-branch-guard.ts:47](../../packages/rxdb/src/system/active-branch-guard.ts#L47)                                | `'*active*'` 哨兵与用户数据同命名空间，安全性仅靠「`*` 不是合法分支 ID」的注释级约定，无任何创建/导入路径校验——同属威胁模型问题，与上一条一起定                                                                                                                                                                      |
| ⚠️   | [working-tree-callsite-drift.mjs:68](../../scripts/audit/working-tree-callsite-drift.mjs#L68)                         | 审计脚本硬编码接收者变量名/文件名清单与运行时闸门策略重复——变量一改名就要改脚本，包外代码又完全扫不到。根治要换成类型/AST 级校验，与下一条一起评估                                                                                                                                                                   |
| ⚠️   | [working-tree-callsite-drift.mjs:324](../../scripts/audit/working-tree-callsite-drift.mjs#L324)                       | 漂移扫描器用字段顺序正则重新解析 TS 里的受信注册表（第二份编码）——无害格式化改动即断 CI，或部分匹配静默审计旧形状。**「词法扫描器当门禁」的系统性问题**：套件调用点那份脚本这一轮已按括号深度加固（顶层调用 + 修饰符只认包住调用点的那个），但两份脚本都还停在词法层，建议一次性决定是否全面改用 AST                 |

### 4.5 规范符合性（CLAUDE.md / AGENTS.md）

- **[AGENTS.md:36 / CLAUDE.md:69](../../AGENTS.md)「ESLint 零警告，禁止忽略警告」**：4 处新增 `// eslint-disable-next-line @nx/enforce-module-boundaries`（[trusted-callsite-registry.spec.ts:61](../../packages/rxdb/src/__tests__/trusted-write/trusted-callsite-registry.spec.ts#L61)、[capture-mount-points.spec.ts:35](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/capture-mount-points.spec.ts#L35)、[trusted-callsite-capture.spec.ts:26](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/trusted-callsite-capture.spec.ts#L26)、[write-entry-matrix.spec.ts:47](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/write-entry-matrix.spec.ts#L47)）——均为跨包读 `specs/` 契约原文或核心源码 `?raw`。**判定 ❌ 不改**：均为单行、有注释理由的定向抑制，lint 仍报零警告，属「字面违反禁令、实质争议」。
- 「无 fallback 兜底」的实质违反项（`read_current_branch_id.ts`）已提级至 §3。

## 5. 剩余项与优先级建议

> 2026-09-17 的 8 条 P1 + 6 条 P2、以及 2026-09-18 两轮修复落地的一批条目（raw 写判定扫描器重写、dollar-quote 词法、模板插值审计、契约重冻结、§3/§4.1 的已修行等）均已处理，按本目录约定从报告删除——修法与判据写在代码注释与 TSDoc 里。以下保留仍未处理的条目与当前优先级。

### 5.1 顺延项（⏸ Deferred —— 上轮确认的架构级阻塞项）

上轮确认的 4 条 P1 **全部仍在此**，按建议优先级：

1. **跨连接启用绕过捕获**（两份报告独立复现，违反 FR-037，最该先排）
2. **三个未接线的失效保护**，建议一次排完：切换不推进 activation revision（A→B→A 重用旧凭据）/ 远端分支首次物化未接公开入口 / 损坏图不落盘隔离标记
3. **切换前置条件与最终写入分属两个事务** —— 与第 2 条的 revision 推进同一个结构问题（适配器只收 `{branchId, actions}`），两条一起改
4. **首次物化流水线的其余两条**：staging 崩溃续传、分页 payload 指纹校验 —— 与第 2 条中段同属一条流水线

另两条来自 max 报告、同属架构级：`merge_branch('normal')` 双重捕获、diff 分页切断事务；以及 `bench-working-tree` 接 CI（T132 已于 2026-09-18 按 T109 复冻基线跑过 `✓ PASS`，剩 CI 接线未做）。**上轮架构项去重后共 6 条**，完整清单见 `next-0912-branch-review-max.md` §6.1。

### 5.2 尚未排期

1. §3 剩余的次要项（`allocateBranchGeneration` 无 CAS、迁移恢复 UPDATE 静默 no-op、`cleanup_db` 不恢复插件单例行、raw intent 死代码、迁移触发器 branchId 回落 `'main'`、2+ active 行迁移抛错、时钟口径统一）—— 多数标着 PLAUSIBLE 或「有意为之」，先确认触发条件再定
2. §4.4 打 ✅ 的四项：表名解析归属适配器、挂载点清单单源、错误码单源、跨后端脚手架共享
3. §4.4 打 ⚠️ 的四项需先定第三方适配器威胁模型；「词法扫描门禁是否改用 AST」这一问在二次评审后**变窄了**——模板插值那条已用按段扫描（而不是 AST）修掉，仍悬而未决的只剩 §3 那条正则字面量误判；§4.1–4.3 打 ✅ 的其余优化按成本收益排期
4. §4.5 的 4 处定向 lint 抑制维持 ❌ 不改（单行、有注释理由、lint 仍报零警告）
