---
id: RV-007
title: Epic-006 工作树提交设计存在分支、迁移、物化与写入门禁冲突
status: Open
created: 2026-08-22
updated: 2026-08-22
pr:
---

# Review：Epic-006 工作树与提交历史深度评审

## 问题

### P0：`createBranch(branchId)` 的脏工作树语义冲突

Epic 的 revision 矩阵允许从当前工作树创建分支（[epic-006:152](../epics/epic-006-working-tree-commits.md:152)），US-308 要求一参 `createBranch()` 复制独立的未提交工作树快照、index 置空（[US-308:113](../stories/collaboration/US-308-branch-isolation-conflict.md:113)）。但核心 API 契约又要求新分支工作树和 index 均为空、不继承源分支未提交内容（[core-api:275](../../specs/001-working-tree-commits/contracts/core-api.md:275)）。

三者无法同时实现。实现团队无法判断新分支是否应看到源分支的 dirty 数据，测试也无法同时满足两个验收结果；如果复制快照，还必须明确源分支的 staged 内容在新分支是否转为 unstaged，以及 `baseHeadCommitId` 和 revision 如何初始化。

**根因**：Epic、US-308 与 Phase 1 core contract 没有统一一参 `createBranch()` 的语义。

**修复方案**：选定“复制 dirty 快照”或“只从 HEAD 创建”其中一种，随后同步 Epic、US-308、`spec.md`、`data-model.md`、core API 和 conformance fixture。不要把决策继续留给 plan 阶段。

### P0：bridge tag 的责任分配形成发布死锁

Epic 把“先产出新的非迁移 bridge tag”明确交给 US-305（[epic-006:314](../epics/epic-006-working-tree-commits.md:314)）。但发布计划明确指出 bridge 不能塞进包含 system schema migration 的 US-305，否则 migration 依赖尚不存在的 bridge，形成死锁（[release-plan:38](../release-plan.md:38)）。当前 manifest 的 bridge tag 仍为空（[migration-release.json:3](../migration-release.json:3)），而历史 `v0.0.25` 已不在当前 ancestry。

**根因**：US-305 同时被定义为“迁移发布”和“生成迁移前置 bridge”的所有者，发布顺序不可能满足自身依赖。

**修复方案**：增加独立的、先于 US-305 的 bridge 发布事项，并让 US-305 只依赖一个已经存在、且满足 ancestry gate 的真实 tag。删除或重写 US-305 的 bridge 产出责任，manifest 只能在实际 tag 产生后回填。

### P0：metadata-only 分支首次切换的行为与核心契约相反

Epic/US-308 要求首次 `switchBranch()` 自动建立 materialization attempt、分页预取并最终物化（[US-308:118](../stories/collaboration/US-308-branch-isolation-conflict.md:118)）。核心契约却规定未物化目标直接返回 `branch_not_materialized`，且“不自动物化”（[core-api:264](../../specs/001-working-tree-commits/contracts/core-api.md:264)）。

按核心契约实现会直接失败 US-308 的 AC；按 Epic 实现又会违反公开 API 的错误语义。另一个未闭合点是同步水位：现有 `RxDBSync` 按 entity+branch 保存水位（[sync.ts:121](../../packages/rxdb/src/system/sync.ts:121)），pull 从目标分支记录的 `lastPullRemoteChangeId` 开始（[pull-repository.ts:493](../../packages/rxdb/src/version/pull-repository.ts:493)），但 staging 只有抽象的单个 watermark（[data-model:325](../../specs/001-working-tree-commits/data-model.md:325)），最终提交屏障也没有明确创建或更新目标 `RxDBSync` 行。

**根因**：自动物化策略未在 Epic 与 core contract 间统一；多实体同步的 per-repository 水位没有定义从 staging 到目标分支的落点。

**修复方案**：二选一：保留自动物化并修改 core contract，明确重试、并发与失败语义；或保留显式 `branch_not_materialized` 并删除 Epic/US-308 的自动预取要求。同时定义 scope manifest 中的每实体水位，以及目标 `RxDBSync` 行的原子初始化规则。

### P1：远端冲突裁决没有定义工作树与 index 的替换规则

Epic 要求 pull/autoSync 的实体净变化都写入 `origin=remote_sync` 工作树条目（[epic-006:172](../epics/epic-006-working-tree-commits.md:172)）。现有 pull 在同一事务中处理冲突：`KEEP_REMOTE` 应用远端 action，并把本地 `RxDBChange` 标记为 superseded（[pull-repository.ts:611](../../packages/rxdb/src/version/pull-repository.ts:611)）；冲突工具也只记录要 supersede 的本地 change（[pull-conflict-utils.ts:244](../../packages/rxdb/src/version/pull-conflict-utils.ts:244)）。

文档没有规定对应的 `WorkingTreeEntry` 是否删除、替换或重算，也没有规定已有 staged snapshot、依赖闭包和 revision 如何变化。若只追加 remote entry，工作树可能仍包含已经输掉的 local patch，后续 commit 或冷重放会重新带回旧值；若直接删除，又可能破坏 index 自包含不变量。

**根因**：RxDBChange 的 supersession 语义没有映射到新的工作树/index 真相源。

**修复方案**：为 `KEEP_LOCAL`、`KEEP_REMOTE` 和无净变化分别定义“冲突裁决 → 工作树净差重算”的原子算法，覆盖 unstaged、staged、依赖闭包、refresh、切换分支和再次 commit；把这些场景加入跨后端 fixture。

### P1：raw SQL / adapter bypass 门禁没有可执行的授权机制

Epic 要求 raw SQL、adapter 直写及其他 trigger bypass 在业务表写入前以 `commit_capability_mismatch` 拒绝（[epic-006:178](../epics/epic-006-working-tree-commits.md:178)）。但现有 adapter 公开 `rawQuery()`，用途明确包括条件 UPDATE（[rxdb-adapter.ts:91](../../packages/rxdb/src/rxdb-adapter.ts:91)），并已有 raw DML 的正常调用测试（[RxDBAdapterPGlite.rawQuery.spec.ts:56](../../packages/rxdb-adapter-pglite/src/__tests__/RxDBAdapterPGlite.rawQuery.spec.ts:56)）。Phase 1 plan 只定义了内部 `intent` 参数，未定义 rawQuery 的授权、数据库 trigger 的信任标记或外部句柄的阻断方式（[plan.md:199](../../specs/001-working-tree-commits/plan.md:199)）。

**根因**：调用点登记只能约束 RxDB 自己的内部路径，不能自动阻止公开 raw SQL；“受信路径”与“任意 SQL 写入”的边界没有落到适配器/数据库契约。

**修复方案**：按六个 v1 后端冻结统一机制：启用后 rawQuery 是否只读、受信事务如何获得 capability、trigger 如何识别受信 intent、外部连接如何 fail-closed，以及业务表零变化如何验证。每个后端都要有 bypass conformance fixture。

### P1：Epic 与已冻结的物理存储模型不一致

Epic 仍把 `WorkingTreeEntry` 定义为逻辑契约，允许复用 `RxDBChange` 或使用派生表（[epic-006:100](../epics/epic-006-working-tree-commits.md:100)）。但 Phase 1 data model 已经冻结 `RxDBWorkingTreeEntry -> rxdb_working_tree_entry`，并列出 11 张新表（[data-model:18](../../specs/001-working-tree-commits/data-model.md:18)）。

**根因**：Epic 保留了 plan 选择空间，但后续 spec 已经依赖具体表名、字段、索引、FK、加密 envelope 和迁移版本。

**修复方案**：将一个文档明确为物理存储真相源。若采用新表，删除 Epic 的复用自由度；若采用 `RxDBChange` 复用，则必须回改 data model、adapter contract、migration 和所有 SQL/conformance 约束。

## 额外门禁缺口

Epic 对 `runnerProfileHash` 不匹配只写“返回 `benchmark_environment_mismatch`”（[epic-006:360](../epics/epic-006-working-tree-commits.md:360)），没有明确该结果是命令失败、报告状态还是“ratio 可判定但 absolute 不评估”。benchmark contract 已定义更精确的三态：ratio 达标但 profile 不匹配时跳过 absolute，且不得生成绿色发布结论（[benchmark-report.md:79](../../specs/001-working-tree-commits/contracts/benchmark-report.md:79)）。应把 `ratioGate`、`absoluteGate` 和 `publishable` 写回 Epic，避免普通 PR CI 与发布门禁使用不同退出语义。

## 测试缺口

- 当前仅完成文档交叉审查，未修改实现、未运行测试。
- 应新增一参 `createBranch()` dirty 状态的双语义 fixture，确保最终选择被锁定。
- 应新增 metadata-only 分支首次物化的崩溃续传、目标 `RxDBSync` 水位初始化和重复 pull fixture。
- 应新增 KEEP_LOCAL/KEEP_REMOTE 与 staged snapshot 组合的冷重放、切换和 commit fixture。
- 应新增 raw SQL、未知 adapter 路径和受信 intent 的六后端 conformance fixture。

## 审查结论（2026-08-22 复核）

逐条核对源码与 artifact 后的判定：**3 个 P0 全部成立且严重，2 个 P1 是真实未闭合的设计缺口，
1 个 P1 判断有偏差，「额外门禁缺口」大体已被覆盖。**

### P0#1 `createBranch(branchId)` 脏工作树语义 — 成立，已裁决

三方确实互斥。裁决依据不是取中，而是**硬约束**：spec.md FR-048 / FR-051 要求既有用户可见语义不变，
而现有实现 [`create_branch`](../../packages/rxdb/src/version/create-branch.ts) 通过
`get_current_branch_last_change` 把 `fromChangeId` 设为当前物化状态——即「从当前状态创建」是**既有行为**。
因此 core-api §8.4「新分支工作树与 index 均为空」才是离群项，US-308 US1-AC4 与 Epic 一致。

**已修复**：core-api.md §8.4 新增「一参 `createBranch` 的脏工作树语义（已裁决）」小节，冻结 5 条规则：
`baseHeadCommitId` 相同 / 工作树条目**逐条复制为独立行** / 源分支 staged 条目在新分支**转 unstaged 且 index 为空** /
新分支 revision 从 0 起且源分支 revision 不变 / 全部在同一事务内原子完成；并写明两参
`createBranch(branchId, fromChangeId)` 不适用本规则。

### P0#2 bridge tag 发布死锁 — 成立，已修复

核对属实：[release-plan.md](../release-plan.md) 明确「桥接段**不能塞进** US-305……直接死锁」，
[plan.md](../../specs/001-working-tree-commits/plan.md) 交付顺序 stage 0 也已经是「前置：新的非迁移 bridge tag」，
只有 epic-006 还把它写成 US-305 的交付物。`migration-release.json` 的 `bridge.tag` 仍为 `null`。

**已修复**：epic-006 依赖顺序第 1 步改为「排在 US-305 **之前**的独立发布事项，不是 US-305 的交付物」，
US-305 只承接**门禁侧**（FR-030 / AC US2-14）。manifest 待真实 tag 产生后回填，本次不动。

### P0#3 metadata-only 分支首次物化 — 成立，已修复（含水位缺口）

**已修复**：core-api.md 新增「### 8.6 仅元数据远端分支的首次物化（FR-052）」，给出 3 步判定顺序、
staging 路径、以及**仍然**返回 `branch_not_materialized` 的场景清单；§8.3 的例外改为限定作用域并链到 §8.6。
本评审指出的同步水位缺口一并补上：提交屏障 MUST 在**同一事务内**按冻结的终态 watermark 为目标分支
创建每实体 `RxDBSync` 行——否则下次 pull 会从零重放。

### P1#1 远端冲突裁决 → 工作树重算 — 成立，**已裁决并修复（2026-08-22）**

核对属实：`KEEP_REMOTE` 在同事务内把本地 `RxDBChange` 标记 superseded，但没有任何文档规定对应
`WorkingTreeEntry` 是删除、替换还是重算，也没规定 staged snapshot 与依赖闭包怎么变。

**裁决过程中收窄了选项空间**：本评审设想的「只追加 remote entry」方案在物理上不可实现——
`WorkingTreeEntry` 的主键粒度已冻结为 `database + branch + unit`
（[epic-006 v1 状态模型表](../epics/epic-006-working-tree-commits.md)），**一个单元至多一行**，
追加需要同一单元两行。因此真正的分歧点只剩一个：`KEEP_REMOTE` 撞上**已暂存**条目时 index 快照动不动。

**已裁决：index 冻结不动。** 已暂存快照是用户在 `stage()` 那一刻冻结的意图，远端裁决 MUST NOT 静默改写它
（FR-029）；用户看到的是 staged 半边仍是自己的值、unstaged 半边出现远端覆盖后的净差——与 `git pull` 之后
`git status` 同时显示已暂存与未暂存修改一致。

**已修复**：[data-model.md §4.4](../../specs/001-working-tree-commits/data-model.md) 新增「远端冲突裁决 →
工作树净差重算（已裁决）」，冻结三条腿（`KEEP_LOCAL` / 无净变化 → 零变化零 revision；`KEEP_REMOTE` → 就地重算）、
`KEEP_REMOTE` 的三种净差情形、三条硬规则（index 逐字段不变 / 净差为空但已暂存不得删行 / 依赖闭包不重算）
以及 `sequence` 取新最大值对 INV-4 的必要性。epic-006 写入口矩阵的 pull 行链到该节；
一致性套件新增 **C-11**。

### P1#2 raw SQL / adapter bypass 授权机制 — 成立，**已裁决并修复（2026-08-22）**

核对属实：[`rawQuery()`](../../packages/rxdb/src/rxdb-adapter.ts) 是公开原语且用途明确包含绕过 ORM 的条件
UPDATE，调用点登记只能约束 RxDB 自身内部路径。

**新证据（本评审未提及，但决定了选项）**：`rawQuery?()` 由 `RxDBAdapterSqliteBase` 与 PGlite 各实现一份，
6 个 v1 后端**全部暴露**；而 [`rxdb-plugin-search` 的 FTS5 建表与回填](../../packages/rxdb-plugin-search/src/core/fts5-runtime.ts)
本身就走 `rawQuery` 写虚拟表——**「启用后 rawQuery 整体只读」会连带打死搜索插件**，据此否决。

**已裁决：按目标表判定 + 受信 intent 豁免。** 命中「版本化业务实体表」（= `sync.type !== QueryCache` 的注册实体，
与 INV-9 同一集合）的写语句在**执行前**拒绝；FTS5 / 系统表 / 查询缓存表放行；目标表无法确定时 fail-closed。
数据库 trigger fail-closed 是唯一能拦住外部句柄的方案，但受信标记载体在 6 后端不统一
（PGlite session GUC / SQLite temp table 或 pragma）且每张版本化表要挂 3 个 trigger，**留作后续故事**。

**已修复**：[adapter-contract.md §4.6](../../specs/001-working-tree-commits/contracts/adapter-contract.md)
新增「raw SQL / adapter 直写的 bypass 门禁（已裁决）」，冻结 5 步判定顺序、保守解析口径、
**明写能力边界**（绕过 adapter 的外部句柄拦不住，v1 不承诺）与 7 条 fixture；epic-006 写入口矩阵最后一行
链到该节；一致性套件新增 **C-12**。

### 顺带修掉的两条 fixture 漂移（本轮发现）

上一轮 P0#1 / P0#3 只改了契约、漏改对应 fixture，两条仍写着已被推翻的旧口径，现一并订正：

- **B-7 createBranch**：原文「新分支工作树与缓存区为空，不继承源分支未提交内容」正是 core-api §8.4
  已裁决为**离群项**的那句。改为断言一参复制脏快照（staged 转 unstaged、源分支三个 revision 变化量为 0）
  与两参都为空两条腿。
- **B-4 未物化分支**：原文「不自动物化」未留 FR-052 例外。改为限定**本地**分支，并要求仅元数据远端分支
  按 core-api §8.6 走首次物化路径，两条腿都断言。

### P1#3 Epic 与冻结物理存储模型不一致 — 判断偏差，但仍做了收口

不是「两个真相源冲突」，而是 Epic 保留的选择空间**已经过期**（data-model.md 早已冻结 11 张表、
`RxDBWorkingTreeEntry → rxdb_working_tree_entry`）。物理真相源本就唯一，Epic 只是没跟上。

**已修复**：epic-006 `WorkingTreeEntry` 段落改为「物理布局由 data-model.md 的 11 张表冻结」，
删除复用 `RxDBChange` 的自由度。

### 额外门禁缺口（benchmark 三态）— 大体已覆盖，无需改动

三态语义在 [benchmark-report.md §5](../../specs/001-working-tree-commits/contracts/benchmark-report.md)
已有完整表格，epic-006 第 360–364 行 + 发布门禁 7 + US-306 US4-AC7 也已承接。
Epic 不必再复制一份三态定义——复制反而会产生第二个会漂移的真相源。本次不改。

## 解决记录

- [x] P0#1 / P0#2 / P0#3 / P1#3 文档修复已落在工作区（见「审查结论」）
- [x] **P1#1 远端冲突裁决 → 工作树重算**：已裁决（index 冻结不动），落在 data-model §4.4 + C-11，
      US-306 / US-308 的阻塞解除
- [x] **P1#2 rawQuery / adapter bypass 授权机制**：已裁决（按目标表判定 + 受信 intent），
      落在 adapter-contract §4.6 + C-12，adapter-contract 的阻塞解除
- [x] 顺带订正 B-7 / B-4 两条 fixture 漂移
- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`

> **本评审的 7 条问题现已全部有结论**（3 P0 + 3 P1 修复、1 P1 判为偏差后收口），无遗留设计裁决。
