# Implementation Plan: 本地工作树与提交历史

**Branch**: `001-working-tree-commits` | **Date**: 2026-08-15 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-working-tree-commits/spec.md`

## Summary

把本地数据变更组织成 Git 式三层工作流——**工作树**（未提交的当前状态）→ **缓存区**（本次准备提交的选择）→ **提交**（不可变历史节点），并保证这三层在刷新、崩溃、多标签页并发与分支往返后语义一致。

技术路径：在 `packages/rxdb` 内新增一组 `Commit*` / `WorkingTree*` / `Index*` 系统实体，复用既有 `RxDBBranch.activated` 作为当前分支的唯一真相源（不引入第二份 HEAD 指针），复用既有 `rxdb_migration` 水位机制做数据库级单向启用，复用既有 `rxdb_upgrade_guard` / `rxdb_writer_lease` 的 epoch 做迁移 fencing（**不**用它充当提交版本号）。写入捕获挂在既有 `TransactionExecutor` 边界上，把「关闭本地变更触发器」的批量重写路径从布尔 `disableTriggers` 升级为**显式意图枚举**，使受信登记键成为「文件 + 符号 + 意图」。三框架侧只做透传：`packages/rxdb-{angular,react,vue}` 各导出同名 `useWorkingTree()`，复用既有 `useAction` 命令状态形状。跨后端一致性由 `packages/rxdb-test` 新增两套具名套件覆盖 6 个 v1 后端，性能由 `benchmarks/` 新增一个 Nx target 门禁。

## Technical Context

**Language/Version**: TypeScript 6.0（`~6.0.3`）strict，ESM only，`packages/*` 无根级副作用导入

**Primary Dependencies**: RxJS 7.8+（响应式查询与事件）、Nx 23.1 + pnpm 10（构建与任务图）、Angular 22+ / React 19+ / Vue 3.5+（三端绑定）、既有内部依赖 `@aiao/rxdb` → `@aiao/rxdb-adapter-*`

**Storage**: 主库事务边界内的 SQL 表。v1 承诺 6 个后端：`rxdb-adapter-pglite`（PGlite）、`rxdb-adapter-wa-sqlite`、`rxdb-adapter-sqlite-wasm`、`rxdb-adapter-sqlite`（官方 wasm）、`rxdb-adapter-sqliteai`、`rxdb-adapter-desktop`（Electron `node:sqlite` 特权侧）。后四者共享 `rxdb-adapter-sqlite-core` 的同一份 SQL 实现。**不承诺**：`rxdb-adapter-tauri`（Rust host，US-210 已知事件时序抖动）、`rxdb-adapter-miniprogram`（实验性，不承诺崩溃恢复）、`rxdb-adapter-supabase`（远端，非本特性一致性边界）

**Testing**: Vitest 4.1（unit / integration，`*.spec.ts` 与源码同目录）+ Playwright（三端 E2E 与 a11y）。跨后端一致性走 `@aiao/rxdb-test` 的具名套件 + 各适配器 `__tests__/*.spec.ts` runner，沿用既有 `runTransactionIsolationSuite` 模式

**Target Platform**: 浏览器（OPFS / IndexedDB）、Node 26+、Electron 主进程 + 渲染进程

**Project Type**: TypeScript monorepo library（核心引擎 + 适配器 + 三框架绑定 + 演示应用）

**Performance Goals**: 新增 Nx target `benchmarks:bench-working-tree`。固定 Node + PGlite memory，warmup 5 / samples 50，fixture = 10,000 实体 / 100 提交 / 每提交 100 变更单元 / 100 未暂存 / 50 已暂存。普通 CI 硬门禁 = 归一化 ratio ≤ 冻结 reference median 的 110%；`runnerProfileHash` 匹配的固定 runner 上追加绝对门禁 status / 完整 diff / 批量 stage 50 单元 p95 ≤ 100 ms、restore 100 单元 p95 ≤ 1 s

**Constraints**: 宪法 IV 默认预算（query < 16 ms、DB op < 100 ms、bundle < 50 KB gz、demo first paint < 1.5 s）全部适用；未启用该能力的数据库零副作用、零新表；已启用后 `packages/rxdb` 的公开 API 无破坏性变更（`switchBranch(branchId: string)` 单参签名继续编译）；所有新增持久化位置在支持字段加密的后端上保持信封落盘

**Scale/Scope**: 新增约 12 张系统表 / 类型契约；核心包 `packages/rxdb` 新增 6 个内部子模块；6 个适配器包需实现新的适配器方法；3 个框架包各新增 1 个入口；3 个演示应用 + 3 个 e2e 项目各新增 1 个页面与场景；`packages/rxdb-test` 新增 2 套具名套件；`benchmarks/` 新增 1 个 target。交付切分为 6 个可独立验收的用户故事，固定顺序 US1 → US2 → US3 → US4 →（US5 ∥ US6）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

### I. Code Quality — PASS（含 1 项需记录的例外，见 Complexity Tracking）

| 要求 | 本特性如何满足 |
| --- | --- |
| TS strict / 零 ESLint 警告 / 禁 `any` | 新增类型全部具名导出；跨适配器的动态行数据用 `unknown` + 类型守卫，沿用 `system/writer-lease.ts` 既有的快照校验写法 |
| 嵌套 ≤ 3 层 | 依赖闭包计算、拓扑排序、分页物化三处最深；均按「每层一个具名纯函数」拆分，复用既有 `version/topological-sort.ts` 与 `version/dependency-graph.ts` |
| 单一职责 | 6 个新子模块各自单一职责（见 Project Structure），不把状态机塞进 `VersionManager` |
| 禁 fallback 兜底 | 损坏走 fail-closed 只读态（FR-014）、环境不匹配走 `benchmark_environment_mismatch`（FR-041）、未登记意图直接拒绝（FR-022）——全部是显式拒绝而非降级 |
| `packages/*` 导出补齐 TSDoc | 所有新导出进 `requirements/api-baseline/*.json`，由 `pnpm audit:api-surface` 与 `scripts/audit/package-api-docs.mjs` 双重把关（FR-058） |
| API 破坏需文档化 | 有破坏风险的是两处**内部契约**：`TransactionExecutor.mergeChanges` 的 `disableTriggers: boolean` → 意图枚举，以及 `SwitchBranchOptions` 追加必填 `intent`。两者均未出现在 `requirements/api-baseline/rxdb.json` 的公开导出中，按 Complexity Tracking 记录。公开侧只有加法（新增导出 + `EntityIndexMetadataOptions.where` 可选字段） |

### II. Testing Standards — PASS

- TDD 红→绿：每个用户故事先落 `*.spec.ts` 红测试。US1/US2/US3 的红测试直接写成两套具名套件的成员，先在 PGlite 上红，再逐后端接入。
- 覆盖率：`packages/rxdb`、6 个适配器包属核心包，门禁 ≥ 90%；`packages/rxdb-{angular,react,vue}`、`packages/rxdb-test` ≥ 80%。基线更新走 `pnpm audit:coverage:update`。
- 确定性：崩溃恢复用「事务中途抛错 + 重新 connect」的确定性 fixture，**不用** `setTimeout`；并发竞争用同一进程内两个 RxDB 实例对同一物理库的确定性交错，不依赖真实时序。数据库时间统一取数据库时钟（FR-007），测试可注入。
- 分层：unit（纯函数：闭包、拓扑、版本号校验、报告统计）→ integration（事务原子性、崩溃恢复、并发）→ 跨后端 conformance → E2E（三端）→ benchmark。

### III. User Experience Consistency — PASS

- `useWorkingTree()` 在 Angular / React / Vue 同名同签名同返回键，共享类型全部从 `@aiao/rxdb` 透传（FR-037）。
- 新增 `tri-framework-check`（本特性的工具交付项，见 Project Structure），比对三端 `src/index.ts` 导出集合与共享类型透传，缺一端即失败。
- 三端演示页面输出等价，由 Playwright 跨框架 E2E 用同一份 `@aiao/rxdb-test/cross-framework-fixtures` 种子验证——沿用既有 `search-parity` 的落地形态。
- loading / empty / error / a11y：命令暴露 loading/success/error，查询额外暴露 empty（FR-038）；WCAG 2.1 AA 由 Playwright a11y 断言把关（FR-039）。
- 「Never break userspace」：`switchBranch()` 默认行为不变是硬约束（FR-048），既有 demo 与文档示例必须零修改通过。

### IV. Performance Requirements — PASS

- 目标与验证方法已在 spec SC-012 定死，本计划把它落成 `benchmarks:bench-working-tree` target + 签入的 reference 报告。
- 宪法默认 DB op < 100 ms 与本特性的 status/diff/stage p95 ≤ 100 ms 一致；restore ≤ 1 s 是**经批准的例外**（一次恢复要重放最多 100 个变更单元，属批量操作而非单次 DB op），已在 spec SC-012 与下方 Complexity Tracking 记录。
- bundle < 50 KB gz：新代码按子模块组织，`packages/rxdb` 入口不新增副作用导入；三框架包只新增薄透传。
- 未启用该能力时零运行时开销（FR-011）——启用判定在 connect 期一次性完成，热路径上只读一个已缓存的布尔。

### 结论

**Phase 0 GATE: PASS**。无未经论证的违规；2 项需记录的例外已进入 Complexity Tracking。

## Project Structure

### Documentation (this feature)

```text
specs/001-working-tree-commits/
├── plan.md              # 本文件
├── research.md          # Phase 0 输出：技术决策与备选方案
├── data-model.md        # Phase 1 输出：实体 → 表结构、约束、状态机
├── quickstart.md        # Phase 1 输出：可运行的验证指南
├── contracts/           # Phase 1 输出：公开契约
│   ├── core-api.md              # @aiao/rxdb 新增公开导出
│   ├── tri-framework-api.md     # useWorkingTree() 三端对称契约
│   ├── conformance-suites.md    # 两套具名跨后端套件的契约
│   ├── adapter-contract.md      # 适配器需实现的新方法
│   └── benchmark-report.md      # bench-working-tree 报告 JSON 结构
├── checklists/
│   └── requirements.md  # 已完成（/speckit-specify 产出）
└── tasks.md             # Phase 2 输出（/speckit-tasks 生成，不由本命令创建）
```

### Source Code (repository root)

```text
packages/rxdb/src/
├── system/                          # 系统实体（既有目录，新增文件）
│   ├── branch.ts                    # 既有：RxDBBranch.activated 仍是当前分支唯一真相源
│   ├── change.ts                    # 既有：RxDBChange 保持不变
│   ├── migration.ts                 # 既有：RXDB_SYSTEM_SCHEMA_VERSION 递增 + 新增 watermark
│   ├── writer-lease.ts              # 既有：epoch 只用于迁移 fencing，不动语义
│   ├── commit.ts                    # 新增：RxDBCommit
│   ├── commit-branch-ref.ts         # 新增：RxDBCommitBranchRef
│   ├── commit-change-set.ts         # 新增：RxDBCommitChangeSet
│   ├── commit-capability.ts         # 新增：RxDBCommitCapabilityState
│   ├── working-tree-activation.ts   # 新增：RxDBWorkingTreeActivationState（单行）
│   ├── working-tree-state.ts        # 新增：RxDBWorkingTreeState
│   ├── working-tree-entry.ts        # 新增：RxDBWorkingTreeEntry
│   ├── index-state.ts               # 新增：RxDBIndexState
│   ├── index-entry.ts               # 新增：RxDBIndexEntry
│   ├── working-tree-restore-session.ts       # 新增：RxDBWorkingTreeRestoreSession
│   └── commit-branch-materialization.ts      # 新增：RxDBCommitBranchMaterializationAttempt
├── commit/                          # 新增子模块：提交图与 HEAD（US1）
│   ├── CommitManager.ts             # 提交、历史查询、可达性遍历
│   ├── commit-graph.ts              # 父链遍历、孤立/可达损坏判定
│   ├── commit-capability.ts         # 启用协商、协议校验、只读降级判定
│   ├── enable-migration.ts          # 首次启用迁移与基线生成（幂等、可重试）
│   └── commit-idempotency.ts        # 操作标识唯一约束与重试语义
├── working-tree/                    # 新增子模块：工作树捕获（US2）
│   ├── WorkingTreeManager.ts        # status / 冷重放 / 条目枚举
│   ├── capture.ts                   # 写入口捕获，挂在事务边界内
│   ├── write-intent.ts              # 意图枚举 + 受信登记表（键 = 文件 + 符号 + 意图）
│   ├── activation-token.ts          # { branch, activationRevision } 捕获与校验
│   └── replay.ts                    # HEAD + 条目 → 投影的冷重放
├── index-stage/                     # 新增子模块：缓存区与提交状态机（US3）
│   ├── IndexManager.ts              # stage / unstage / clearIndex / discardWorkingTree
│   ├── dependency-closure.ts        # 正向扩展 / 反向移除 / 环检测（复用 topological-sort）
│   ├── diff.ts                      # HEAD↔工作树、HEAD↔缓存区两条差异线
│   ├── residual-rebase.ts           # 提交时的残量 rebase
│   └── revision-guard.ts            # 版本号校验矩阵（两分类）
├── restore/                         # 新增子模块：历史恢复会话（US5）
│   ├── RestoreManager.ts            # restore / 会话生命周期
│   ├── materialization-path.ts      # 正/逆向重放路径选择
│   └── schema-compat.ts             # 路径上每个变更集的指纹与编解码版本校验
├── commit-branch/                   # 新增子模块：分支隔离与物化（US6）
│   ├── switch-branch-guard.ts       # WorkingTreeSwitchBranchOptions / clean 判据
│   ├── branch-lifecycle.ts          # create / remove 与提交、工作树、缓存区的集成
│   └── remote-materialization.ts    # 仅元数据远端分支的可续传分页物化
├── version/                         # 既有目录，受影响文件
│   ├── VersionManager.ts            # switchBranch / restoreEntity 增加意图透传
│   ├── HistoryManager.ts            # undo/redo 与 redo 栈失效增加意图透传
│   ├── merge-branch.ts              # 逐条与 squash 两条路径分别登记意图
│   ├── pull-batch.ts                # 意图 = 远端同步
│   ├── pull-repository.ts           # 意图 = 远端同步
│   └── cleanup-expired.ts           # 意图 = 远端同步（过期清理）
├── transaction/
│   └── transaction-executor.interface.ts   # mergeChanges 第三形参：boolean → 意图枚举
├── rxdb-adapter.ts                  # 新增适配器抽象方法；SwitchBranchOptions 保持不变
├── rxdb.interface.ts                # RxDBOptions 新增显式启用配置
└── index.ts                         # 新增公开导出（全部 Commit* / WorkingTree* / Index*）

packages/rxdb-adapter-pglite/src/
├── working-tree/                    # 新增：PGlite 侧 SQL 实现
└── RxDBAdapterPGlite.ts             # 实现新增抽象方法

packages/rxdb-adapter-sqlite-core/src/
├── working-tree/                    # 新增：SQLite 侧 SQL 实现（4 个后端共享）
└── RxDBAdapterSqliteBase.ts         # 实现新增抽象方法

packages/rxdb-{angular,react,vue}/src/
├── use-working-tree.ts              # 新增：三端同名同签名
└── index.ts                         # 新增导出 + 共享类型透传

packages/rxdb-test/src/
├── working-tree/                    # 新增：两套具名跨后端套件
│   ├── capture.suite.ts             # workingTreeCaptureConformanceSuite（US2 拥有）
│   ├── commit.suite.ts              # workingTreeCommitConformanceSuite（US3 拥有，含 US1 提交图/迁移断言）
│   ├── fixtures.ts                  # 共享 fixture 与崩溃注入
│   └── index.ts                     # 新增 subpath 导出 @aiao/rxdb-test/working-tree
└── cross-framework-fixtures/
    └── working-tree-parity.ts       # 新增：三端 E2E 共享种子（沿用 search-parity 形态）

apps/dev-rxdb-{angular,react,vue}/src/           # 新增工作树演示页面
apps/dev-rxdb-{angular,react,vue}-e2e/src/       # 新增 working-tree-parity.spec.ts + a11y 断言

benchmarks/
├── working-tree.bench.ts            # 新增：bench-working-tree 入口
├── reports/working-tree-reference.json          # 新增：冻结的 reference（先于候选发布签入）
└── project.json                     # 新增 target bench-working-tree

scripts/audit/
├── tri-framework-check.mjs          # 新增：三端导出与共享类型透传对称门禁
└── write-intent-drift.mjs           # 新增：受信意图登记 vs 代码静态漂移扫描（排除 dist/）

requirements/
├── api-baseline/*.json              # 更新：新增导出进基线
└── migration-release.json           # 更新：新的非迁移 bridge tag（US1 交付项）
```

**Structure Decision**: 沿用既有 monorepo 分层——核心语义全部落在 `packages/rxdb`，SQL 实现落在两处适配器实现（PGlite 与 sqlite-core，后者被 4 个 SQLite 后端继承），三框架包只做薄透传，跨后端一致性与跨框架 parity 分别由 `packages/rxdb-test` 的具名套件与 `apps/*-e2e` 承载。核心包内按**用户故事边界**切子模块（`commit/` → US1、`working-tree/` → US2、`index-stage/` → US3、`restore/` → US5、`commit-branch/` → US6），使每个故事可独立红→绿→验收，避免把状态机堆进既有的 `VersionManager.ts`（已 900+ 行）。

## Complexity Tracking

> 仅记录 Constitution Check 中需要论证的例外。

| Violation | Why Needed | Simpler Alternative Rejected Because |
| --- | --- | --- |
| **两个**适配器级写入口都要携带意图枚举：`TransactionExecutor.mergeChanges` 第三形参由 `disableTriggers: boolean` 改为 `RxDBWriteIntent`，且既有内部类型 `SwitchBranchOptions` 追加必填 `intent` 字段（均为内部契约变更，非公开导出） | FR-022 要求受信登记键为「文件 + 符号 + 意图」。**Phase 1 实测**：undo/redo 与切换分支物化走的都是 `adapter.switchBranch`（`HistoryManager.ts:1472` / `VersionManager.ts:769`），二者对工作树的语义正好相反，而 `SwitchBranchOptions` 当前连一个可区分的形参都没有；`mergeChanges` 侧的布尔参数同样区分不开（合并的逐条与 squash 路径都传 `false`，过期清理与 pull 都传 `true`）。全集共 11 个受信调用点，按**函数**或按**布尔**放行都会把某一类静默吞掉——这正是 FR-019 要防的缺陷 | 「保留 boolean，另加旁路事件表补记」被否：先改业务数据再补记事件无法保证同一事务原子性（FR-018），且崩溃窗口内会产生 spec Edge Cases 明令禁止的半状态。「按调用栈自动推断意图」被否：不可静态校验，无法支撑 SC-004 的「未登记调用点数量为 0」扫描 |
| 既有 `EntityIndexMetadataOptions` 新增可选谓词字段 `where?: { property; equals }`（公开类型的向后兼容扩展） | FR-012 要求「至多一个激活分支」是**数据库约束**而非代码纪律，落成 `CREATE UNIQUE INDEX ... ON rxdb_branch (activated) WHERE activated = TRUE`；现有索引元数据只支持 `properties` / `normalized` / `unique`，无法表达部分索引 | 「常量表达式索引 `((TRUE))`」被否：SQLite 不支持，跨 6 后端直接破。「可空 `activationSlot` 列 + 普通 UNIQUE」被否：`activated ⟺ activationSlot` 的双向一致性无 CHECK 约束可表达，退化为会漂移的第二份状态 |
| restore p95 ≤ 1 s 超出宪法 IV 的「DB operation < 100 ms」默认预算 | 一次恢复需要在单个事务内重放最多 100 个变更单元并整体物化，属批量操作而非单次 DB 操作；按单次预算切分会迫使跨事务分批，直接违反 FR-045 的原子性与 spec Edge Cases 的「不留部分物化中间态」 | 「分批提交 + 中间态可见」被否：与 FR-045 冲突。「限制恢复规模到 10 单元内以塞进 100 ms」被否：使能力对真实历史无用，且 fixture 规模（每提交 100 单元）由 epic 冻结 |

## 交付顺序与依赖

固定顺序 **US1 → US2 → US3 → US4 →（US5 ∥ US6）**：

| 阶段 | 故事 | 阻塞原因 |
| --- | --- | --- |
| 0 | 前置：新的非迁移 bridge tag（更新 `requirements/migration-release.json`） | FR-016；`v0.0.25` 经 squash 后已不是候选发布提交的祖先，`pnpm check-migration-release-gate` 会失败，挡住任何系统 schema 迁移 |
| 1 | US1 提交图与 HEAD | 后续全部能力需要稳定的版本锚点 |
| 2 | US2 工作树捕获 | 状态机需要真相源；意图枚举改造在此落地 |
| 3 | US3 缓存区与提交状态机 | US5 的冲突状态、US6 的 clean 判据都从这里派生 |
| 4 | US4 三框架操作面 | 冻结 `useWorkingTree()` 扩展点协议 |
| 5 | US5 恢复会话 ∥ US6 分支隔离 | 两者互相独立；各自的**核心持久层**可与阶段 4 并行开工，但**三端入口与 benchmark 追加**必须排在 US4 之后 |

## Constitution Re-Check（Phase 1 设计后）

| 原则 | 结论 | 设计阶段新增/变化 |
| --- | --- | --- |
| I. Code Quality | **PASS** | 例外从 1 项增为 **2** 项（新增 `EntityIndexMetadataOptions.where`），均已在 Complexity Tracking 论证。两项都是**加法**：新增可选字段、新增枚举形参，既有声明与调用点行为不变。`packages/rxdb` 的每个新公开导出在 [contracts/core-api.md](./contracts/core-api.md) 中逐个列出并要求 TSDoc |
| II. Testing Standards | **PASS** | [contracts/conformance-suites.md](./contracts/conformance-suites.md) 把 10 条不变式落成 2 套具名套件共 **36 组**断言，6 个后端逐一执行。确定性手法已冻结（无 `setTimeout`、崩溃用注入错误 + 重连、并发用同进程双实例同库）。覆盖率阈值未放宽 |
| III. UX Consistency | **PASS** | [contracts/tri-framework-api.md](./contracts/tri-framework-api.md) 冻结 v1 基线键集 + 扩展点协议 + 静态对称门禁（缺失导出数 = 0）。"Never break userspace" 由「未启用 = 零新表零行为差异」保证 |
| IV. Performance | **PASS** | [contracts/benchmark-report.md](./contracts/benchmark-report.md) 冻结 fixture、报告结构、`runnerProfileHash` 与三态门禁。restore ≤ 1 s 仍是**唯一**性能例外；包体积 < 50 KB gz 需在 US4 收尾实测 |

**Phase 1 GATE: PASS**。设计过程未引入任何未经论证的违规；唯一的实质变化是把写入意图的覆盖面从 `mergeChanges` 一处扩到 `mergeChanges` + `switchBranch` 两处——这是**修正一个会导致 FR-019 失效的漏洞**，不是范围膨胀。

## 下一步

`/speckit-tasks` 依据本计划与 Phase 1 契约生成 `tasks.md`。
