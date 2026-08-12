---
id: US-306
title: 工作树、缓存区与提交操作
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-13
updated: 2026-08-13
tags: [collaboration, working-tree, staging, diff, angular, react, vue]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-305 的 commit 图，但状态机、diff 与三端 API 自成一条交付线
- [x] Negotiable: 导出名、事件名和 diff 结构可在 plan 阶段冻结
- [x] Valuable: 用户第一次能选择性提交，并在刷新后接着上次干
- [x] Estimable: 状态集合、操作契约与 bench fixture 已列出
- [x] Small: 不含 restore、不含分支切换、不含跨标签页冲突协议
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
- Angular / React / Vue 三端对称 API 与演示
- `nx run benchmarks:bench-working-tree` 中 status / diff / stage 的性能基线

### Out of Scope

- commit 图、HEAD、分支引用的存储布局与迁移 —— 属 [US-305](./US-305-commit-graph-head.md)
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
3. **Given** 只有 NEW 草稿、没有 HEAD，**When** 应用启动，**Then** 草稿仍按 Workspace 插件规则恢复，并在首次提交时作为普通 INSERT 变更进入 commit。

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

## 功能需求

- **FR-004**：系统 MUST 提供工作树 status，至少区分 clean、仅未暂存、仅已暂存、同时存在 staged/unstaged、恢复中和冲突状态。
- **FR-005**：系统 MUST 提供面向实体或完整事务的 diff，能够分别比较 `HEAD ↔ 工作树` 和 `HEAD ↔ 缓存区`。
- **FR-006**：系统 MUST 支持 stage、unstage、stage all 和 clear index；这些操作不得修改已有 commit，也不得丢弃未选择的工作树变更。
- **FR-007**：系统 MUST 在 stage 后再次发生编辑时保留 staged 快照，并把新增部分标记为 unstaged；禁止隐式扩大 stage 范围。
- **FR-011**：系统 MUST 在 commit 成功后只清除已提交的缓存区变更；未暂存变更继续留在工作树并显示准确 diff。
- **FR-016**：系统 MUST 支持 discard working tree 和 clear index，且两者操作范围明确：前者回到当前 HEAD，后者只清除暂存选择。
- **FR-023**：系统 MUST 为所有异步操作提供可观察的 loading、success、empty 和 error 状态；错误必须说明操作、对象和恢复建议。
- **FR-026**（已改口径）：系统 MUST 在 `benchmarks/` 现有框架下新增 `bench-working-tree`，对 status / diff / stage 采样并输出 p50/p95 与 JSON 报告；门禁判定为**相对基线的回归百分比**，沿用 `MAX_REGRESSION_PCT` 的做法。固定 fixture 为 10,000 条实体记录 / 100 个 commit，基准环境为 Node + PGlite memory（与 `benchmarks/non-encrypted-hot-path.bench.ts` 一致）。**不承诺**浏览器 OPFS / IDB 下的同一数字。

> FR-026 原文是「用户可见响应 MUST 在 100 ms 内完成」。这句话没有指定设备、存储后端、统计口径，
> 也没有定义「用户可见响应」是 promise resolve 还是首次绘制——在 CI 上做绝对墙钟断言必然抖动，
> 等于写了一条永远可以被解释成通过或不通过的验收条件。仓库里已有的两个 bench
> （[benchmarks/](../../../benchmarks/)）用的是 warmup + p50/p95 + 相对回归门禁，这里沿用同一套。

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
- 三端各有等价的单元/组件测试，并用跨框架 E2E 验证 status → stage → commit → refresh 流程。
- 失败、空状态、键盘可达性和屏幕阅读器名称必须有 UI 回归测试；测试文件使用 `*.spec.ts`，不依赖固定延时。
- `nx run benchmarks:bench-working-tree` 纳入 CI，报告写入 `benchmarks/reports/`。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — 工作树与缓存区状态机、diff
- `packages/rxdb/src/system/` — 工作树/缓存区元数据表
- `packages/rxdb-plugin-workspace/` — NEW 草稿与工作树状态的整合边界
- `packages/rxdb-{angular,react,vue}/` — 对称的 hooks / composables / signals
- `apps/dev-rxdb-{angular,react,vue}/` — 三端工作树演示
- `benchmarks/working-tree.bench.ts` — FR-026 的判定依据（新增）
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-305 提交图与 HEAD 持久化](./US-305-commit-graph-head.md)
- [US-307 历史恢复会话](./US-307-restore-session.md)
- [US-308 分支隔离与跨 realm 冲突检测](./US-308-branch-isolation-conflict.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md)
- [Workspace 插件文档](../../../website/docs/plugins/rxdb-plugin-workspace/README.md)
