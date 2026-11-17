---
id: US-316
title: 导入远端提交：保留提交身份并快进分支头
status: In Review
priority: High
epic: epic-014-commit-graph-remote-exchange
created: 2026-11-17
updated: 2026-11-17
tags: [collaboration, working-tree, commit-graph, remote, tri-framework]
---

# 用户故事：导入远端提交：保留提交身份并快进分支头

## 作为/我想要/以便

**作为** 基于 working-tree 构建团队协作的产品开发者
**我想要** 把服务端下发的提交（ChangeSet、作者、消息、父链、内容指纹）原样导入本地分支，并把分支头快进到最后一个导入的提交
**以便** 第二台设备上的分支拥有与服务端相同的提交身份，之后的本地提交以它为父继续，而不会把拉取到的变化记成自己的提交。

## 范围边界

### In Scope

- 新增导入入口：校验父链从当前分支头延续（或从空分支开始），逐个校验内容指纹，以新的受信写意图把 ChangeSet 应用到业务表；导入的变化不进工作树、不计为未提交单元；提交节点按原 ID、作者、消息写入；分支头按修订号比较交换推进。
- `CommitKind` 增加合并种类，导入的合并提交可以有多个父，第一父必须是当前分支头。
- 幂等：已存在且指纹一致的提交跳过；同 ID 不同内容拒绝。
- 导出侧沿用 `commits$` / `commitChanges()`；如缺少「某提交之后」的增量列举，一并补齐。
- Angular / React / Vue 绑定暴露同一入口。

### Out of Scope

- 推送协议、服务端与权威裁决（由使用方负责）。
- 三方合并与冲突裁决。
- 可写检出位上的导入（沿用 epic-006「只有主检出位同步」）。

## 验收标准

| #   | 前置条件                                 | 操作                         | 预期结果                                                                              | 状态 |
| --- | ---------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------- | ---- |
| 1   | 空分支                                   | 导入一段远端提交链           | 提交 ID、父链、作者、消息与指纹和输入一致；业务表等于链末提交的数据；工作树保持 clean | ✅   |
| 2   | 分支头为 X，工作树 clean                 | 导入以 X 为父的提交          | 分支头快进，`listCommits()` 的顺序与父链一致                                          | ✅   |
| 3   | 工作树有未提交改动，或链首的父不是当前头 | 导入                         | 拒绝，且不写入任何提交或业务数据                                                      | ✅   |
| 4   | 某个提交的指纹与内容不符                 | 导入                         | 整批拒绝，不写入                                                                      | ✅   |
| 5   | 同一批提交再次导入                       | 导入                         | 幂等：不重复建提交、业务表不变；同 ID 不同内容拒绝                                    | ✅   |
| 6   | 有两个父的合并提交                       | 导入                         | 以合并种类写入，第一父为当前头；`listCommits()`、`restore()` 与分支对比都能正确遍历   | ✅   |
| 7   | 导入完成后本地继续编辑                   | `commit()`                   | 新提交以导入的头为父；`commitChanges()` 只含本地变化，作者为本次提交者                | ✅   |
| 8   | 六个支持 working-tree 的适配器           | 运行导入一致性套件           | 结果一致                                                                              | ✅   |
| 9   | 三端绑定                                 | 经 `useWorkingTree` 调用导入 | 三端 API 对称，类型与行为一致                                                         | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

验收证据（2026-11-17）：在隔离 worktree（基线 `b2e746fa1`，叠加 US-317）上完成实现与验证，随后以补丁并入本分支；并入后 `pnpm audit:callsite-drift`（15/15）与 `pnpm audit:requirements` 通过，构建、单测与六个适配器的测试在本分支串行复跑后补记。

- 一致性套件 `src/working-tree/testing/worktree.suite.ts` 的「导入远端提交（US-316）」一节：AC#1 空分支导入整条链（提交身份与指纹逐字相同）、AC#2 从当前头延续并快进、AC#3 脏工作树与链首父不对时零写入、AC#4 指纹不符整批拒绝、AC#5 重复导入为 no-op 且同 ID 不同内容被拒、AC#6 合并提交入库后 `listCommits()` / `restore()` / 提交视图 / 从提交建分支 / 分支对比与切分支都走对、AC#7 导入后本地提交以导入的头为父；另有前像核对（服务端增量与本机业务行对不上时整批 `precondition_mismatch`、零写入）。六个适配器（electron / pglite / sqlite-wasm / sqlite / sqliteai / wa-sqlite）同一份套件均 62/62（AC#8）。
- 单测：`import-commits.spec.ts`、`import-precondition.spec.ts`、`commit-graph-merge.spec.ts`、`facade-import-export.spec.ts`、`fingerprint-normalization-doc.spec.ts`（按文档手拼规范串逐字核对指纹）；working-tree 包 87 个文件 1414 例通过，分支覆盖率 91.3%。
- AC#9：三端 `useWorkingTree()` 对称新增 `importCommits` / `exportCommits` 与对应状态，三端绑定测试 React 89 例、Vue 86 例、Angular 95 例通过。
- 受信写登记表 #15（`import-command.ts · applyImportedCommit`，意图 `remote_commit_import`）与 epic-006 登记表、写入口矩阵、漂移扫描同步；`pnpm nx run website:check-doc-code` 481 个代码块零错误；React working-tree e2e 15 例通过。

## 技术笔记

- 现状（2026-11-17 核对）：提交 ID 在本地生成，写路径的父提交只取当前 HEAD，`commit()` 不伪造远端作者；外部只有 `BranchMaterializationSource` 能物化数据，且只写一个无父的 `branch_baseline`，不带提交历史；远端同步拉下的变化以 `remote_sync` 来源进工作树。
- 新的受信写意图需要按 epic-006「受信调用点登记表」登记调用点，并更新意图枚举与漂移用例。
- 首个使用方 [ADMIN-US-221](../../../rxdb-admin-template/requirements/stories/collaboration/ADMIN-US-221-task-drafts-on-working-tree.md) 的服务端提交协议已对齐 `CommitChangeSet` 形状（ADMIN-US-218 切片 C），提交 ID 同为 UUIDv7、指纹同为 SHA-256。

## 实现文件

- 导入与导出：`packages/rxdb-plugin-working-tree/src/working-tree/import-command.ts`、`import-batch.ts`、`import-precondition.ts`、`database-versioned-domain.ts`，`src/commit/commit-exchange.ts`、`commit-ancestry.ts`；门面 `working-tree-facade.ts` 的 `importCommits()` / `exportCommits()`。
- 多父遍历：`src/commit/list-commits.ts`（合并图上子先于父的拓扑序）、`restore-precheck.ts` 与 `checkout/worktree-commit-view.ts`（沿第一父链，侧枝目标返回 `side_branch_target`）。
- 受信写：`packages/rxdb/src/trusted-write/trusted-write-intent.ts`（`remote_commit_import`，登记表 #15）。
- 三端绑定：`packages/rxdb-plugin-working-tree-{angular,react,vue}/src/use-working-tree.ts`。
- 文档：插件 README 与 `website/docs/plugins/rxdb-plugin-working-tree/README.md`（导入 API、被拒成因、指纹规范化规则与示例哈希、与通用实体同步不能共用）、`CHANGELOG.md`。

## 已知边界与遗留风险

- 只按第一父链快进：头在合并提交非第一父一侧的设备直接导入得到 `not_fast_forward`，需按文档的恢复路径（从分叉提交建分支、切过去再导入）收敛。
- 加密列不能跨设备交换（各库密钥环不同，叠业务表时整笔回滚）；交换的实体须配 `SyncType.None`，导入在入口拒绝走通用同步的实体。
- 只测了同后端两台设备之间的交换，没测 PGlite 与 SQLite 之间。
- 有合并时 `listCommits({ limit })`、`exportCommits()` 与重复导入的 no-op 判定都要走整段历史，整批导入在一个事务里、不分页。

## References

- [epic-014](../../epics/epic-014-commit-graph-remote-exchange.md)
- [epic-006](../../epics/epic-006-working-tree-commits.md)
- [Admin 协作后端收敛实施计划](../../../rxdb-admin-template/requirements/plans/collaboration-convergence-tasks.md)
