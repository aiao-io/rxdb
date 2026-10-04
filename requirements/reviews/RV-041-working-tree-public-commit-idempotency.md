---
id: RV-041
title: 工作树公开 commit 原请求重试被过期 HEAD 凭据挡住
status: Open
created: 2026-10-03
updated: 2026-10-03
severity: P2
baseline: b01e35e9aedc58e61fb02a909ec98b4a119e82a2
---

# RV-041：工作树公开 commit 原请求重试被过期 HEAD 凭据挡住

## 问题

🔴 **确认问题，待修复。** 调用 `workingTree.commit(message, options)` 成功后，用相同 message、author、operationId 和原始捕获凭据重试，返回 `ok:false / head_revision`，而不是第一次成功的 commit。内部 `writeCommit` 的幂等逻辑存在，但公开门面在到达它之前已经拒绝请求。

这违反了 [US-305 场景 7](../stories/collaboration/US-305-commit-graph-head.md) 第 156 行“已提交但响应丢失，原请求重试仍返回原 commit，幂等命中先于过期 HEAD CAS”的要求；[WorkingTreeManager.commits$ 文档](../../packages/rxdb-plugin-working-tree/src/working-tree/working-tree-facade.ts) 第 138–140 行也明确承诺幂等重放 `ok:true`、不再次发事件。本轮没有复现重复写入或数据丢失，确认的是公开重试契约失效。

## 根因与源码证据

[runCommitWorkingTree](../../packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts) 第 263–273 行先比较 active token、HEAD 和工作树 revision，只要第一次提交已经推进 HEAD，就立即返回 conflict。调用 [writeCommit](../../packages/rxdb-plugin-working-tree/src/commit/write-commit.ts) 第 389–401 行的 operationId 查重在后面，根本没有机会执行。第一次提交还在 finishCommit 中清空了工作树，简单刷新凭据也不等价于重放原请求。

已有 [facade-commits.spec.ts](../../packages/rxdb-plugin-working-tree/src/__tests__/working-tree/facade-commits.spec.ts) 第 107–121 行在重放前**人工重新 seed 已被提交清掉的 WorkingTreeEntry，并重新取当前凭据**。它验证的是刻意重建的场景，不是丢失响应后重试同一请求。因此该测试通过并不能证明公开幂等契约。

## 真实后端复验

在 [共享 commit conformance 套件](../../packages/rxdb-plugin-working-tree/src/working-tree/testing/commit.suite.ts) 新增一条统一断言：通过真实实体 save 形成工作树，捕获 status，调用公开 commit，然后不重建条目、不更新凭据，重放完全相同的请求。对照仍由原 53 条共享套件执行，不在两个后端分别写不同断言。

| 实际后端 / 运行面                    | 本轮结果             | 证据                                                                                                                                                                        |
| ------------------------------------ | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 官方 SQLite-WASM / Chromium          | 1 failed / 53 passed | [日志](evidence/2026-10-03/follow-up/rxdb-adapter-sqlite-public-retry-built.txt) · [状态](evidence/2026-10-03/follow-up/rxdb-adapter-sqlite-public-retry-built-status.json) |
| 实际 PGlite / Chromium，memory store | 1 failed / 53 passed | [日志](evidence/2026-10-03/follow-up/rxdb-adapter-pglite-public-retry.txt) · [状态](evidence/2026-10-03/follow-up/rxdb-adapter-pglite-public-retry-status.json)             |

两端第一次 commit 正常，重试均返回 `head_revision`。例如 SQLite 的 expected=1 / actual=2，第一次成功结果的 headRevision=2。新断言加入前，两端原 53 条均通过：[SQLite 基线](evidence/2026-10-03/follow-up/rxdb-adapter-sqlite-commit-conformance.txt) / [PGlite 基线](evidence/2026-10-03/follow-up/rxdb-adapter-pglite-commit-conformance.txt)。

SQLite 配置读取构建后的 testing 子入口。第一次未重建时只收集旧 53 条、退出码为 0；该结果明确 [标记为没有验证新 probe](evidence/2026-10-03/follow-up/rxdb-adapter-sqlite-public-retry-status.json)，不记为新断言通过。重建 [testing 产物](evidence/2026-10-03/follow-up/working-tree-testing-build-status.json) 后实际收集 54 条，失败栈也落到该新产物中的断言。PGlite 的本次配置走源码入口；不把两个路径混称为同一种构建来源。

```bash
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-plugin-working-tree:build --excludeTaskDependencies --skipRemoteCache --skipNxCache
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-adapter-sqlite:test --args='src/__tests__/working-tree-commit-conformance.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
CI=true CODECOV_TOKEN= NX_DAEMON=false pnpm nx run rxdb-adapter-pglite:test --args='src/__tests__/working-tree-commit-conformance.spec.ts --run --coverage.enabled=false --maxWorkers=1' --excludeTaskDependencies --skipRemoteCache --skipNxCache
```

以上跳过依赖任务的前提是其它生产依赖已在启动批构建、未修改；共享 testing 新断言必须先重建。首次 checkout 应按真实依赖构建，不能机械照抄排除依赖选项。

## 修复方案

在保留分支 generation / activation 归属保护的前提下，先根据已落库的请求身份和指纹识别已完成的重试，再进行只适用于新提交的 HEAD / working-tree CAS。命中后返回原 commit，不移动 HEAD、不清理后来新产生的草稿、不重复发 commits$；没有命中或 payload 不同仍按现有严格错误/冲突契约处理。

公开 commit 的内容来自当时整个工作树，不是调用方传入 units；需要明确持久化请求身份如何绑定原捕获凭据和提交内容，不能简单移一个 if 就绕过语义校验。保留 branch ABA 防护，不自动读取新 revision 重试，不人工回填已清空的条目。

补原请求重放、失败提交后重试、相同 token 不同 message/author、后来已有新草稿、分支切换/同名重建，以及 commits$ 只发一次的真实后端测试。

## 解决记录

- [x] 两个真实 SQL 后端确认；共享失败断言保留；业务实现未修改。
- [ ] 修复公开门面与持久化请求身份的判定顺序，保留 CAS 和 ABA 拒绝契约。
- [ ] 六个宿主及三框架封装补证；当前仍 Open。
