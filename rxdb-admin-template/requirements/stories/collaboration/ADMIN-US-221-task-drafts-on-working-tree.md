---
id: ADMIN-US-221
title: 团队任务草稿落在 RxDB 工作树
status: Done
priority: Medium
epic: ADMIN-EPIC-004
created: 2026-11-17
updated: 2026-11-19
tags: [admin, collaboration, working-tree, rxdb, model-driven]
dependsOn: [ADMIN-US-218]
capabilities: [rxdb:US-319, rxdb:US-320]
---

# 用户故事：团队任务草稿落在 RxDB 工作树

## 作为/我想要/以便

**作为** 团队编辑者与模板使用方
**我想要** 在团队任务中用与本机工作台相同的模型驱动列表和表单编辑数据，保存、提交、另存与恢复都沿用平台 working-tree
**以便** 换一套业务实体时不用修改协作代码，本机与团队两种模式的交互保持一致。

## 范围边界

### In Scope

- 每个「用户 × 团队 × 应用」一个团队库（sqlite-wasm IndexedDB + history + working-tree），关闭通用同步。
- 本地共享分支经导入镜像服务端共享引用；任务即从导入的共享提交建出的分支。
- 团队模式的编辑复用各应用的 `EntityList`；协作包保留团队、PR、审核、历史面板，删除自写的任务存储、编辑器与表单缓冲。
- 保存、同步、另存为新任务、版本恢复分别对应 RxDB 写入、`commit()` 加 `commitChanges()` 上传、`createBranchFromCommit()`、`restore()`。

### Out of Scope

- 平台的三方字段级合并与冲突裁决：合并继续由产品服务端执行，上移平台为后续候选。
- 用可写检出位让同一用户并行编辑多个任务。

### 前置的平台能力

以下能力是平台 epic-006 的非目标，已在根 requirements 以 [epic-014](../../../../requirements/epics/epic-014-commit-graph-remote-exchange.md) 交付，本故事建立在它们之上：

1. 导入远端提交：保留提交 ID、父链、原作者与内容指纹，并把分支头快进到外部提交；合并类（多父）提交可以导入——[US-319](../../../../requirements/stories/collaboration/US-319-remote-commit-import.md)。
2. `discard()` / `restore()` 同步回写业务表，放弃的编辑不再被查询读到——[US-320](../../../../requirements/stories/collaboration/US-320-discard-restore-projection.md)。

## 验收标准

| #   | 前置条件                      | 操作                                 | 预期结果                                                                                    | 状态 |
| --- | ----------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------- | ---- |
| 1   | 用户在设备 A 提交并同步了任务 | 在设备 B 打开同一任务                | 设备 B 本地分支的提交 ID、父链与原作者和服务端一致，不记为拉取者的提交（ADMIN-US-206 AC#2） | ✅   |
| 2   | 团队任务已打开                | 用实体列表新增、编辑、删除跨实体记录 | 改动进入任务工作树，界面区分未保存、已保存与已提交（ADMIN-US-205 AC#3～5）                  | ✅   |
| 3   | 任务有已保存未提交的改动      | 放弃草稿                             | 列表与表单立即回到任务头的数据，不残留已放弃的编辑                                          | ✅   |
| 4   | 应用改用另一套业务实体        | 在团队模式编辑、同步并发起 PR        | 不修改协作包代码即可工作，编辑界面由实体元数据生成                                          | ✅   |
| 5   | 选择一个历史版本              | 恢复并同步                           | 形成新的未提交改动，不移动共享头、不删除历史（ADMIN-US-213）                                | ✅   |
| 6   | 三端运行同一任务场景          | 创建、编辑、保存、同步、另存与恢复   | 三端行为一致；ADMIN-US-205、206、213 的 AC 在新实现上回归通过                               | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

实施拆为两步（2026-11-18 起）：

1. 221-A 协议切换：服务端提交存储与线上格式改为平台 `CommitExchangeRecord`，用 `@aiao/rxdb-plugin-working-tree/exchange` 校验批次、复算指纹；共享分支以 `baseline` 根提交起步，合并提交为 `merge` 种类、第一父为共享头；提供按「已知提交 → 分支头」下发交换记录的只读接口。现有界面不变，全部用例保持通过。
   - ✅ 2026-11-18 完成：提交表存完整交换记录（有序 `parent_ids`、`kind`、可空作者、记录自带的 `created_at`、平台内容指纹），单元存九列；上传与另存经平台的严格解析、`checkCommitExchangeBatch` 与指纹复算；初始化建 `baseline` 根提交，合并提交为 `[共享头, 任务头]` 两个父、单元相对第一父；新增只读函数 `admin_commit_exchange()`，按「已知提交 → 分支头」分页下发、父先于子。落库形态以 sqlite-wasm 捕获为准：日期为 `toISOString()` 串，布尔为 0 / 1，服务端不归一化。单测 545、集成 76，Node 与 Edge 两种模式的协作 e2e 各 42 例通过；请求上限随之由 2 MiB 放宽到 4 MiB（见 ADMIN-US-220 AC#3）。
2. 221-B 客户端切换：每个「用户 × 团队 × 应用」一个启用 working-tree 的团队库，共享分支与任务分支经 `importCommits()` / `exportCommits()` 与服务端交换；三端在协作页用模型驱动的实体界面编辑团队库；保存、同步、放弃、恢复与另存走平台 API。
   - ✅ 2026-11-18 完成：应用经 `createTeamDatabase(scope)` 建团队库（sqlite-wasm idb、history 插件、`SyncType.None`、散列库名，按用户 × 团队 × 应用分库），协作包核对约定后装 working-tree 并 `enableIfEmpty()`；本地 `main` 镜像服务端共享分支，每个任务一条从任务起点建出的本地分支，再导入服务端已有的任务提交；同步时整棵工作树形成一个提交，经 `exportCommits()` 分批上传；放弃草稿走 `discard()`，恢复历史版本走 `restore()`；三端经 `renderEditor(container, { database, task })` 在协作页渲染模型驱动的 `EntityList`。协作包删除了资产专用编辑器与 IndexedDB 任务存储。

验收证据（2026-11-18，本地隔离 Supabase 栈；用例都在 react、angular、vue 三个项目与 Node、Edge 两种模式下跑）：

- AC#1 ✅：e2e「跨设备续作：第二台设备导入同一任务…（ADMIN-US-221 AC#1）」经接口核对两台设备的提交 ID、父链与作者一致；`team-exchange.integration.spec.ts` 在真实 PostgreSQL 服务端上走「本机编辑 → commit → exportCommits 上传 → 第二台设备导入」；`team-tasks.spec.ts` 用真实 PGlite + history + working-tree 断言拉取者不会把它记成自己的提交。
- AC#2 ✅：经实体列表跨实体增删改，任务状态区分「有已保存未提交的改动」「有已提交未同步的提交」「已同步」，另起一行显示「有未保存的输入」（e2e「真实身份、任务保存、离线同步、非作者审批和原子合并」与未保存输入用例，`task-view.spec.ts`、`unsaved-input.spec.ts`）。「未保存输入」来自平台 `EntityList` 新增的未保存状态输出（React `onDirtyChange`、Angular `dirtyChange`、Vue `dirty-change`，判定只在 `rxdb-model` 的 `EntityDirtyTracker` 一处）；有未保存输入时离开页面会提示，同步、切换任务与退出会先拦下。Angular 的表单在失焦或回车时才提交取值，没失焦就离开不会提示，已写进平台文档。
- AC#3 ✅：e2e「放弃草稿：列表与表单立即回到任务头的数据…（AC#3）」，`team-tasks.spec.ts` 与集成用例。
- AC#4 ✅：`domain-free.spec.ts` 断言协作包非测试源码不含资产的实体名、字段名与命名空间；`team-tasks.spec.ts` 用项目 / 里程碑两种实体（含布尔、整数、日期）走完提交、上传、服务端检查、合并与另一台设备导入；三端 `team-editor.spec` 断言编辑区的实体清单完全来自库的元数据。三个演示应用都用资产实体，没有换实体的应用级 e2e。
- AC#5 ✅：e2e「恢复历史版本：形成未提交改动，同步、审批后合并，共享头只前进、历史保留（AC#5、ADMIN-US-213）」；只在合并带进来的侧枝上的版本被平台以 `side_branch_target` 拒绝并给出提示。
- AC#6 ✅：同一套 17 个协作 e2e 在三端、两种模式下各 51 例全部通过，覆盖 ADMIN-US-204 / 205 / 206 / 213 的场景；三端匿名工作台的 e2e 各 104 例通过。e2e 改写只换了操作路径（对话框录入、按引用顺序逐条删除等），原有断言保留或收紧。
- 单测 572 例、集成 79 例，三端单测 React 140、Vue 154、Angular 155 例。

## 技术笔记

结合评估、可复用能力、平台缺口与「为什么不现在就切」见 [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md) 第 5 节。[ADMIN-US-218](ADMIN-US-218-delta-commits-bounded-cost.md) 先把提交协议切换为与 `CommitChangeSet` 同形的 ChangeSet；本故事在它之上分两部分落地：221-A 把服务端提交存储与线上格式改为平台的 `CommitExchangeRecord`，221-B 把客户端改为团队库加平台 API。`enable()` 是库级且不可逆的开关，团队库必须与匿名工作台分库。

## 实现文件

- 协作包客户端：`packages/collaboration/src/client/team-database.ts`（团队库约定与打开）、`team-tasks.ts`（团队库上的全部本机动作）、`task-ledger.ts`（本机任务账本，只存元数据）、`task-view.ts`、`team-editor.ts`（编辑区回调约定）、`controller.ts`、`mount.ts`；删除了 `local.ts`、`editor.ts`。
- 提交协议与存储（221-A）：`rxdb-admin-template/supabase/migrations/202611180002_exchange_commits.sql`，`src/commit.ts`、`src/server/` 下的命令与存储，下发函数 `admin_commit_exchange()`。
- 三端：`apps/{react,angular,vue}/src/app/rxdb/team-database.ts`、`pages/team-editor.*`、`pages/team-editor-renderer.*`、`pages/collaboration-page.*`。

## References

- [协作后端收敛实施计划](../../plans/collaboration-convergence-tasks.md)
- [平台 working-tree 插件](../../../../packages/rxdb-plugin-working-tree/README.md)
- [平台 epic-006](../../../../requirements/epics/epic-006-working-tree-commits.md)
- [ADMIN-EPIC-004](../../epics/ADMIN-EPIC-004.md)
