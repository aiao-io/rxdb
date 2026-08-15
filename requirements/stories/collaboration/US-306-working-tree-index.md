---
id: US-306
title: 工作树、缓存区与提交操作
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-15
tags: [collaboration, working-tree, staging, diff, angular, react, vue]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-305 的 commit 图，但状态机、diff 与三端 API 自成一条交付线
- [x] Negotiable: 导出名、事件名和 diff 结构可在 plan 阶段冻结
- [x] Valuable: 用户第一次能选择性提交，并在刷新后接着上次干
- [x] Estimable: 状态集合、操作契约与 bench fixture 已列出
- [~] Small: **本 Epic 里最大的一个故事，Small 存疑但已有意保留**。不含 restore、不含分支切换、不含跨标签页冲突协议；2026-08-15 二轮复审已把共用 bench 基建前置到 US-305（FR-037）、把判定基准前置到 US-305（FR-036）以卸掉两块。剩余的三端绑定 + demo 未再拆，因为它们与状态机共享同一套导出名和状态枚举，先拆会制造一次纯粹为拆而拆的契约冻结。plan 阶段若确认导出可先冻结，允许再拆出 US-306b 承接三端绑定与 demo，届时 FR-024 / FR-025 随之只对 US-306b 生效。见 [epic-006「US-306 的体量说明」](../../epics/epic-006-working-tree-commits.md)。
- [x] Testable: 「改 → stage → 刷新 → commit → 查 status」可独立验收
-->

# 用户故事：工作树、缓存区与提交操作

> Epic 级的术语表、横切 DoD 与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> commit 图与 HEAD 的存储契约见 [US-305](./US-305-commit-graph-head.md)。

## 作为/我想要/以便

**作为** 需要控制发布边界的开发者
**我想要** 先在工作树里改，再选择一部分变更进入缓存区，然后用消息提交
**以便** 一次编辑可以拆成多个有意义的版本，且刷新后不必重新判断上次做到哪一步

## 术语与状态模型

| 概念                    | 含义                                                                | 持久化要求                     |
| ----------------------- | ------------------------------------------------------------------- | ------------------------------ |
| 工作树（`WorkingTree`） | 当前分支上用户实际看到和编辑的实体状态，含已落本地库但未提交的修改  | 必须持久化；刷新后恢复原状     |
| 缓存区（`Index`）       | 用户明确选择、准备放入下一次 commit 的变更集合                      | 必须持久化；与工作树分离       |
| 工作树状态              | `clean`、`modified`、`staged`、`conflicted`、`restoring` 等可见状态 | 状态重建结果稳定，不依赖内存栈 |

变更选择粒度为「实体操作或完整事务」，同一事务不可拆到不同 commit。

### 作用域：工作树与缓存区都是共享资源

这一条必须写死，否则 [US-308](./US-308-branch-isolation-conflict.md) 的跨标签页 AC 无法判定：

- 工作树**就是**本地库里的物化数据。同源多标签页打开同一数据库时，它们看到的是**同一份**工作树，不是各自的副本——B 标签页的编辑会直接出现在 A 的工作树里，这不是冲突，是共享。
- 缓存区要求持久化，因此同样是 **per-(database, branch) 的共享资源**，不是 per-tab、per-realm 的会话状态。两个标签页 stage 同一分支时操作的是同一个 index。
- 由此，真正需要并发保护的只有两处：**HEAD 在提交期间被推进**，以及 **staged 快照相对工作树当前版本已过期**。"另一方的修改被静默丢弃"只可能以这两种形式出现，协议见 US-308。

### 状态关系

```text
                    stage / unstage
工作树（当前数据） ─────────────────────► 缓存区（下一次 commit）
       │                                      │
       │ discard / reset to HEAD              │ commit（原子）
       ▼                                      ▼
     HEAD 状态                            新 commit ───► 分支 HEAD
```

## 范围边界

### In Scope

- 工作树与缓存区状态的持久化与刷新后重建
- `status()`：至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中、冲突
- `diff(scope?)`：分别比较 `HEAD ↔ 工作树` 与 `HEAD ↔ 缓存区`
- `stage` / `unstage` / stage all / `clearIndex`
- `commit(message, metadata?)`：只提交缓存区内容，保留未暂存修改
- `discardWorkingTree()`：回到当前 HEAD
- stage 后再次编辑时保留 staged 快照，新增部分标记为 unstaged
- 迁移登记的 NEW 草稿物化进工作树（[US-305 FR-021](./US-305-commit-graph-head.md) 的对侧）
- Angular / React / Vue 三端对称 API 与演示
- 在 US-305 建好的 `bench-working-tree` harness 中补 status / diff / stage 场景并冻结阈值

### Out of Scope

- commit 图、HEAD、分支引用的存储布局与迁移 —— 属 [US-305](./US-305-commit-graph-head.md)
- 「已提交 / 未提交」判定基准的**选定** —— 属 [US-305 FR-036](./US-305-commit-graph-head.md)；本故事消费该基准，不自行发明
- bench harness、target 注册与固定 fixture —— 属 [US-305 FR-037](./US-305-commit-graph-head.md)；本故事只加场景
- 历史恢复会话 —— 属 [US-307](./US-307-restore-session.md)（本故事只需让 `status()` 能表达 `restoring`）
- 分支切换与跨标签页冲突检测 —— 属 [US-308](./US-308-branch-isolation-conflict.md)
- 字段级或代码行级的部分暂存
- 自动 stash / stash pop

## 用户场景与验收标准

### User Story 1 - 刷新后继续未提交工作（Priority: P1）

**独立测试**：创建、修改、删除若干实体，stage 一部分，刷新或关闭并重新打开；只依赖本地存储即可验证。

**验收场景**：

1. **Given** 当前分支有一个已提交的 HEAD，**When** 用户修改实体但不 commit 后刷新，**Then** 工作树数据、未暂存标记和对应 diff 与刷新前一致。
2. **Given** 缓存区已有实体变更，**When** 用户刷新或重新打开应用，**Then** 缓存区选择、变更顺序和事务边界保持不变。
3. **Given** 只有 NEW 草稿、HEAD 处于 unborn（[US-305 FR-030](./US-305-commit-graph-head.md)），**When** 应用启动，**Then** 草稿仍按 Workspace 插件规则恢复，`status()` 把全部工作树数据视为未提交变更而非报错，并在首次提交时作为普通 INSERT 变更进入 commit。
4. **Given** 迁移已把既有 NEW 草稿**登记**为「待纳入工作树」（[US-305 FR-021](./US-305-commit-graph-head.md) 只做登记，不做物化），**When** 本故事的工作树首次重建，**Then** 这些登记项被物化为工作树中的普通未提交变更，登记标记随之清除，且重复启动不会重复物化。
5. **Given** HEAD 为 unborn，**When** 用户调用 `discardWorkingTree()`，**Then** 工作树回到"空基线"（没有 HEAD 可回退到），操作结果明确且不报未定义错误。

### User Story 2 - 暂存并提交一组变更（Priority: P1）

**独立测试**：对两个实体做不同修改，只 stage 其中一个并提交，检查 HEAD、日志和另一个实体的工作树状态。

**验收场景**：

1. **Given** 工作树包含两个实体的修改，**When** 用户只 stage 其中一个并 commit，**Then** 新 commit 只包含被 stage 的变更，另一个修改仍在工作树且未进入该 commit。
2. **Given** 缓存区为空，**When** 用户提交，**Then** 操作被拒绝，不创建空 commit，工作树和 HEAD 均不改变。
3. **Given** stage 后实体再次修改，**When** 用户查看 status/diff，**Then** 系统分别展示「已暂存版本」和「未暂存版本」，不会把新修改静默并入旧 stage。
4. **Given** stage 集合包含一个多实体事务，**When** 用户 commit，**Then** 该事务作为一个不可拆分的变更单元写入 commit。
5. **Given** 删除实体后 stage，**When** 查看 diff，**Then** 必须显示删除，而不是显示为空或消失。
6. **Given** commit 成功，**When** 查看工作树，**Then** 只清除已提交的缓存区条目，未暂存变更继续留在工作树并显示准确 diff。
7. **Given** 空事务、重复 stage、重复 discard，**When** 反复执行，**Then** 幂等，不产生额外 commit 或错误历史。

### User Story 3 - 丢弃与清空（Priority: P2）

**验收场景**：

1. **Given** 工作树有未提交修改，**When** 用户 `discardWorkingTree()`，**Then** 工作树回到当前 HEAD，未提交 stage 一并清除，历史 commit 不变。
2. **Given** 缓存区有条目，**When** 用户 `clearIndex()`，**Then** 只清除暂存选择，工作树数据不变。
3. **Given** 同一事务跨多个实体且含外键依赖，**When** discard，**Then** 在事务边界内整体回滚，不留下部分实体的中间态。
4. **Given** 工作树有未提交修改，**When** 用户 discard 后查看 `RxDBChange` 与 undo 栈，**Then** 原有变更记录仍在（未被删除或改写），discard 本身以反向变更追加，undo 可观察到它——即 discard 不是"历史被抹掉"而是"又发生了一次变更"（FR-033）。
5. **Given** 一个标签页执行 discard，**When** 另一同源标签页查询 `status()`，**Then** 看到同一结果（FR-034），不出现两个标签页各持一份工作树状态的分叉。
6. **Given** 工作树有未提交修改，**When** 用户 discard 后立即查询 `status()`，**Then** 结果为 **clean**，**且** `RxDBChange` 记录数相对 discard 前**增加**（反向变更已追加）。这两条 MUST 在**同一个**用例里断言——它是 [US-305 FR-036](./US-305-commit-graph-head.md) 判定基准的不变式检查点，分开写就测不出「基准选错导致 discard 后永远不 clean」这个失效模式。

## 功能需求

- **FR-004**：系统 MUST 提供工作树 status，至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中和冲突状态。
- **FR-005**：系统 MUST 提供面向实体或完整事务的 diff，能够分别比较 `HEAD ↔ 工作树` 和 `HEAD ↔ 缓存区`。
- **FR-006**：系统 MUST 支持 stage、unstage、stage all 和 clear index；这些操作不得修改已有 commit，也不得丢弃未选择的工作树变更。
- **FR-007**：系统 MUST 在 stage 后再次发生编辑时保留 staged 快照，并把新增部分标记为 unstaged；禁止隐式扩大 stage 范围。
- **FR-011**：系统 MUST 在 commit 成功后只清除已提交的缓存区变更；未暂存变更继续留在工作树并显示准确 diff。
- **FR-016**：系统 MUST 支持 discard working tree 和 clear index，且两者操作范围明确：前者回到当前 HEAD，后者只清除暂存选择。
- **FR-023**：见 [epic-006 横切约束](../../epics/epic-006-working-tree-commits.md)；本故事的全部异步操作（status / diff / stage / unstage / commit / discard）适用。
- **FR-026**（已改口径；harness 已前置到 US-305）：系统 MUST 在 [US-305 FR-037](./US-305-commit-graph-head.md) 建立的 `bench-working-tree` harness 中**补充 status / diff / stage 三个 A/B 场景**并冻结其阈值。MUST NOT 重复注册 target 或另起 bench 文件。门禁判定沿用 harness 的口径：同一次运行内 A = 未启用 commit 能力的基线路径、B = 启用工作树/commit 后的同一操作，判定值 `(B.p50 - A.p50) / A.p50`；p95 输出但不作为门禁；固定 fixture 为 10,000 条实体 / 100 个 commit，基准环境 Node + PGlite memory（与 [non-encrypted-hot-path.bench.ts](../../../benchmarks/non-encrypted-hot-path.bench.ts) 一致），**不承诺**浏览器 OPFS / IDB 下的同一数字。
  阈值冻结 MUST 同时给出两样东西：**实测分布**，**以及独立论证的上限**（例如「stage 相对基线的额外写次数理论上限 = N，据此取阈值 X%」）。只把首次实测值直接当阈值是循环论证——验收标准由被它门禁的那个 PR 自己写，抓不到它自己引入的回归。
- **FR-033**（新增）：`discardWorkingTree()` MUST 以**追加反向变更**的方式回到 HEAD，MUST NOT 删除或改写既有 `RxDBChange` 记录——后者等于改写变更日志，与 [FR-018](./US-305-commit-graph-head.md) 冲突。由此 discard 本身是一次可被 undo 观察到的变更；该行为 MUST 有明确断言的验收用例，不得留给实现自行决定。
  本条与 [US-305 FR-036](./US-305-commit-graph-head.md)（「已提交 / 未提交」判定基准）**互相约束**，必须一起读：discard 既然是追加而非删除，若判定基准是「变更日志中晚于最后一次 commit 的条目」，那么 discard 之后日志反而变长、`status()` 永远回不到 clean，两条需求互相否定。因此 FR-036 已禁止该推导，本故事的实现 MUST 建立在 FR-036 选定的基准之上，MUST NOT 自行发明第二套判定。
- **FR-034**（新增）：工作树与缓存区 MUST 是 per-(database, branch) 的持久化共享资源，对同源多标签页可见同一份状态；MUST NOT 实现为 per-tab / per-realm 的会话副本。任一标签页的 stage / unstage / discard 结果 MUST 对其他标签页可观测。

> FR-026 原文是「用户可见响应 MUST 在 100 ms 内完成」。这句话没有指定设备、存储后端、统计口径，
> 也没有定义「用户可见响应」是 promise resolve 还是首次绘制——在 CI 上做绝对墙钟断言必然抖动，
> 等于写了一条永远可以被解释成通过或不通过的验收条件。
>
> 注意仓库现状：只有 [non-encrypted-hot-path.bench.ts](../../../benchmarks/non-encrypted-hot-path.bench.ts)
> 带门禁（`MAX_REGRESSION_PCT = 2`），`encryption.bench.ts` 只出报告；而且那条门禁比较的是**同一次运行内**
> 的 plain vs 加密插件两组，判定用 **p50**，仓库里并不存在"落库历史基线"这种东西。因此这里采用与它同构的
> A/B 对照，而不是跨 run 比历史基线——后者只是把绝对毫秒换成绝对毫秒的差值，一样吃机器波动。口径详见
> [epic-006 性能预算](../../epics/epic-006-working-tree-commits.md)。

## 关键实体

- **WorkingTreeState**：当前数据库/分支的工作树状态；基于哪个 HEAD、是否恢复中、未提交变更计数、最后一次持久化版本。
- **IndexEntry**：缓存区条目；变更单元 ID、基线 commit、暂存快照、工作树版本、stage 时间。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：不得使用 `Workspace*` 前缀。

## 设计展开

### 操作契约

具体导出名在 plan 阶段冻结，语义保持以下边界：

| 操作                         | 语义                                | 是否创建 commit |
| ---------------------------- | ----------------------------------- | :-------------: |
| `status()`                   | 返回工作树、缓存区、HEAD 和冲突摘要 |       否        |
| `diff(scope?)`               | 比较 HEAD、缓存区、工作树的变更     |       否        |
| `stage(selection)`           | 将实体或事务的当前版本复制进缓存区  |       否        |
| `unstage(selection)`         | 从缓存区移除选择，工作树不变        |       否        |
| `commit(message, metadata?)` | 原子写入 commit 并移动当前分支 HEAD |       是        |
| `discardWorkingTree()`       | 丢弃工作树未提交变更并回到 HEAD     |       否        |
| `clearIndex()`               | 清空暂存选择                        |       否        |

### 边界情况

- stage 的实体已被其他 writer 删除或更新：提交前重新校验版本指纹，返回冲突而不是使用过期快照（冲突协议见 [US-308](./US-308-branch-isolation-conflict.md)）。
- 存储配额不足、浏览器禁用持久化或 schema 升级失败：明确报告持久化不可用，禁止把状态伪装成已保存。
- undo/redo 与 commit 同时触发时按调用顺序串行化；redo 仍是会话级能力，不能被误报为 durable commit。

## 测试要求

- 核心包按 TDD 先写刷新恢复的失败用例，再实现；覆盖率不低于 90%。
- discard 与变更日志的关系必须有专门用例（FR-033）：断言 `RxDBChange` 记录未被删除、discard 以反向变更追加、undo 行为可预测。
- **判定基准的不变式必须有一条合并断言的用例**（User Story 3 场景 6）：同一用例内同时断言 discard 后 `status()` 为 clean **且** `RxDBChange` 记录数增加。这是 [US-305 FR-036](./US-305-commit-graph-head.md) 选错基准时唯一会红的用例，拆成两条就测不出来。
- 工作树/缓存区共享语义必须有跨 realm 用例（FR-034）：两个 realm 打开同一数据库，一端 stage/discard，另一端 `status()` 收敛到同一结果。
- 三端各有等价的单元/组件测试，并用跨框架 E2E 验证 status → stage → commit → refresh 流程。
- 失败、空状态、键盘可达性和屏幕阅读器名称必须有 UI 回归测试；测试文件使用 `*.spec.ts`，不依赖固定延时。
- `nx run benchmarks:bench-working-tree` 的 status / diff / stage 场景纳入 CI（target 本身由 [US-305 FR-037](./US-305-commit-graph-head.md) 注册）。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 工作树与缓存区状态机、diff
- `packages/rxdb/src/system/` — 工作树/缓存区元数据表
- `packages/rxdb-plugin-workspace/` — NEW 草稿与工作树状态的整合边界
- `packages/rxdb-{angular,react,vue}/` — 对称的 hooks / composables / signals
- `apps/dev-rxdb-{angular,react,vue}/` — 三端工作树演示
- `benchmarks/working-tree.bench.ts` — **在 US-305 建好的 harness 中追加** status / diff / stage 场景与阈值常量；本故事**不**新建文件、**不**改 `benchmarks/project.json`
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-305 提交图与 HEAD 持久化](./US-305-commit-graph-head.md)
- [US-307 历史恢复会话](./US-307-restore-session.md)
- [US-308 分支隔离与跨 realm 冲突检测](./US-308-branch-isolation-conflict.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md)
- [Workspace 插件文档](../../../website/docs/plugins/rxdb-plugin-workspace/README.md)
