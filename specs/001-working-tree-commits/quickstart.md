# Quickstart: 验证「本地工作树与提交历史」

**Feature**: [spec.md](./spec.md) | **Plan**: [plan.md](./plan.md) | **Contracts**: [contracts/](./contracts/)

本文件是**验证指南**，不是实现指南。每个场景给出：怎么跑、看什么、绿的判据是什么。实现细节属于 `tasks.md` 与实现阶段。

> 旧 quickstart.md 里的 `stage` / `unstage` / 部分提交流程**全部作废**——v1 没有暂存区。

## 0. 前置

```bash
# Node 26 是硬性前置：不切 PATH 时 preinstall 直接失败
node -v          # 必须 v26+
pnpm -v          # 必须 10+
pnpm install
```

三个心智模型先对齐，否则场景全看不懂：

| 层                 | 是什么                    | 存哪                 |
| ------------------ | ------------------------- | -------------------- |
| 草稿缓存           | 编辑器未保存 buffer       | 插件独立 IndexedDB   |
| **工作树**         | working directory         | **主库业务表当前值** |
| **提交**           | commit                    | 主库 commit 图       |
| ~~index / 暂存区~~ | **v1 没有对照物，被裁掉** | —                    |

`entity.save()` ≈ Ctrl+S，**不等于** commit。保存后的内容对**全部查询立即可见**。

## 1. 单元与集成（每个阶段的主验证手段）

```bash
# TDD 循环：先红后绿
pnpm nx test rxdb --watch

# 核心包一轮
pnpm nx run-many -t lint test build --projects=tag:js-lib
```

**看什么**：新增用例先红再绿。`nx build` 报绿**不代表**类型无误——类型要单独看 `typecheck`。

## 2. 6 后端 × 2 套件（SC-006）

```bash
pnpm nx run-many -t test --projects=rxdb-adapter-pglite,rxdb-adapter-wa-sqlite,rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-electron
```

**绿的判据**：6 个包各自都实际调用了 `workingTreeCaptureConformanceSuite` 与 `workingTreeCommitConformanceSuite`（导出了但没人跑 = 没覆盖）。套件内容见 [contracts/conformance-suites.md](./contracts/conformance-suites.md)。

## 3. 场景验证

### 3.1 启用与零行为差异（US-305 / FR-046）

1. 打开一个**未启用**提交能力的既有数据库，跑既有回归。
2. **期望**：行为与未安装本特性逐字节一致；`workingTree` 上除 `enable()` / `isEnabled()` 外一律 `commit_capability_disabled`。
3. 调 `enable()`，再调一次。
4. **期望**：第二次**幂等命中**，不报错、不重置版本；每个既存分支都有 ref / state 初始行，`generation` 互不相同。

### 3.2 捕获完备性 —— 冷重放不变量（US-306 阶段 A / SC-009）

1. 依次做：普通 CRUD、显式事务、`mergeBranch()`、undo / redo、`pull()`、`pullRepository()`、`cleanupExpired()`。
2. 清空进程内缓存，用 `HEAD + WorkingTreeEntry` 重放。
3. **期望**：重放出的净状态**逐字段等于**业务表当前值。计数相等**不算**通过。
4. **期望**：`cleanupExpired()` 的过期删除落 `origin='remote_sync'` 的 DELETE 单元——远端同步**会**弄脏工作树，不按来源豁免。

### 3.3 status / diff 只有一条轴（US-306 阶段 B）

1. 改几条实体，`status()` 再 `diff()`。
2. **期望**：`diff()` **没有**第二个 range 参数；输出只描述 `HEAD ↔ 工作树`。
3. **期望**：`status().byOrigin` 同时展示 `local` 与 `remote_sync`。

### 3.4 提交是全量的（硬裁决 1）

1. 工作树里有 5 个未提交单元，`commit('msg')`。
2. **期望**：5 个**全部**进同一个 commit；`commit()` 上**没有** selection 入参；提交后工作树条目为 0、`entryCount` 为 0。
3. 想隔离一条工作线？用分支：`createBranch()` → 改 → `mergeBranch()` 或 `removeBranch()`。

### 3.5 `CommitConflict` 是返回值（SC-008，必须有这条用例）

1. Tab A：`status()` 拿到 `workingTreeRevision`。
2. Tab B：`save()` 改一条实体。
3. Tab A：带着第 1 步的 revision `commit()`。
4. **期望**：返回 `{ ok: false, conflict: { kind: 'working_tree_revision', … } }`——**不是**静默提交、**不是**抛异常、**不是**自动重试。
5. **期望**：`status().conflicted` **仍为 false**——它只由未结束的 restore session 派生，`CommitConflict` 不入库。
6. 恢复动作就是重新 `status()` → 复核 → 重新 `commit()`。

### 3.6 restore 不动历史（US-307）

1. `restore({ commitId: '<HEAD~1>' })`。
2. **期望**：内容作为**新的未提交变更**回到工作树；HEAD **没有移动**；历史**没有改写**；公开面上**不存在** `checkout()` 或 detached HEAD。
3. **期望**：`status().conflicted` 在会话存续期间为 true，会话 `committed` 后回到 false。

### 3.7 raw 写被挡在执行前（SC-010 / adapter 契约）

1. 用 `rawQuery` 直接 UPDATE 一张版本化业务实体表。
2. **期望**：抛 `commit_capability_mismatch`，且**业务表零变化**（执行前拒绝，不是写完回滚）。
3. 换成只改 `remoteId` / 同步水位 / 审计时间。
4. **期望**：放行，且**不创建单元、不递增 revision**。
5. 调 `upsertMany()` 写版本化实体。
6. **期望**：**返回 Observable 之前**同步拒绝——不订阅也必须已经拒绝。
7. **边界**：绕过 adapter 的外部数据库句柄**拦不住**，v1 不承诺拦得住。

### 3.8 崩溃恢复（SC-007）

1. 在「写完 changeSet 之后、CAS 之前」注入崩溃。
2. **期望**：恢复后**要么全有要么全无**；不出现半个 commit、半个事务或半清空的工作树；`entryCount` 与实际行数一致。

### 3.9 损坏 fail-closed（SC-013）

1. 损坏 HEAD 可达的某个祖先节点。
2. **期望**：该分支进入 `corrupted_read_only`；`commit()` / `restore()` / switch-to **三条入口各自**返回 `commit_graph_corrupted`，**不改指针、不删记录**。
3. **期望**：不依赖重放的当前投影读取、诊断导出、以及「切离」该分支**照常可用**；其他分支不受影响。

### 3.10 分支 ABA（US-308）

1. 记下分支 `b` 的 `(branchId, headRevision)`。
2. `removeBranch('b')`，再 `createBranch('b')`。
3. 用第 1 步的值做 CAS。
4. **期望**：**失败**——`generation` 不复用。

### T131 执行记录：§3 十场景逐条验证（2026-09-18）

**怎么跑的，以及为什么这么跑**：十个场景写的是「做什么、看什么」，不是十条可粘贴的命令。手工敲一遍
REPL 的结论不可复跑、也不会在明天的回归里再红一次，因此这里把每个场景**落到已经在守着它的那些用例
上**——逐条确认「该场景的每一个期望都有用例在断言」，再跑那些用例。没有为本次验证新写断言，也没有
把任何一条期望降格成「看着对」。两次实跑：

```bash
pnpm nx run rxdb-plugin-working-tree:test --skip-nx-cache -- --reporter=verbose
# → Test Files 63 passed (63) / Tests 1013 passed (1013)，7.32s

pnpm nx run-many -t test --projects=rxdb,rxdb-adapter-pglite,rxdb-adapter-wa-sqlite,\
  rxdb-adapter-sqlite-wasm,rxdb-adapter-sqlite,rxdb-adapter-sqliteai,rxdb-adapter-electron \
  --skip-nx-cache            # T130 那一跑，6 后端 × 2 套件的实测
# → 5025 passed，6 个适配器各红同一条（见下面 3.1 那一行）
```

| 场景                          | 落到哪些用例上（都在 `packages/rxdb-plugin-working-tree/src/__tests__/`，`*` 表示还在 6 后端上跑了一遍）                                                                                                                                                                                                                                                        | 结果                  |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| 3.1 启用与零行为差异          | `working-tree/facade-capability-gate.spec.ts`（11：豁免名单恰好是 `isEnabled`/`enable`，其余成员零参调用一律 `commit_capability_disabled`）、`commit/capability-enable.spec.ts`（11：重复启用命中 0 行即幂等、三个版本字段启用后只读）、`commit/enable-migration.spec.ts`（21：每个本地分支补出 ref / state，代际续单调源不复用既有号）\*                       | **9 绿 / 1 红**，见下 |
| 3.2 冷重放不变量              | `working-tree/cold-replay.spec.ts`（28）、`working-tree/crud-transaction.spec.ts`（23）、`working-tree/write-entry-matrix.spec.ts`（41，含「行 5 cleanupExpired → `remote_sync` 删除单元并递增 revision」）、`working-tree/capture-mount-points.spec.ts`（17）、capture 套件 §1.1 的五条「冷重放与业务表**逐字段**相等」\*                                      | 绿                    |
| 3.3 status / diff 只有一条轴  | `working-tree/diff.spec.ts`（18，首条即「`WorkingTreeDiffOptions` 的键集封闭，不含指向第二个比较端的入参」）、`working-tree/status.spec.ts`（19，含「byOrigin 按来源分组——`remote_sync` 不豁免」）                                                                                                                                                              | 绿                    |
| 3.4 提交是全量的              | `working-tree/commit-full-scope.spec.ts`（13：`CommitOptions` 键集封闭无 selection、运行期塞进去的 selection 形状不被认领、提交后条目清零 `entryCount` 归零）                                                                                                                                                                                                   | 绿                    |
| 3.5 `CommitConflict` 是返回值 | `working-tree/commit-cas-captured.spec.ts`（17：三个捕获位各一次比较、「另一个 Tab 在 status() 与 commit() 之间 save() 过：head 没动，提交仍被拒」、`commit_conflict` 不在错误码表里、失败后一次都没再打 CAS）、`working-tree/status.spec.ts` 的「CAS 失败只返回一次性 `CommitConflict`，不写任何持久冲突态」                                                   | 绿                    |
| 3.6 restore 不动历史          | `working-tree/restore-basic.spec.ts`（15：HEAD 一格不动、历史一行不删、门面上没有 `checkout` 也没有任何能停在历史节点上的入口）、`working-tree/restore-session-transitions.spec.ts`（12：会话 `committed` 后 `restoring`/`conflicted` 两位都灭）                                                                                                                | 绿                    |
| 3.7 raw 写被挡在执行前        | `working-tree/raw-bypass-judgment.spec.ts`（49，五步判定 + 解析不出即 fail-closed + 物理表名形态）、`working-tree/raw-write-gate-wiring.spec.ts`（7：启用后同一条语句被拒且执行器一次都没被调用）、`working-tree/observable-gate.spec.ts`（13：`upsertMany`/`deleteByIds` **调用即抛**，调用方手里没有 Observable）、capture 套件 §1.3 五步 + §1.2 行 9/行 10\* | 绿                    |
| 3.8 崩溃恢复                  | `working-tree/commit-atomicity.spec.ts`（14：四步同一个事务、写完 changeSet 就崩则工作树一条都没被清、revision 与 entryCount 是同一条 UPDATE、崩溃后不做补偿写）                                                                                                                                                                                                | 绿                    |
| 3.9 损坏 fail-closed          | `commit/corruption-guard.spec.ts`（19：沿**完整可达父链**遍历、孤立损坏只隔离、校验只读）、`working-tree/commit-corruption-entry.spec.ts`（20）、`working-tree/switch-to-corruption.spec.ts`（15，含「切离损坏分支照常放行」）、commit 套件 §2.5 的四入口 × 四形态表（守卫本身 / `commit()` / `restore()` / switch-to）\*                                       | 绿                    |
| 3.10 分支 ABA                 | `working-tree/remove-branch-aba.spec.ts`（12：删除既不退号也不发号、同名重建拿到严格更大的代际、重建后旧幂等键不碰撞）、`working-tree/activation-cas.spec.ts`（18：CAS 落空是 `CommitConflict` 值且不重试）                                                                                                                                                     | 绿                    |

**记录当时的唯一一条红，以及它后来怎么消的**：初次实跑时 6 个适配器各红 1 条，逐字节相同——
`commit.suite.ts §2.2 一次性启用迁移（US-305） > enable() 之后新建的分支自带 ref / state，且代际不与既有分支撞号`，
期望 `head: null`、实得一个真实 commit id。**它压的不是 3.1 第 4 步的原文**：第 4 步问的是
「**既存**分支在 `enable()` 之后都有 ref / state 初始行」，那一格由 `enable-migration.spec.ts` 的
21 条在单元层、由捕获套件在 6 后端上守着，从头到尾都是绿的。红的是它的**邻接面**——`enable()` 之后再
`createBranch()` 出来的新分支。

**判定结果是断言写反了，不是实现错了**：FR-017 写明「`createBranch(branchId)` 保留从当前物化状态
创建的行为，复制独立 working-tree snapshot 并**共享当前 HEAD**」，而 `src/commit/branch-commit-rows.ts`
的 `copyCurrentMaterialization()` 正是这么落的；那条断言写于 `head` 仍恒为 `null` 的年代。断言已按
FR-017 收紧成 `head: sourceRef.headCommitId`，并另加一条「源 HEAD 非空」挡住空过，6 后端复跑全绿
（详见 `tasks.md` T130）。

**因此本条的结论**：十个场景逐条绿。第 1 个场景在它自己写明的那一格从未红过；紧邻那一格的红是
US-305 启用面上套件与实现的一处未对齐，已按规格判归属并修正，不是把期望放宽换来的绿。

## 4. 三框架对称（阶段 C 收口）

```bash
pnpm nx run-many -t test --projects=rxdb-angular,rxdb-react,rxdb-vue
pnpm nx serve dev-rxdb-angular   # 手动看 loading / empty / error
```

**绿的判据**：[contracts/tri-framework-api.md](./contracts/tri-framework-api.md) §3 的清单**三端齐全**，任一端缺一项 = 阶段 C 未完成。a11y 走 Playwright，WCAG 2.1 AA。

## 5. 门禁

```bash
# 覆盖率（单一真相源，不另设阈值）
node scripts/audit/coverage-check.mjs

# 公开面 / 命名门禁（SC-014）
node scripts/audit/api-surface.mjs

# 性能
pnpm nx run benchmarks:bench-working-tree

# 迁移发布门禁（FR-030）—— 只复验，不重写
node --test scripts/check-migration-release-gate.spec.mjs
```

**判据**：

- 覆盖率：`rxdb` / `rxdb-angular` / `rxdb-react` / `rxdb-vue` 四指标 ≥ 90%，其余包 ≥ 80%。
- 命名：核心新增导出全部 `Commit*` / `WorkingTree*`；无 `Index*`；三框架包无 `Workspace*`、不复用 `SwitchBranchOptions`；`useWorkingTree()` 合规。
- 性能：普通 PR 只卡**归一化 ratio ≤ 冻结 median 的 110%**；绝对 p95 仅在 `runnerProfileHash` 匹配的 runner 上作为发布门禁；`commit` **不套用 100 ms**。profile 不匹配 → `benchmark_environment_mismatch`，**不得**当成性能回归。
- 发布门禁脚本已实现且 39/39 单测绿，**MUST NOT 重写**；只在真实 tag 与真实清单上复验。

### T045 执行记录：FR-030 迁移发布门禁复验（2026-09-13）

**跑过的四条命令与真实结果**：

```bash
node --test scripts/check-migration-release-gate.spec.mjs
# → tests 39 / pass 39 / fail 0

node scripts/check-migration-release-gate.mjs --check --release-tag=v0.0.25
# → Migration release gate passed for bridge 0.0.25.   (exit 0)
```

**仓库实况**（钩子读的就是这些，不是假设）：仓库里只有 `v0.0.24` 与 `v0.0.25` 两个 tag；`v0.0.24` 是 HEAD
的祖先，`v0.0.25` **不是**（squash 之后脱离主线）；`packages/rxdb/package.json` 的版本是 `0.0.25`；HEAD 的
系统常量现为 `{ systemSchema: 4, changeCodec: 1 }`，`v0.0.24` 上是 `{ 3, 1 }`。

签入的 `requirements/migration-release.json` 是 `kind: "bridge"` 且 `bridge.tag: null`，所以上面那次通过
**根本走不到** migration 分支的四条 git 钩子。为了让「`bridge.tag` 是祖先」「`bridge.version` 严格新于
`LAST_INELIGIBLE_BRIDGE_VERSION`」两条结论**被真正执行而不是被推断**，另外在 `/tmp` 下造了三份一次性
migration 清单跑门禁——**不入库、不打 tag、不改脚本、不触发任何发布动作**：

| 探针 | 清单要点                                                                                    | 门禁输出                                                                                                                                  |
| ---- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| A    | `bridge.tag = v0.0.24`（真祖先），`systemSchemaUpgrade: true` / `changeCodecUpgrade: false` | **只剩一条**错误：`bridge.version must be newer than 0.0.25`                                                                              |
| B    | `bridge.tag = v0.0.25`（非祖先）                                                            | 多出 `bridge.tag v0.0.25 is not an ancestor of the release commit`                                                                        |
| C    | 与 A 同 tag，但两个升级位对调                                                               | `system schema version changed from 3 (bridge.tag v0.0.24) to 4`、`change codec version did not advance past bridge.tag v0.0.24 (1 -> 1)` |

**四条结论**：

1. **祖先钩子是活的，且有判别力**：同一份门禁对 A 不报、对 B 报，说明它真的跑了
   `git merge-base --is-ancestor`，不是恒真的橡皮图章。
2. **版本常量钩子确实从 tag 上读源码**：C 报出的 `3 -> 4` 与 `1 -> 1` 是从 `v0.0.24` 与工作树两侧读出来的
   真值。因此 A 在这条轴上的沉默是**真通过**，不是钩子没跑——没有这个反向对照，A 的「只剩一条错误」
   证明不了任何东西。
3. **`LAST_INELIGIBLE_BRIDGE_VERSION = '0.0.25'` 的严格下限，是 A 里唯一的拦截点**：存在性 / 祖先性 /
   协议面 / 版本常量四条 tag 钩子加 `oldBundlePolicy` 全部放行，门禁仍然红。这正是 epic-006 发布门禁 1
   「且不是 v0.0.25」的可执行形式。
4. **migration 分支的正向通过路径今天无法用真实 tag 走通**，而且这是设计如此：下限要求 `bridge.version`
   严格大于 `0.0.25`，仓库里不存在这样的 tag，造一个等于伪造发布锚点。该路径由 39 条注入钩子的单测覆盖——
   这也正是那些钩子被做成可注入的原因。

**一处随时间漂移、但不构成改脚本理由的事实**：脚本 `LAST_INELIGIBLE_BRIDGE_VERSION` 的 TSDoc 写于
系统 schema 还是 3 的时候，称 `v0.0.24` / `v0.0.25` 的常量「与今天的 HEAD 完全相同」；3 → 4 的迁移落地后
HEAD 已是 `{4, 1}`，那句话的**前提**不再成立。**结论不变**：探针 A 证明一个如实声明升级的 migration 清单
照样能过完四条 tag 钩子，挡住它的仍然只有这个下限。本任务**MUST NOT 重写该脚本**，此处只记录，不改动。

## 6. 发布

**npm release 由维护者手动控制**，不是本特性的任务链的一环，也不是开工前置。本 quickstart 不提供发布命令。
