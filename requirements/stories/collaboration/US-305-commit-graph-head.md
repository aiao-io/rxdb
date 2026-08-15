---
id: US-305
title: 提交图与 HEAD 持久化
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-09
updated: 2026-08-15
tags: [collaboration, commit, head, persistence, migration]
---

<!--
INVEST 检查清单:
- [x] Independent: 只依赖 US-304 的 lease/epoch，不依赖工作树与缓存区的任何 UI 或状态机
- [x] Negotiable: commit ID 生成方式、存储表名和 ChangeSet 编码可在 plan 阶段调整
- [x] Valuable: 有了持久 commit 图，历史节点第一次成为可长期引用的锚点
- [x] Estimable: 存储层次、审计字段和迁移路径已在本文列出
- [x] Small: 不含 status/diff/stage、不含 restore、不含分支切换改动。2026-08-15 复审新增的 FR-030～032 是**同一存储层**的状态定义与启用校验；二轮复审新增的 FR-036 是同一存储层的判定基准；FR-037 是 bench harness——它是本故事**唯一**的新交付面，接受它的理由是本故事本就要跑崩溃恢复 fixture，且把共用基建留给 US-306a 会让那个已经最大的故事同时背上「建基建」和「用基建」
- [x] Testable: 最小闭环「写 commit → 刷新 → 读回 log/show」可独立验收
- [x] 横切 FR 适用性：FR-024 / FR-025 不适用（纯存储层，无框架绑定、无 UI），见 epic-006 横切约束表
-->

# 用户故事：提交图与 HEAD 持久化

> Epic 级的术语表、横切 FR（FR-023 / FR-024 / FR-025 / FR-028）与性能口径见 [epic-006](../../epics/epic-006-working-tree-commits.md)。
> 本故事不重述，只承接落地与验收。
>
> **横切 FR 的适用性**：本故事是纯存储层，不暴露框架绑定也不交付 UI（见下方实现文件清单），
> 因此 **FR-024（三框架对称）与 FR-025（a11y）对本故事不适用**，发布门禁不得以此卡它。
> FR-023（异步状态）与 FR-028（不复活旧导出）适用。

## 背景与问题

当前历史记录可以支持 undo、redo 和从历史恢复实体，但恢复结果与部分状态依赖当前页面会话；刷新后用户看不到上次的结果，也没有一个可以长期引用的提交节点。

早期的 `stagedChange()` / `unstageChange()` / `commit()` / `stagedCount` 已在 `0.0.24` 删除（见 [rxdb-plugin-workspace/README.md 的「已移除 API」](../../../packages/rxdb-plugin-workspace/README.md#已移除-api)），因此这是全新设计，没有需要兼容的旧暂存契约。

本故事只做**底座**：commit 图、HEAD、分支引用的原子一致性、存储布局与一次性迁移。工作树与缓存区的状态机在 [US-306a](./US-306a-working-tree-index.md)。

## 作为/我想要/以便

**作为** 使用 RxDB 管理本地数据的开发者
**我想要** 把一组变更写成不可变 commit，并让 HEAD 与 commit 图在刷新后仍然可查询
**以便** 我有一个跨会话稳定、可审计、可被后续恢复引用的版本锚点

## 术语与状态模型

| Git 概念               | RxDB 中的含义                                          | 持久化要求                          |
| ---------------------- | ------------------------------------------------------ | ----------------------------------- |
| `HEAD`                 | 当前分支最近一次成功 commit 的指针                     | 必须持久化且只能指向已存在的 commit |
| unborn `HEAD`          | 分支已存在但尚无任何 commit 时的合法空指针             | 必须可持久化表达，不能用"损坏"表示  |
| 分支引用（branch ref） | 分支名到 `HEAD` commit 的映射；沿用现有分支能力        | 必须与 commit 更新原子一致          |
| commit                 | 带父节点、消息、作者和变更集合的不可变版本节点         | 创建后不可改；刷新后可查询          |
| baseline commit        | 迁移时生成的唯一根节点，语义是"迁移时刻的物化数据"     | 无父节点、无 ChangeSet，见下        |
| ChangeSet              | commit 的变更单元集合，按实体/事务分组，保留可恢复信息 | 与 commit 同一提交屏障内可见        |

v1 的变更单元粒度为「实体操作或完整事务」。同一事务不能被拆到不同 commit；字段级、代码行级粒度属于后续扩展。

### 两类"没有普通 commit"的合法状态

这两种状态过去被隐式当成异常，现在必须显式建模，否则 US-306a 的 `status()` / `diff()` / `discardWorkingTree()` 在这些状态下无定义：

1. **unborn HEAD**：全新数据库、或新建分支后尚未提交。此时 `HEAD` 为空是**合法**的，不算损坏。US-306a 的
   「只有 NEW 草稿、没有 HEAD」场景即属此类。
2. **baseline commit**：已有数据的数据库首次启用 commit 能力时生成的根节点。它**不携带 ChangeSet**——把
   10,000 条既有实体倒灌成一个巨型 ChangeSet 既没有性能预算，也伪造了从未发生过的变更历史。它的语义由
   FR-031 定义为「迁移时刻的物化数据快照引用」，因此它是 FR-009（禁止空 commit）的**唯一豁免**，且
   「commit 必须可重放到完整状态」对它的成立方式是**直接读取该快照**，而不是重放变更。

## 范围边界

### In Scope

- commit 图、`HEAD` 指针（含 unborn 状态）与分支引用的持久化存储布局
- 启用 commit 能力时的适配器能力校验与拒绝路径（FR-032）
- commit 的原子写入：变更集合、父 commit、作者、时间、摘要与新的分支 HEAD 在一次操作内可见
- ChangeSet 的 patch / inverse patch 存储与实体身份、操作类型、基线版本、当前版本指纹
- `log(options?)` / `show(commitId)` 查询：按分支、实体、时间排序，返回详情与父子关系
- 「已提交 / 未提交」判定基准的选定与存储表达（FR-036）
- 已有数据库的一次性初始化：生成 baseline commit、**登记**仍存在的 NEW 草稿、保留旧 change 记录，失败可重试且幂等
- 损坏或不兼容 commit 记录的隔离与诊断
- 与 `RxDBChange`、undo/redo、`restoreEntity` 的兼容边界
- `bench-working-tree` 的 harness、target 注册与固定 fixture（FR-037），供 US-306a / US-307 复用

### Out of Scope

- status / diff / stage / unstage / commit 的用户操作面 —— 属 [US-306a](./US-306a-working-tree-index.md)
- NEW 草稿**物化进工作树** —— 属 [US-306a](./US-306a-working-tree-index.md)；本故事只负责登记
- status / diff / stage / restore 的 bench **场景与阈值** —— 属 US-306a / US-307；本故事只建 harness
- 历史恢复会话 —— 属 [US-307](./US-307-restore-session.md)
- 分支切换行为与跨标签页冲突检测 —— 属 [US-308](./US-308-branch-isolation-conflict.md)
- 远程 push/pull、rebase、cherry-pick、任意历史改写
- 基于时间或大小的 commit 自动清理策略

## 用户场景与验收标准

### User Story 1 - 提交后刷新仍可查询（Priority: P1）

**作为** 需要长期引用版本节点的开发者
**我想要** commit 与 HEAD 在刷新后仍然完整
**以便** 历史不随页面会话消失

**独立测试**：写入一组变更并 commit，刷新或重新打开应用，查询 log 与 HEAD。

**验收场景**：

1. **Given** 一组已确定的变更单元，**When** 创建 commit 并刷新页面，**Then** commit、父节点、作者、时间、摘要与分支 HEAD 全部可查询，且与提交时一致。
2. **Given** commit 正在写入时出现存储错误，**When** 操作返回失败，**Then** HEAD 与分支引用保持提交前状态，不出现「commit 已存在但 HEAD 未更新」这类可见半状态，错误包含可重试信息。
3. **Given** 应用在持久化写入中途崩溃，**When** 下次打开应用，**Then** 只能看到上一次完整一致的状态，不出现半个 commit 或半个事务。
4. **Given** 变更单元集合为空，**When** 创建 commit，**Then** 操作被拒绝，不产生空节点，HEAD 不变。
5. **Given** commit message 为空或只含空白，**When** 创建 commit，**Then** 操作被拒绝并保留调用前状态。

### User Story 2 - 已有数据库首次启用（Priority: P1）

**作为** 已经在用 RxDB 的开发者
**我想要** 打开 commit 能力时不丢失既有数据与历史
**以便** 升级是一次可重试的迁移而不是重建

**独立测试**：在已有数据（含 NEW 草稿与旧 `RxDBChange`）的数据库上首次启用，重复启动两次。

**验收场景**：

1. **Given** 数据库已有数据但无 commit 图，**When** 首次启用，**Then** 生成一个 FR-031 定义的 baseline commit：无父节点、无 ChangeSet、作者为迁移来源、消息为固定迁移标记，不伪造旧 commit 的作者和消息；既有 `RxDBChange` 仍可供历史/undo 使用。
2. **Given** 迁移已生成 baseline commit，**When** 用户查询 `status()` / `diff()`，**Then** 既有数据视为已提交（clean），而不是被当成 10,000 条未提交变更。
3. **Given** 首次初始化已完成，**When** 再次启动应用，**Then** 迁移幂等，不重复建立基线，数据库中始终至多一个 baseline commit。
4. **Given** 迁移中途失败，**When** 重试，**Then** 从可验证的一致点继续，不产生重复基线或孤立 commit。
5. **Given** commit 图或索引记录损坏，**When** 启动，**Then** 隔离损坏记录，保留可验证的 commit，提供错误详情；**不得**静默回退到空库或内存模式。
6. **Given** 当前适配器不在受支持矩阵内（如 supabase / miniprogram），**When** 启用 commit 能力，**Then** 操作以明确错误拒绝，说明原因与受支持的替代后端，既有数据与既有 API 行为不受影响，**不得**降级启用。
7. **Given** 一个受支持的适配器（如 pglite）被注册在**非默认的注册键**下（如 `rxdb.adapter('main', …)`），**When** 启用 commit 能力，**Then** guard 按适配器实例的 `name`（= `ADAPTER_NAME`）判定并放行，**不得**因注册键不在名单里而误拒（FR-032）。
8. **Given** 某个受支持的适配器已按 [US-803](../future/US-803-local-encryption.md) 开启字段加密，**When** 启用 commit 能力，**Then** 照常放行——加密不改变适配器身份，`@aiao/rxdb-adapter-encrypted` 不是适配器也不包装适配器（见 FR-032 注）。
9. **Given** 数据库中存在 Workspace NEW 草稿，**When** 首次启用 commit 能力，**Then** 这些草稿被登记为「待纳入工作树」，**不被** baseline commit 视为已提交数据，且该登记结果刷新后可查询——本条断言不依赖 US-306a 的工作树结构（FR-021）。

### User Story 3 - 尚无任何提交（Priority: P2）

**作为** 刚建库或刚开新分支的开发者
**我想要** 在还没有任何 commit 时也能得到确定的查询结果
**以便** 空状态不会被当成数据损坏

**独立测试**：新建数据库（或新建分支）后不做任何提交，直接查询 log / HEAD。

**验收场景**：

1. **Given** 数据库刚创建、从未 commit，**When** 查询 HEAD，**Then** 返回 unborn 状态而非错误，且该状态在刷新后保持一致。
2. **Given** 分支处于 unborn 状态，**When** 调用 `log()`，**Then** 返回空列表，不抛错、不静默创建 baseline commit。
3. **Given** 分支处于 unborn 状态，**When** 用户完成第一次 commit，**Then** 该 commit 无父节点，HEAD 由 unborn 转为指向它，转换在同一提交屏障内可见。

## 功能需求

- **FR-001**：系统 MUST 为每个数据库和当前分支维护唯一有效的 `HEAD` 状态；`HEAD` 要么为 unborn（合法空值），要么指向一个已完成写入的 commit，MUST NOT 指向不存在或写了一半的 commit。
- **FR-002**：系统 MUST 持久化 commit 元数据、分支引用与 HEAD；刷新、重启和正常关闭后可恢复。
- **FR-003**：系统 MUST 把 NEW、UPDATE、DELETE 和完整事务表示为可比较的变更单元，并为每条保留实体身份、操作类型、基线版本和当前版本指纹。
- **FR-008**：系统 MUST 要求 commit 包含非空、可读的消息，并在一次原子操作中写入变更集合、父 commit、作者、时间、摘要和新的分支 HEAD。
- **FR-009**：系统 MUST 保证用户发起的 commit 不为空；无变更单元时提交失败且不产生空节点。唯一豁免是 FR-031 的 baseline commit，它由迁移而非用户发起。
- **FR-010**：系统 MUST 保证 commit 创建失败时恢复提交前状态，不出现可见半状态。
- **FR-012**：系统 MUST 提供按当前分支、实体和时间排序的历史列表，以及单个 commit 的变更详情和父节点关系。
- **FR-018**：系统 MUST 与现有 `RxDBChange`、历史 undo/redo 和 `restoreEntity` 保持兼容；已有 API 的行为不能因为 commit 功能而改变。
- **FR-019**：系统 MUST 明确区分 durable commit 历史与会话级 redo 栈；刷新后 redo 可清空，但 commit 与 HEAD 不得清空。
- **FR-021**（已收窄口径）：系统 MUST 为已有数据库提供一次性初始化和迁移策略：生成 baseline commit、**登记**仍存在的 NEW 草稿（标记为「待纳入工作树」且不被 baseline 视为已提交数据）、保留旧 change 记录，并支持失败重试。草稿**实际物化进工作树**的行为属 [US-306a User Story 1 场景 3](./US-306a-working-tree-index.md)，不在本故事。
  > 收窄原因：原文写「导入仍存在的 NEW 草稿」，而「导入到哪里」是工作树——本故事已把工作树显式 out-of-scope，目标结构在这里根本不存在，导致该子句在本故事内无法验收（原 User Story 2 的 AC 也确实一条都没断言它）。拆成「本故事登记 / US-306a 物化」后，两边各自可独立验收。
- **FR-022**：系统 MUST 对损坏或不兼容的 commit 记录进行隔离和诊断，不得将整个数据库静默降级为空工作树或内存模式。
- **FR-027**：commit 历史 MUST 可审计，至少记录稳定 commit ID、父节点、分支、作者标识、消息、创建时间、变更数量和 schema/数据版本；不得记录无法恢复的数据引用。
- **FR-030**（新增）：系统 MUST 把 unborn `HEAD`（分支存在但尚无 commit）建模为合法状态而非损坏状态，并定义该状态下的行为：`log()` 返回空列表而非报错，`show()` 对不存在的 commit 返回明确的 not-found 错误，工作树中的全部数据视为未提交变更。US-306a 的 `status()` / `diff()` / `discardWorkingTree()` 在 unborn 下的具体语义由该故事承接，但**状态本身的存储表达**在本故事定义。
- **FR-031**（新增）：迁移生成的 baseline commit MUST 是一个独立类别的根节点：无父节点、无 ChangeSet、作者标识为迁移来源而非伪造的用户、消息为固定的迁移标记。它的"可重放到完整状态"MUST 通过引用迁移时刻的物化数据实现，MUST NOT 把既有实体倒灌成变更单元。每个数据库 MUST 至多存在一个 baseline commit（配合 FR-021 的幂等）。
- **FR-032**（新增）：系统 MUST 在启用 commit 能力时校验当前适配器是否支持跨表事务提交屏障；不在 [epic-006 受支持矩阵](../../epics/epic-006-working-tree-commits.md)内的适配器 MUST 显式报错拒绝启用，并说明原因与受支持的替代后端。MUST NOT 静默降级为内存态、非事务写入或"尽力而为"模式。该校验还 MUST 满足三条实现约束：
  - **判定依据 MUST 是 epic-006 矩阵的显式名单**（对齐 `ADAPTER_NAME`），MUST NOT 依据「适配器是否实现 `transaction()`」——[rxdb-adapter.ts:139](../../../packages/rxdb/src/rxdb-adapter.ts#L139) 上它是 `abstract` 方法，**全部**适配器都实现了，包括矩阵里被拒绝的 supabase 与 miniprogram。照这个信号 gate 等于没 gate。
  - **判定值 MUST 读适配器实例的 `name` 属性**，MUST NOT 读注册键或 `config.sync.local.adapter`。[RxDB.ts:318](../../../packages/rxdb/src/RxDB.ts#L318) 的 `adapter(adapterName, factory)` 里 `adapterName` 是**调用方自选的字符串**，`config.sync.local.adapter` 存的就是它；而各适配器实例的 `name` 恒等于本包导出的 `ADAPTER_NAME`（见 [RxDBAdapterPGlite.ts:189](../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L189)、[RxDBAdapterDesktop.ts:25](../../../packages/rxdb-adapter-desktop/src/RxDBAdapterDesktop.ts#L25)）。
    可参照 [SUPPORTED_SEARCH_ADAPTERS](../../../packages/rxdb-plugin-search/src/core/adapter-guard.ts) 的**白名单形态**，但 MUST NOT 照抄它的**取值方式**——那份先例读的正是注册键，把 pglite 注册成 `'main'` 的调用方会被误拒。
  - **未列出的适配器 MUST 走拒绝路径**，且错误信息 MUST 提示「该适配器尚未在 epic-006 矩阵中裁决」，而不是笼统的"不支持"。

  > **关于加密**：`@aiao/rxdb-adapter-encrypted` **不是适配器，也不包装适配器**——它不导出任何 `IRxDBAdapter` 实现（见 [其 index.ts](../../../packages/rxdb-adapter-encrypted/src/index.ts) 与 [api-baseline](../../api-baseline/rxdb-adapter-encrypted.json)），只导出 `Keyring` / 信封编解码 / 元数据校验器，由 [sqlite-core](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts#L43) 与 [pglite](../../../packages/rxdb-adapter-pglite/src/RxDBAdapterPGlite.ts#L47) **内建消费**（`adapter.encryption.*`）。因此本 FR **不含**"解包"要求：开启加密时注册的仍是 pglite / sqlite-* 本身，其 `name` 已是矩阵内的值，guard 照常放行。

- **FR-036**（新增）：系统 MUST 把「某条工作树数据是否属于未提交变更」的判定基准**显式选定、持久化并写入 plan.md**，且该基准 MUST 满足不变式：**`discardWorkingTree()` 完成后 `status()` 为 clean**。当前 [IRxDBChange](../../../packages/rxdb/src/system/system.interface.ts) 上没有任何 commit 关联字段，因此该基准必须在本故事落地，而不能留给 US-306a 边实现边决定。可选方案与各自的约束：
  - **(a) 物化数据 ↔ HEAD 快照比对**（复用 FR-003 的版本指纹）：不改 `RxDBChange` schema。
  - **(b) 变更日志 + commit 水位线**：MUST 在 `IRxDBChange` 上新增 commit 关联字段，MUST 作为显式 schema 迁移纳入 FR-021，且 MUST 满足 FR-018（既有字段、ID、transactionId、过滤规则行为零变化）。

  MUST NOT 采用「变更日志中晚于最后一次 commit 的全部条目即未提交变更」这类**纯追加顺序推导**：[US-306a FR-033](./US-306a-working-tree-index.md) 要求 `discardWorkingTree()` 以**追加反向变更**的方式回到 HEAD，在该推导下 discard 反而会让日志多出一批条目、`status()` 永远回不到 clean——两条需求直接互相否定。基准一经选定即对 US-306a / US-306b / US-307 生效。

  **所选基准 MUST 在 baseline commit 场景下可判定**，这是与 FR-031 的交叉约束，plan.md MUST 一并回答：FR-031 规定 baseline commit 无 ChangeSet，其完整状态「由迁移时刻的物化数据直接给出」，但没有定义那份数据的**物理形态**，而方案 (a) 恰恰需要一份**不随工作树变化**的 HEAD 侧数据才能比对——

  - 若 baseline 只是指向业务表的**活引用**，用户改完数据后"快照"随之移动，diff 恒为空，`status()` 永远 clean，AC User Story 2 场景 2 之外的全部 US-306a 断言都会失效；
  - 若 baseline 是**物理副本**，则 FR-031 拒绝把既有实体倒灌成 ChangeSet 的理由（「10,000 条既有实体没有性能预算」）同样适用于复制 10,000 条，该理由自毁。

  因此 plan.md MUST 显式选定 baseline 侧的物理形态（整表副本 / 版本水位 / 仅指纹表）并给出其空间与时间代价；**MUST NOT** 只写"引用迁移时刻的物化数据"就交给实现自行解释。若选定方案 (b)，本条同样要求说明 baseline 之前的既有数据在水位线模型下如何表达为"已提交"。

- **FR-037**（新增）：本故事 MUST 交付 US-306a / US-307 共用的 bench 基础设施：`benchmarks/working-tree.bench.ts` 骨架、[benchmarks/project.json](../../../benchmarks/project.json) 中的 `bench-working-tree` target（`dependsOn: ["typecheck", "^build"]`，与既有两个 bench target 一致）、10,000 实体 / 100 commit 的固定 fixture，以及同 run 内 A/B 对照的采样与报告骨架（p50 判定 / p95 仅观察，报告写入 `benchmarks/reports/`）。status / diff / stage 场景与阈值由 [US-306a FR-026](./US-306a-working-tree-index.md) 补齐，restore 场景由 [US-307 FR-029](./US-307-restore-session.md) 补齐；两者 MUST NOT 重复注册 target。

  > 归属理由：bench harness 是 US-306a 与 US-307 的共用基建，放进任一消费方都会让那个故事同时背上「建基建」和「用基建」；而本故事本来就要跑崩溃恢复 fixture，A/B 骨架与它同一条交付线。见 [epic-006 性能预算](../../epics/epic-006-working-tree-commits.md)。

  本 FR 还 MUST 满足两条约束：

  - **本故事自身的 A/B 场景 MUST 有对应的 A 侧。**「打开已有 commit 图并查询 `log()` / `show()`」**不可用**——commit 能力未启用时 `log()` / `show()` 根本不存在，A 侧无对应物，判定值 `(B.p50 - A.p50) / A.p50` 的分母无定义。本故事的场景 MUST 改为**两侧都存在的同一操作**，量的是 commit 图带来的写放大与打开开销，例如「同一批实体写入：A = 未启用 commit 能力，B = 已启用」与「数据库打开到首次可查询：A = 无 commit 图，B = 有 100 个 commit 的图」。`log()` / `show()` 的绝对耗时 MAY 一并输出到报告，但 MUST NOT 作为门禁值。
    > 对照：[FR-029](./US-307-restore-session.md) 特意把 A 定义为「未启用 commit 能力的**等价物化路径**」，[US-306a FR-026](./US-306a-working-tree-index.md) 的 status / diff / stage 也各有普通读写路径可对照——只有本故事原先这条漏了 A 侧。
  - **CI 接线属本故事交付物。** [.github/workflows/ci-template.yml](../../../.github/workflows/ci-template.yml) 当前的 `benchmark` job **只跑 `nx run benchmarks:search-ci`**；`bench-hot-path` 与 `bench-encryption` 从未在 CI 中执行过，它们的 `MAX_REGRESSION_PCT` 只是脚本内部断言，CI 层面并无门禁。因此[发布门禁 #4](../../epics/epic-006-working-tree-commits.md) 要求的「在 CI 中无回归」MUST 由本故事新增一步 `nx run benchmarks:bench-working-tree`（沿用既有 `need_benchmark` 触发条件，即 PR 且改动落在 `packages/` 或 `benchmarks/`）来落地。US-306a / US-307 MUST NOT 改动该文件。

## 关键实体

- **Commit**：不可变提交；稳定 ID、一个或多个父节点、分支、作者、消息、时间、变更集合、摘要、数据/schema 版本。
- **BranchRef**：分支引用；分支 ID、名称、HEAD commit、创建来源、更新时间。
- **CommitChangeSet**：commit 的变更单元集合；按实体/事务分组，保留 patch、inverse patch 或等价可恢复信息。

> 命名遵守 [epic-006](../../epics/epic-006-working-tree-commits.md) 的术语表：新导出一律 `Commit*` 前缀，
> **不得**使用 `Workspace*`——该前缀已被 `@aiao/rxdb-plugin-workspace` 的草稿缓存占用。

## 设计展开

### 持久化层次

1. 业务实体表保存当前物化数据，仍沿用现有 CRUD、事务和响应式查询。
2. 变更日志保存原子变更的 patch/inverse patch；commit 只引用经过校验的变更单元或不可变快照，不能依赖易失的 UI 状态。
3. commit 元数据（分支、HEAD、版本水位）必须与业务数据在同一提交屏障内可恢复。
4. commit 图保存父子关系和审计字段；任何**普通** commit 一旦可见就必须可重放到其父节点之后的完整状态。baseline commit 是唯一例外：它没有 ChangeSet，其"完整状态"由迁移时刻的物化数据直接给出（FR-031）。
5. 上述 1–4 全部依赖适配器提供跨表事务；不支持的适配器按 FR-032 拒绝启用，不在本层做补偿写入或两阶段模拟。

### 提交规则

- commit 的父节点固定为提交开始时读取到的当前分支 HEAD；提交结束时若 HEAD 已被其他 writer 推进，整个提交失败并要求重新读取状态。跨 realm 的推进判定复用 [US-304](./US-304-writer-lease-migration-fencing.md) 的 epoch，不新增第二套 lease 表。
- 历史节点永不通过「把旧节点改成当前」实现变更；需要可追踪的动作时必须再创建一个新 commit。

### 兼容与迁移

- 保留 `RxDBChange` 的现有 ID、transactionId、patch/inversePatch、branchId 和 undo/redo 字段；commit 层不改变旧 API 的过滤规则。若 FR-036 选定方案 (b) 需要新增 commit 关联字段，该字段只能**追加**，且必须证明既有查询与过滤行为零变化。
- 首次启用时建立 baseline commit 并记录迁移版本；重复启动幂等。
- 旧 Workspace NEW 草稿在本故事只被**登记**为「待纳入工作树」并排除在 baseline 之外；把它们物化成工作树里的普通变更属 [US-306a](./US-306a-working-tree-index.md)。无法识别的旧缓存记录隔离并报告，不静默删除。

## 非功能要求

- **一致性**：commit、HEAD 与分支引用遵守全有或全无的可见性；重启恢复不得依赖写入顺序的偶然性。
- **可靠性**：写入失败、崩溃、标签页关闭和 schema 升级中断后，重试结果可预测且不重复生成 commit。
- **可诊断性**：错误带稳定类别、对象标识和建议动作；不能静默 fallback 到 memory、空历史或另一种未声明的存储。
- **安全性**：默认不记录敏感实体字段到 UI 日志或错误文本；作者标识由调用方提供，不能伪造为系统用户。

## 测试要求

- 核心包按 TDD 先写崩溃/刷新恢复的失败用例，再实现；覆盖率不低于 90%。
- 本地适配器集成测试覆盖事务原子性与 schema 迁移，范围为 [epic-006 受支持矩阵](../../epics/epic-006-working-tree-commits.md)内的适配器。
- 迁移幂等性与损坏记录隔离必须有独立 fixture。
- unborn HEAD 必须有独立 fixture：空库 `log()` / HEAD 查询、首次 commit 的父节点为空、刷新后状态不变。
- baseline commit 必须有独立 fixture：断言其无 ChangeSet、迁移后 `status()` 为 clean、重复启动不产生第二个 baseline。
- FR-032 必须有拒绝路径用例：在不支持的适配器上启用 commit 能力时抛出可识别错误，且既有 API 行为零变化；并**必须包含一条 encrypted 包装用例**，断言 guard 按解包后的底层 `ADAPTER_NAME` 判定（底层受支持则放行、不受支持则仍拒绝）。
- FR-036 的判定基准必须有独立 fixture：同一组工作树数据的判定结果在刷新前后一致；若选定方案 (b)，迁移用例必须断言既有 `RxDBChange` 的查询与过滤行为零变化。该基准的不变式（discard 后 `status()` 为 clean）由 [US-306a](./US-306a-working-tree-index.md) 的用例把关，本故事只需保证基准本身可持久化、可重建。
- FR-021 的草稿登记必须有独立断言：草稿被标记为「待纳入工作树」、不计入 baseline commit、刷新后仍可查询——且该断言不得依赖 US-306a 的工作树结构。
- 测试文件使用 `*.spec.ts`，不依赖非确定性的固定延时。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — commit 图、HEAD 与分支引用
- `packages/rxdb/src/system/` — commit 元数据表与迁移
- `packages/rxdb/src/__tests__/version/` — 核心回归套件
- `benchmarks/working-tree.bench.ts` — A/B harness 与固定 fixture（FR-037，新增）
- `benchmarks/project.json` — 注册 `bench-working-tree` target（`dependsOn: ["typecheck", "^build"]`，与既有两个 bench target 一致）
- `requirements/api-baseline/rxdb.json`

## 依赖与参考

- [epic-006 本地工作树与提交历史](../../epics/epic-006-working-tree-commits.md)
- [US-301 版本控制](./US-301-version-control.md) — 现有分支、合并和远程同步边界
- [US-302 撤销/重做](./US-302-undo-redo.md) — 现有 durable undo 与会话级 redo 语义
- [US-304 跨 realm writer lease 与迁移 fencing](./US-304-writer-lease-migration-fencing.md) — 提交乐观校验复用其 epoch
- [US-306a 工作树、缓存区与提交操作](./US-306a-working-tree-index.md)
- [US-501 Workspace 插件](../plugin/US-501-workspace-plugin.md) — NEW 草稿持久化现状与明确限制
- [版本控制文档](../../../website/docs/versioning.md)
