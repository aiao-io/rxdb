---
id: US-306b
title: 缓存区与提交状态机
status: Backlog
priority: High
epic: epic-006-working-tree-commits
created: 2026-08-15
updated: 2026-08-15
tags: [collaboration, index, staging, diff, commit, concurrency]
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖持久工作树，但可用核心 API 独立完成 stage → refresh → commit
- [x] Negotiable: diff DTO 的字段组织和物理 index 表名可调整
- [x] Valuable: 用户能选择性提交且不会生成不可重放 index
- [x] Estimable: 操作、revision、依赖闭包和冲突口径已冻结
- [x] Small: 不含写入口捕获、三框架 UI、restore 或 branch switch
- [x] Testable: 核心状态机和跨 realm CAS 都有确定性 fixture
-->

# 用户故事：缓存区与提交状态机

> 父契约见 [US-306](./US-306-working-tree-index.md)。本故事依赖
> [US-306a](./US-306a-working-tree-capture.md) 的持久工作树。

## 作为/我想要/以便

**作为** 需要控制提交边界的开发者
**我想要** 查看差异、选择可独立重放的变更并提交
**以便** 未暂存修改不会被覆盖，跨 realm 竞争不会静默丢数据

## 范围边界

### In Scope

- `status()` / `diff(scope?)` 的核心 API 和稳定 DTO：`WorkingTreeStatus`、`WorkingTreeDiff`、
  `WorkingTreeSelection`、`WorkingTreeStageResult`、`WorkingTreeCommandError` 的定义、TSDoc 与 api-baseline 登记
  （[US-306c](./US-306c-cross-framework-working-tree.md) 只从 `@aiao/rxdb` 透传，不另行定义）
- `IndexState` / `IndexEntry`、stage/unstage/stage all/clear index
- 基于同实体顺序、完整事务、schema relation graph 与实际行引用的依赖闭包
- `commit(message, options)`、operation ID 幂等、residual rebase
- `discardWorkingTree()` 与 index 清理
- **调用方捕获型** revision CAS：working-tree / index / head / active branch token。普通 CRUD 的
  working-tree revision 是**事务内读改写**，归 [US-306a](./US-306a-working-tree-capture.md)，两者不重叠，
  见 [epic revision 校验矩阵](../../epics/epic-006-working-tree-commits.md#revision-校验矩阵)
- 一次性 `CommitConflict` 与 durable `status().conflicted` 的边界。`CommitConflict` 的类型定义、TSDoc 与
  api-baseline 登记归本故事（首个使用者），[US-308](./US-308-branch-isolation-conflict.md) 只做 activation 维度扩展
- `WorkingTreeRestoreSession` 的**建表与 schema 迁移**，以及「从已存在 session 派生 conflicted」的读路径
- IndexEntry 加密 envelope 与核心类型/API baseline

### Out of Scope

- 工作树写入口捕获，归 US-306a
- 三框架公开入口和性能门禁，归 US-306c
- restore 的**语义**——`restore()` 入口、会话的创建与 `active | conflicted | committed` 生命周期、no-op 判定、
  schema/codec 兼容预检——归 [US-307](./US-307-restore-session.md)。本故事只建表并实现从已存在 session 派生
  conflicted 的读路径，理由见[父故事的相邻资产说明](./US-306-working-tree-index.md#子故事与交付边界)
- branch switch 归 [US-308](./US-308-branch-isolation-conflict.md)

## 验收场景

1. **Given** 工作树有两个独立修改，**When** 只 stage 其中一个并刷新，**Then** index snapshot、顺序、依赖和事务边界保持；commit 只包含该闭包，另一个修改继续 unstaged。
2. **Given** index 为空或 message/authorId/operationId 非法，**When** commit，**Then** 在持久状态变化前拒绝。
3. **Given** stage 后同一实体再次编辑，**When** status/diff 或 commit 原 snapshot，**Then** staged snapshot 不变，后续编辑保留为 unstaged；re-stage 才原子替换 snapshot。
4. **Given** T1 插入 A/B、T2 更新 A，**When** 只 stage T2，**Then** 闭包包含 T1+T2；unstage T1 同时移除依赖 T2。
5. **Given** T1 插入 Parent P、T2 插入 Child C 并引用 P，**When** 只 stage T2，**Then** 闭包包含 T1 并按 Parent→Child 重放；Child DELETE→Parent DELETE 与关系键 UPDATE 遵守反向依赖。
6. **Given** relation graph 存在不可拆分环，**When** 环内单元可作为同一原子集合重放，**Then** 全部纳入；无法形成合法闭包时返回 `index_dependency_cycle` 且 index 零变化。
7. **Given** 两个 realm 从同一 revision stage/commit，**When** 条件更新竞争，**Then** 只有一个成功，失败方收到 expected/actual revision 且无半成品。
8. **Given** 普通 stage/commit CAS 失败，**When** 刷新后调用 status，**Then** 状态按最新持久数据重建，不因历史失败永久显示 conflicted。
9. **Given** active restore session 的 expected revision 与当前值分叉（表由本故事建立，fixture **直接写入 session 行**构造分叉，不经 [US-307](./US-307-restore-session.md) 的 `restore()` 入口——与 US-306a 直接推进 `activationRevision` 同源），**When** 调用 status，**Then** 返回 durable conflicted；session 解决或删除后该状态消失。写入该 session 的领域操作归 US-307。
10. **Given** commit 响应丢失，**When** 相同 operation ID 与相同 payload 重试，**Then** 返回原 commit；payload 不同返回 `idempotency_key_reused`。
11. **Given** 工作树含未提交修改和 index，**When** discardWorkingTree，**Then** 业务投影回到 HEAD、index 清空、commit 图不变；外键依赖整体回滚。
12. **Given** 加密字段被 stage/commit，**When** 扫描 IndexEntry 原始 dump，**Then** 明文哨兵零命中。
13. **Given** 实体被删除后 stage，**When** 查看 `diff(scope)`，**Then** 该删除以显式 delete 单元出现在 HEAD↔index 与 HEAD↔工作树 差异中，不得表现为条目消失或空 diff；commit 后 HEAD 中该实体不存在。
14. **Given** 工作树有未提交修改且 index 非空，**When** 调用 `clearIndex()`，**Then** 只清空暂存选择并递增 `indexRevision`，业务投影、`WorkingTreeEntry` 与 `workingTreeRevision` 逐字段不变；随后 `status()` 显示同一批变更全部回到 unstaged。
15. **Given** 空事务、对未变化工作树的重复 stage、以及对已 clean 工作树的重复 `discardWorkingTree()`，**When** 反复执行，**Then** 全部幂等：不产生额外 commit、不递增任何 revision、不返回错误，`status()` 结果稳定。

## 核心操作契约

| 操作                         | revision 校验                        | 成功变化                                  |
| ---------------------------- | ------------------------------------ | ----------------------------------------- |
| `status()` / `diff()`        | 读取一致快照                         | 无                                        |
| `stage()` / re-stage         | active + working-tree + index        | index；工作树不变                         |
| `unstage()` / `clearIndex()` | active + index                       | index                                     |
| `commit()`                   | active + head + index                | head、index、working-tree residual rebase |
| `discardWorkingTree()`       | active + head + working-tree + index | working-tree；index 非空时同时变化        |

`CommitConflict` 只描述一次失败命令。v1 不持久化通用冲突表；`status().conflicted` 只由 durable
`WorkingTreeRestoreSession` 派生，不能依赖页面内存保留一次旧 CAS 错误。

## 功能需求

### 承接的父故事条目（逐条可核对）

| 父故事条目 | 本故事承接范围                                                                                                                               | 对应验收场景   |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| FR-004     | 全部：status 状态集合、一次性 `CommitConflict` 与 durable conflicted 的边界；含 `WorkingTreeRestoreSession` 建表与 `CommitConflict` 类型登记 | AC8、AC9       |
| FR-005     | 全部：`diff(scope?)` 的两条比较线与实体/事务粒度                                                                                             | AC1、AC13      |
| FR-006     | 全部：stage / unstage / stage all / clearIndex 不改历史、不丢未选择变更                                                                      | AC1、AC14      |
| FR-007     | 全部：staged 快照保留与新增部分标记 unstaged                                                                                                 | AC3            |
| FR-011     | 全部：commit 后只清已提交条目、未暂存变更保留                                                                                                | AC1            |
| FR-016     | 全部：discard 与 clearIndex 的范围区分                                                                                                       | AC11、AC14     |
| FR-031     | 全部：四类 revision CAS 矩阵与 commit 内 residual rebase                                                                                     | AC7、AC8       |
| FR-032     | 全部：stage 后编辑不按 writer 身份分叉                                                                                                       | AC3            |
| FR-040     | 全部：stage/re-stage 双 revision 校验、no-op 语义、事务自动扩展                                                                              | AC3、AC4、AC15 |
| FR-041     | 全部：message/authorId/operationId 校验与保留审计字段不可覆盖                                                                                | AC2、AC10      |
| FR-045     | 仅 `IndexEntry` 半边（`WorkingTreeEntry` 半边归 US-306a）                                                                                    | AC12           |
| FR-047     | 全部：index 自包含重放、依赖闭包正反向对称、`index_dependency_cycle`                                                                         | AC4、AC5、AC6  |

父故事 AC 逐条对照（发布门禁 2 按此核对，缺一行即拆分失败）：

| 父故事 AC | 本故事承接范围                                                                                         | 对应验收场景 |
| --------- | ------------------------------------------------------------------------------------------------------ | ------------ |
| US1-AC1   | 仅 diff 半边：刷新后 HEAD↔工作树 / HEAD↔index 差异一致（工作树数据与未暂存标记的持久化半边归 US-306a） | AC1、AC13    |
| US1-AC2   | 全部：刷新后缓存区选择、变更顺序与事务边界不变                                                         | AC1          |
| US2-AC1   | 全部：只提交被 stage 的闭包，另一修改留在工作树                                                        | AC1          |
| US2-AC2   | 全部：空 index 提交被拒，工作树与 HEAD 不变                                                            | AC2          |
| US2-AC3   | 全部：staged 版本与 unstaged 版本分别可见，不静默并入                                                  | AC3          |
| US2-AC4   | 全部：多实体事务作为不可拆分单元进入 commit                                                            | AC4、AC5     |
| US2-AC5   | 全部：删除必须出现在 diff                                                                              | AC13         |
| US2-AC6   | 全部：commit 后只清已提交条目，未暂存变更保留并显示准确 diff                                           | AC1          |
| US2-AC7   | 全部：空事务 / 重复 stage / 重复 discard 幂等                                                          | AC15         |
| US2-AC8   | 全部：其他 realm 的后续编辑一律记为 unstaged，不覆盖 snapshot                                          | AC3          |
| US2-AC9   | 全部：双 realm 竞争只允许一个成功，失败方返回 expected/actual                                          | AC7          |
| US2-AC10  | 全部：re-stage 原子替换快照；工作树未变化时为 no-op 且不递增 revision                                  | AC3、AC15    |
| US2-AC11  | 全部：选择自动扩展到完整事务与关系依赖并返回实际列表                                                   | AC4、AC5     |
| US2-AC12  | 全部：捕获 token 后被抢先修改则 `workingTreeRevision` CAS 失败，index 零变化                           | AC7          |
| US2-AC13  | 全部：message/authorId/operationId 校验先于任何持久状态变化                                            | AC2          |
| US2-AC14  | 仅 `IndexEntry` 半边（`WorkingTreeEntry` dump 扫描归 US-306a）                                         | AC12         |
| US2-AC15  | 全部：跨事务前置闭包与反向 unstage，失败时 index 零变化                                                | AC4          |
| US2-AC16  | 全部：Parent→Child 拓扑、DELETE 逆序、关系键 UPDATE 与关系环                                           | AC5、AC6     |
| US3-AC1   | 全部：discard 回到当前 HEAD 且历史 commit 不变                                                         | AC11         |
| US3-AC2   | 全部：`clearIndex()` 只清暂存选择                                                                      | AC14         |
| US3-AC3   | 全部：跨实体外键依赖在事务边界内整体回滚                                                               | AC11         |

父故事剩余 AC 的归属是**穷举**的，不存在兜底：US1-AC3 的工作树半边、US1-AC4 的持久层半边、
US2-AC17/AC18/AC19 归 [US-306a](./US-306a-working-tree-capture.md)；US1-AC3 的 baseline 半边归
[US-305](./US-305-commit-graph-head.md)，US1-AC4 的切出/切回往返半边归
[US-308](./US-308-branch-isolation-conflict.md)；US-306c 不承接任何编号父 AC，只承接三框架与 a11y 横切项。

## 测试要求

- 核心包覆盖率不低于 90%，先写 index 不可重放和 residual edit 丢失的失败用例。
- `workingTreeCommitConformanceSuite` 在 6 个 v1 本地后端（PGlite、wa-sqlite、sqlite-wasm、sqlite、sqliteai、
  Electron `node:sqlite` host）运行，覆盖 stage/unstage/commit/discard 的 revision CAS、崩溃恢复与幂等。
  US-305 的 commit 图 / HEAD 断言并入同一 suite（见 [epic-006 conformance 口径](../../epics/epic-006-working-tree-commits.md)），
  任一后端缺席即本故事未完成。
- 依赖闭包 fixture 覆盖同实体链、多实体事务、跨事务父子关系、DELETE 逆序、关系键 UPDATE 与环。
- 每个成功 index 都必须通过“从 HEAD 在空投影重放”的通用断言。
- 双 realm fixture 覆盖 stage、re-stage、commit、discard CAS；不用固定延时。
- 幂等 fixture 必须断言「不递增 revision」，而不只是「不报错」。
- `WorkingTreeRestoreSession` 需独立 fixture：启用后表存在、可直接写入 session 行并派生 `status().conflicted`、
  session 删除后该状态消失；全程不依赖 US-307 的 `restore()` 入口。
- API baseline 与类型契约覆盖全部核心 DTO、选项和类型化错误（含 `WorkingTreeStatus` / `WorkingTreeDiff` /
  `WorkingTreeSelection` / `WorkingTreeStageResult` / `WorkingTreeCommandError` / `CommitConflict`，
  即 US-306c 三端透传的共享类型全集）；新增公开导出缺 TSDoc 时 lint 失败。

## 实现文件（计划阶段待确认）

- `packages/rxdb/src/version/` — status/diff/index/commit 状态机
- `packages/rxdb/src/system/` — IndexState / IndexEntry / `WorkingTreeRestoreSession`（仅建表与迁移）
- `packages/rxdb/src/__tests__/version/` — 闭包、CAS、幂等与 residual rebase
- `requirements/api-baseline/rxdb.json`
