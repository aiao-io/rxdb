# Phase 0 Research: 本地工作树与提交历史

**Feature**: [spec.md](./spec.md) | **Branch**: `next-0912` | **Date**: 2026-09-12

本文件解决 [plan.md](./plan.md) Technical Context 中的全部 NEEDS CLARIFICATION，并冻结实现前必须先定的技术选型。每条格式固定为 **Decision / Rationale / Alternatives considered**。

> **前置**：本轮是**就地重生成**。旧 research.md 按已作废的「工作树 → 缓存区 → 提交」三层模型写成，其中关于 index 自包含重放、依赖闭包与环检测的全部结论**作废**，不在本文件中承接。

---

## R1. 工作树捕获的挂载点：适配器原语层，而非 Repository 层

**Decision**：把工作树捕获挂在**适配器写原语**上，而不是 `Repository` / `EntityManager` 层。v1 需要覆盖的原语共 **4 个**：

| 原语                                                             | 位置                           | 性质                          |
| ---------------------------------------------------------------- | ------------------------------ | ----------------------------- |
| `transaction(fun, transactionLog?)`                              | `rxdb-adapter.ts:134-135`      | 事务边界，普通 CRUD 的载体    |
| `mergeChanges(actions, localChanges?, disableTriggers?)`（本地） | `rxdb-adapter.ts:200`          | 批量投影重写                  |
| `switchBranch(options: SwitchBranchOptions)`                     | `rxdb-adapter.ts:182`          | 批量投影重写（分支/撤销面）   |
| `upsertMany()` / `deleteByIds()`                                 | `rxdb-adapter.ts:239` / `:255` | 公开批量写，**不经 rawQuery** |

**Rationale**：

- Repository 层有多条并行入口（直写、事务回调、远端 apply、缓存路径），挂在那里必然漏；适配器原语是**全部业务表写入的收敛点**。
- FR-039 要求「同一事务内写业务实体 + 写工作树条目 + 递增 revision，任一步失败全部回滚」。只有在适配器事务内部才能拿到这个原子边界。
- 验证发现 epic-006 登记表的 9 行实际落在**两个**原语上，不是一个：`adapter.switchBranch` 承载 3 行（`VersionManager.switchBranch` 的分支物化、`HistoryManager.invalidateRedoStack`、`applyUndoRedoHistories`），`adapter.mergeChanges` 承载 6 行。把门禁只挂在 `mergeChanges` 上会漏掉整个撤销/分支面。

**Alternatives considered**：

- _数据库 trigger fail-closed_：唯一能拦住绕过 adapter 的外部句柄的方案，但受信标记的载体在 6 个后端不统一，且每张版本化表要挂 3 个 trigger。spec.md「Assumptions」已把它显式推到后续故事。
- _Repository 装饰器_：漏 `rawQuery` 与批量写方法，且与既有 QueryCache 路径纠缠。
- _事件订阅后补记_：违反 FR-039 的同事务原子性，且「先改业务表再补记」在崩溃窗口内会留下无工作树条目的业务变化——正是 SC-007 要禁止的半状态。

---

## R2. `WorkingTreeEntry` 独立存储，不复用也不引用 `RxDBChange`

**Decision**：`WorkingTreeEntry` 是**独立表**，完整复制 patch / inverse patch，**不**持有指向 `RxDBChange` 的外键作为唯一恢复依据。

**Rationale**：`RxDBChange` 行会被四条**既有**路径删除或失效，只引用不复制会让冷重放缺项：

1. 删分支级联删除
2. 压缩合并（squash）
3. 回滚标记
4. 失效标记（`redoInvalidatedAt`，见 `HistoryManager.ts:485` 起的 `invalidateRedoStack`）

spec.md 的 Key Entities 已把这条列为「两条不可让步的存储契约」之一。SC-009 的验收判据「任何业务表净变化都能由 HEAD + `WorkingTreeEntry` 重放」在引用式设计下不可能成立。

**Alternatives considered**：

- _复用 `RxDBChange` 加一个 `uncommitted` 标志位_：最省表，但上述四条路径会把「未提交变更」连带删掉，且 `RxDBChange` 的语义是「已发生的变更流水」，与「相对 HEAD 的净差」不同——同一实体连改 3 次是 3 行流水但只有 1 个工作树单元。
- _只存计数与 revision_：spec.md 明确「`WorkingTreeState` 只存计数和 revision **不算完成**」，无法枚举、无法重放、无法 diff。

---

## R3. 两类 CAS 的实现形态：捕获型走显式 expected 参数，读改写型走事务内自增

**Decision**：

| 类型               | 适用操作                                                                           | 形态                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| **调用方捕获型**   | commit / restore / discard / switch / merge / undo / redo / create · remove branch | 公开 API 接收 `expected*Revision`，事务内做条件 UPDATE，`rowsAffected === 0` 即冲突      |
| **事务内读改写型** | 普通 CRUD、remote entity apply                                                     | 事务内 `SELECT … FOR UPDATE` 等价语义后 `+1`，**不接收** expected 值，因此不会因并发失败 |

**Rationale**：FR-032 要求「writer 身份不得成为提交正确性的必要条件」。若普通 CRUD 也用捕获型，另一个 Tab 的任何一次写入都会让多标签页下所有在途 `save()` 失败——这是直接冲突，spec.md 的 Edge Cases 已把它列为必须避免的反模式。反过来，commit 必须是捕获型：没有暂存区就没有冻结快照，读改写型 commit 等于提交调用方没有看过的变更（FR-031）。

**Alternatives considered**：

- _全部捕获型_：破坏 FR-032，多标签页不可用。
- _全部读改写型_：破坏 FR-031，commit 会静默吞掉并发编辑。
- _乐观锁 + 自动重试_：对 commit 而言重试等于重新提交一份调用方没看过的内容，把正确性问题伪装成可用性改善。

**冲突不建表**：`CommitConflict` 是**失败命令的类型化诊断值**，从「失败操作 + 对象 ID + expected/actual 三个 revision + 建议动作」当场派生（FR-035）。建第二张冲突状态表会与真实 revision 漂移。`status().conflicted` 的**唯一** durable 来源是 `WorkingTreeRestoreSession`。

---

## R4. raw 写路径的 5 步 bypass 判定：一份实现，6 个后端共用

**Decision**：实现**单一**判定函数，位于核心包，6 个后端共用；方言差异只体现在**词法归一化**层（大小写、引号标识符、schema 限定）。判定顺序严格按 spec.md：

1. 提交能力未启用 → 放行（零行为差异）
2. 携带内部受信 `intent` → 放行
3. 非写语句 → 放行
4. 写目标表 ∩ 版本化业务实体表 ≠ ∅ **且** 被写列集 ⊄ untracked 字段域 → `commit_capability_mismatch`，**执行前**拒绝
5. 其余 → 放行

**Rationale**：`rawQuery` 在适配器接口上是**可选方法**（`rxdb-adapter.ts:94`，`rawQuery?(sql, params?)`），因此判定不能依赖「所有适配器都实现了 rawQuery」。把判定放在核心包并由各适配器在自己的 `rawQuery` 实现入口调用，既满足「同一份实现」又容忍可选性。

`upsertMany()` / `deleteByIds()` **不经 `rawQuery`**，五步判定够不到，必须在阶段 A **显式挂载**；它们的入参是**整行**而非列集，因此对版本化实体一律落第 4 步（FR-046）。注意二者返回 `Observable<void>` 而非 `Promise`，门禁必须在**订阅前**同步拒绝，否则「执行前拒绝、业务表零变化」不成立。

**fail-closed 是硬要求**：动态拼接、多语句串、方言不认识的构造一律按「不是子集」处理。SC-009 的判据是「宁可误伤不可放过」。

**能力边界写进文档**：绕过 adapter 的外部句柄（另开 `sqlite3` 连接、直接打开 OPFS 文件、psql 连 PGlite）**拦不住，v1 也不承诺拦得住**。

**Alternatives considered**：

- _每后端各写一份判定_：6 份实现必然漂移，SC-006 的双套件全绿无法保证一致语义。
- _只在 SQL 字符串上做正则_：无法归一化引号标识符与 schema 限定，误判率高到不可用。
- _运行时事后校验（写完比对）_：违反「业务表零变化（不是写完回滚）」。

---

## R5. 受信调用点登记表：键 = 文件 + 符号 + 意图，符号取最内层具名函数

**Decision**：登记表 9 行，已逐条对真实代码复核（2026-09-12），**符号全部存在、签名未漂移**：

| #   | 文件                 | 符号                         | 写原语                           | 行  | 意图          | 是否产生工作树单元 |
| --- | -------------------- | ---------------------------- | -------------------------------- | --- | ------------- | ------------------ |
| 1   | `VersionManager.ts`  | `switchBranch`               | `adapter.switchBranch`           | 751 | 分支物化      | **不产生**         |
| 2   | `restore-entity.ts`  | `restore_entity`             | `adapter.mergeChanges(…,false)`  | 81  | 实体恢复      | **必须产生**       |
| 3   | `HistoryManager.ts`  | `invalidateRedoStack`        | `adapter.switchBranch`           | 519 | redo 失效标记 | **不产生**         |
| 4   | `undo-redo-apply.ts` | `applyUndoRedoHistories`     | `adapter.switchBranch`           | 166 | 撤销/重做     | **必须产生**       |
| 5   | `merge-branch.ts`    | `merge_branch`（per-change） | `executor.mergeChanges(…,false)` | 127 | 逐条合并      | **必须产生**       |
| 6   | `merge-branch.ts`    | `merge_branch`（squash）     | `adapter.mergeChanges(…,false)`  | 151 | 压缩合并      | **必须产生**       |
| 7   | `pull-batch.ts`      | `pullBatchOnce`              | `executor.mergeChanges(…,true)`  | 373 | `remote_sync` | **必须产生**       |
| 8   | `pull-repository.ts` | `pullSingleRepository`       | `executor.mergeChanges(…,true)`  | 636 | `remote_sync` | **必须产生**       |
| 9   | `cleanup-expired.ts` | `cleanupExpired`             | `executor.mergeChanges(…,true)`  | 201 | `remote_sync` | **必须产生**       |

全部位于 `packages/rxdb/src/version/`。**行号仅为本轮复核留痕，不进登记键**——键是「文件 + 符号 + 意图」。

**关键区分（漂移测试必须覆盖）**：

- 第 5 行与第 6 行同在 `merge-branch.ts` 的同一函数内，是**两个策略分支**（`strategy === 'squash'` 与否），接收者不同（`executor` vs `adapter`）。各占一行，只登记其中一个会让漂移测试落地即红。
- `mergeChanges` 有**两个重载**：本地 `(actions, localChanges?, disableTriggers?)`（`rxdb-adapter.ts:200`）属本表；远端 `(actions, branchId?, changes?)`（`rxdb-adapter.ts:322`）**不属**。扫描必须**按签名**区分，仅凭函数名会把远端推送误收进来。
- `disableTriggers` 真假**都算**本表（第 5/6 行为 `false`，第 7/8/9 行为 `true`）。

**扫描排除**：`dist/`、`out-tsc/`、`**/__tests__/**`、`*.suite.ts`、`*.spec.ts`。复核时发现 `packages/rxdb/out-tsc/` 下存在编译产物 `.d.ts`，若不排除会以与真实缺口无关的理由变红。

**Alternatives considered**：

- _以行号为键_：任何无关编辑都会让门禁变红。
- _以委托门面方法为符号_：`VersionManager.switchBranch` 与 `adapter.switchBranch` 是两层，登记门面会让三个不同意图（分支物化 / redo 失效 / 撤销重做）塌缩成一行，无法区分「产生」与「不产生」。
- _白名单整个文件_：`merge-branch.ts` 的两个策略分支语义不同，文件粒度表达不了。

---

## R6. `WorkingTreeSwitchBranchOptions` 是新类型，与既有 `SwitchBranchOptions` 不同层

**Decision**：新增 `WorkingTreeSwitchBranchOptions`，作为 `VersionManager.switchBranch()` 的**可选第二形参**；既有 `SwitchBranchOptions` 原样不动。

**Rationale**：复核确认二者处于**不同层**，不是命名偏好问题：

- 既有 `SwitchBranchOptions`（`rxdb-adapter.ts:55`）= `{ branchId: string; actions: SwitchVersionActions }`，是**适配器入参**，由 `abstract switchBranch(options: SwitchBranchOptions)`（`:182`）消费，调用方是核心包内部。
- 新的 `WorkingTreeSwitchBranchOptions` 是**面向用户的行为选项**（`requireClean` 等），由 `VersionManager.switchBranch()` 消费。

当前 `VersionManager.switchBranch(branchId: string): Promise<void>`（`VersionManager.ts:740`）**没有 options 形参**。新增可选第二形参天然满足 FR-017「不带该选项时仍无条件切换」——既有默认行为零变化，这也是 constitution「Never break userspace」的直接体现。

**Alternatives considered**：

- _复用 `SwitchBranchOptions`_：spec.md 命名裁决明确禁止；技术上也错——会把适配器入参泄漏到用户 API。
- _把 `requireClean` 做成独立方法 `switchBranchIfClean()`_：三框架对称成本翻倍，且与既有 API 形状不一致。

---

## R7. 两套具名 conformance 套件，不起第三个

**Decision**：

| 套件                                 | 归属          | 覆盖                                                                            |
| ------------------------------------ | ------------- | ------------------------------------------------------------------------------- |
| `workingTreeCaptureConformanceSuite` | US-306 阶段 A | 写入口矩阵、active token、revision 递增、QueryCache 排除、raw bypass 拒绝       |
| `workingTreeCommitConformanceSuite`  | US-306 阶段 B | 提交状态机、CAS、commit 后清空、discard、**并入 US-305 的 commit 图与迁移断言** |

**Rationale**：US-305 的 commit 图与迁移断言**并入提交套件**，不另起第三个套件名——spec.md 的 Assumptions 已冻结这条。理由是这些断言与提交状态机共享同一份 fixture 与同一套后端矩阵，拆成第三个套件只会让 6 个后端各多跑一遍相同的建库开销。

**运行矩阵 = 6 个后端**：PGlite、wa-sqlite、sqlite-wasm、sqlite、sqliteai、Electron `node:sqlite` host。入矩阵判据是**宿主能力**（既有跨后端共享套件全绿且无已知非确定性失败），不是所属 story 的 status。`rxdb-adapter-tauri` 与 `rxdb-adapter-miniprogram` 不在矩阵内。

**Alternatives considered**：

- _单一大套件_：阶段 A 无法在阶段 B 之前独立验收，破坏 spec.md 的固定交付顺序。
- _三套件（捕获 / 提交 / 迁移）_：迁移断言无法脱离 commit 图独立成立，拆分只增开销。

---

## R8. 性能门禁：双门禁，普通 CI 只卡相对值

**Decision**：

- **基准环境**固定 Node + PGlite memory；「响应」定义为 **API promise resolve**。
- `WARMUP = 5`、`SAMPLES = 50`；每 sample 前**在计时外**恢复同一 fixture：10,000 实体 / 100 commit（每 commit 100 单元）/ 工作树 100 未提交单元。fixture 内容与 hash 写入 JSON。
- JSON 记录运行时版本、OS、CPU 型号、逻辑核数、内存、runner ID、并发度 → `runnerProfileHash`。不匹配返回 `benchmark_environment_mismatch`，**不得伪装成性能回归**。
- **普通 PR CI 唯一硬门禁**：归一化 ratio（被测 p95 / 同次 control CRUD p95）≤ 冻结 reference median 的 **110%**。
- **绝对 p95 仅发布门禁**，且仅在 `runnerProfileHash` 匹配的固定性能 runner 上：status / diff ≤ 100 ms、restore ≤ 1 s。**commit 不套用 100 ms**。

**Rationale**：裸墙钟数字在 CI 机器上必然抖动。OPFS / IDB / wa-sqlite / PGlite 的差距是**数量级**，不指定后端的绝对断言没有意义。归一化到同次 control CRUD 可消掉机器整体快慢这一维。

**commit 免除 100 ms 预算是 constitution 第四条的已批准例外**，理由见 [plan.md](./plan.md) 的 Complexity Tracking：commit 要把 100 个单元整体落盘并清空工作树，与只读摘要的 status / diff 不是同一量级；其绝对预算由**首个绿色实现的 reference 中位数冻结**，与相对门禁同批签入。

**reference 必须先于发布候选签入**，不能在失败后重算基线——否则门禁自证其绿。

**宿主**：`benchmarks/` 项目已存在（`benchmarks/project.json`），新增 `bench-working-tree` target。

**Alternatives considered**：

- _只做绝对门禁_：CI 抖动导致长期 flaky，团队会习惯性 re-run，门禁失效。
- _只做相对门禁_：无法发现「所有操作一起变慢」的整体回归，故保留发布期绝对门禁。
- _给 commit 也套 100 ms_：量级错配，会逼实现做与正确性冲突的优化（如异步清空工作树，违反 FR-011 的同事务语义）。

---

## R9. 迁移发布门禁：复验，不重写

**Decision**：FR-030 的判定**已实现**于 [check-migration-release-gate.mjs](../../scripts/check-migration-release-gate.mjs) 并有单测（39/39 绿）。本特性 **MUST NOT 重写该脚本**，只在真实 tag 与真实清单上复验。

脚本已实现的两条判据：

1. `git merge-base --is-ancestor <bridge-tag> <release-commit>`
2. `bridge.version` **严格新于** `LAST_INELIGIBLE_BRIDGE_VERSION`（当前 `'0.0.25'`），且 bridge tag 上的 `RXDB_SYSTEM_SCHEMA_VERSION` / `RXDB_CHANGE_CODEC_VERSION` 与本次升级位吻合

**Rationale**：`v0.0.24` 及更早的 tag 也是祖先、也含系统迁移面的四个文件，却早于工作树桥接改造——仅凭「是祖先」不足以做锚点，故需要第二条版本判据。

**npm release 由用户手动控制**：本 plan **不**把 release 排成自动步骤，也**不**把它排成开工前置。bridge 发布是 owner 决策，只阻塞**迁移发布**，不阻塞 US-305 开工。

**绝对禁止**：重打、移动或伪造已发布 tag（含 `v0.0.25`）；运行 `npm deprecate`。

**Alternatives considered**：

- _在本特性内重写门禁脚本_：已有实现与单测，重写是纯粹的回归风险。
- _把 bridge 发布排成 US-305 的前置任务_：与用户「release 手动、自己控制」的决定冲突，且技术上不必要。

---

## R10. 损坏守卫：一份共享实现，三个入口各自调用

**Decision**：US-305 交付**单一** `assertCommitGraphIntact` 等价守卫，从 branch ref 遍历**完整可达父链**，区分孤立损坏与可达损坏。US-306 阶段 B 的 `commit()`、US-307 的 `restore()`、US-308 的 switch-to **在各自写事务内**调用同一份实现。

**Rationale**：FR-051 + 横切约束 6 明确「不得各写一份损坏判定」。三份实现会在「什么算可达」上漂移，SC-013 要求三条入口**各自**返回 `commit_graph_corrupted`，只有共享实现能保证口径一致。

守卫必须在**写事务内**调用——事务外检查存在 TOCTOU 窗口。

**不受影响的操作**：不依赖重放的当前投影读取、诊断导出、**切离**该分支。

**Alternatives considered**：

- _启动时一次性全库校验_：100 commit × N 分支的遍历成本进入连接路径，且无法覆盖运行期新产生的损坏。
- _各入口各写一份_：直接违反 FR-051。

---

## R11. 迁移的分支物化判定复用既有重放引擎

**Decision**：FR-049 的「可完整物化」判定**复用**既有引擎，**MUST NOT 另写第二套**：

| 符号                         | 位置                                                      |
| ---------------------------- | --------------------------------------------------------- |
| `switch_branch_actions`      | `packages/rxdb/src/version/switch-branch-actions.ts:16`   |
| `get_switch_version_actions` | `packages/rxdb/src/version/switch-branch-actions.ts:122`  |
| `find_switch_branch_step`    | `packages/rxdb/src/version/find-switch-branch-step.ts:76` |

三个符号复核确认存在（2026-09-12）。判据：能从当前主库状态沿 `RxDBChange` 链**无缺口**走到该分支 tip 即可物化；已被清理的 change、压缩掉的区间、无法配平的回滚标记都构成断链。

**Rationale**：第二套重放引擎意味着迁移期与运行期对「同一条链是否可走通」给出不同答案，这正是 `branch_not_materializable` 最不该出现分歧的地方。

**Alternatives considered**：

- _为迁移写简化版遍历_：简化即分歧。
- _不做物化判定、迁移时尽力而为_：违反 FR-049「任一本地分支无法物化都 MUST 使迁移整体失败」，会留下部分启用状态。

---

## R12. 三框架入口形状

**Decision**：三端暴露同名同语义入口，运行时形状按各框架既有约定：

| 包             | 形状                                                     |
| -------------- | -------------------------------------------------------- |
| `rxdb-angular` | injectable + signal / observable，按包内既有 `use*` 约定 |
| `rxdb-react`   | hook（`useWorkingTree()`）                               |
| `rxdb-vue`     | composable（`useWorkingTree()`）                         |

命名门禁对三框架包**只适用负向规则**：无 `Workspace*` 新导出、不复用 `SwitchBranchOptions`、无 `Index*`。**`useWorkingTree()` 合规**——正向的 `Commit*` / `WorkingTree*` 前缀规则只约束核心共享契约，不能把框架侧的 `use*` 约定拦下。

门禁宿主：[scripts/audit/api-surface.mjs](../../scripts/audit/api-surface.mjs)（已存在），基线在 [requirements/api-baseline](../../requirements/api-baseline)。

**Rationale**：constitution 第三条要求三框架功能等价、公开 API 形状对称，单端缺失 = 未完成。但「对称」指语义与状态处理，不是逐字符同名——强行给 React hook 套 `Commit*` 前缀会破坏框架惯例。

**Alternatives considered**：

- _正向前缀规则也适用于三框架包_：会把合规的 `useWorkingTree()` 拦下，spec.md SC-014 已显式排除。
- _只做 React，其余后补_：违反 constitution 第三条。

---

## 未决项

无。Technical Context 中的 NEEDS CLARIFICATION 已全部解决。
