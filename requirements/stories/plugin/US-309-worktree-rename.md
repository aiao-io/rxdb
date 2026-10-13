---
id: US-309
title: 工作树插件改名 rxdb-plugin-worktree
status: Done
priority: Medium
epic: epic-007-public-api-gates
created: 2026-10-13
updated: 2026-10-13
tags: [plugin, rename, public-api, worktree]
---

<!--
INVEST 检查清单:
- [x] Independent (独立): 纯机械改名，不依赖后续 worktree 能力（US-310）
- [x] Negotiable (可协商): 改名范围已与 owner 确认（包名+公开符号全改）
- [x] Valuable (有价值): 趁旧包名未发布，收敛命名避免「包叫 worktree、符号叫 WorkingTree」的永久分裂
- [x] Estimable (可估算): 机械面 + 验证，一次性完成
- [x] Small (小): 一个提交组
- [x] Testable (测试): AC 即 grep 白名单 + 门禁全绿
-->

# 用户故事：工作树插件改名 rxdb-plugin-worktree

## 作为/我想要/以便

**作为** 插件维护者
**我想要** 把 `rxdb-plugin-working-tree` 改名为 `rxdb-plugin-worktree`，公开符号同步改为 `Worktree*`
**以便** 包名与公开 API 与即将新增的 git worktree 能力（US-310）同词，且赶在旧包名首次发布前完成，不产生 registry 包袱

## 范围边界

### In Scope

- 4 个包改名：`@aiao/rxdb-plugin-working-tree{,-angular,-react,-vue}` → `@aiao/rxdb-plugin-worktree{,-angular,-react,-vue}`（package.json / project.json / 目录 / tsconfig paths / vite 配置 / nx 依赖）
- 公开符号全改：`useWorkingTree`→`useWorktree`、`WorkingTreeResource`→`WorktreeResource`、`db.workingTree`→`db.worktree`、全部 `WorkingTree*` 类型/类→`Worktree*`、`rxDBPluginWorkingTree`→`rxDBPluginWorktree`、`WORKING_TREE_CAPABILITY_VERSION`→`WORKTREE_CAPABILITY_VERSION`、`/testing` 子路径的 conformance 套件与常量
- 消费者跟随：replay（import + 报错文案）、6 个适配器 conformance spec、benchmarks、三端 demo 与 e2e
- 产品面跟随：demo 路由 `/working-tree`→`/worktree`、菜单与页面文案、页面目录与文件、e2e spec 文件名与 localStorage 键
- 门禁跟随：api-baseline 4 文件改名并自更新、coverage-baseline 键、plan-test-lanes 键、suite-callsites / callsite-drift 硬编码路径、package-graph 事实
- 文档：迁移页 `website/docs/migration/worktree-rename.md` + sidebars/migration-README 登记、CHANGELOG、release-plan 口径
- demo 产品面：路由与菜单文案、e2e 文件名

### Out of Scope

- git worktree「命名工作上下文」能力本体（US-310）
- 核心 `@aiao/rxdb` 的捕获挂点改名（`WorkingTreeCaptureHook` / `setWorkingTreeCaptureHook` / `workingTreeRawWriteContext` 等）
- 插件内部目录 `src/working-tree/**`、实体类（`WorkingTreeState` 等）、表名、迁移名、能力名 `workingTree`

## 验收标准（AC）

| # | 场景 | 预期 |
| - | ---- | ---- |
| 1 | 全仓 grep `rxdb-plugin-working-tree` | 0 命中（生成物除外，锁文件由 `pnpm install` 重生成） |
| 2 | 全仓 grep `WorkingTree` / `workingTree` / `working-tree` | 仅白名单残留：能力值 `'workingTree'`、表名/迁移名、核心捕获挂点、`src/working-tree/` 内部路径、实体类名、历史文档引用（epic-006 及其 story、working-tree-split 迁移页） |
| 3 | 能力水位兼容 | `capability-identity.spec.ts` 断言 `PACKAGE_SPECIFIER === packageJson.name` 与水位行名 `__rxdb_capability__:workingTree:1:@aiao/rxdb-plugin-worktree` 通过；旧包名行与新包名行共存放行（守卫按能力名认领） |
| 4 | 改名包测试 | `rxdb-plugin-worktree` 与三个绑定包、replay、6 适配器、核心 rxdb 的 lint/test/typecheck 全绿 |
| 5 | demo 与 e2e | 三端 demo 单测全绿；三端 worktree.spec / a11y.spec e2e 全绿；angular 的 replay/failure-archive e2e 全绿 |
| 6 | API 基线 | `pnpm audit:api-surface` 通过；4 个基线文件改名且内容自更新（旧符号移除/新符号加入）随提交 |
| 7 | 审计门禁 | `audit:coverage`、`audit:suite-callsites`、`audit:callsite-drift`、`audit:package-graph` 全绿 |
| 8 | 迁移文档 | `website/docs/migration/worktree-rename.md` 含包名/符号映射表与「不改的东西」清单，migration/README 与 sidebars 登记，CHANGELOG 有 Unreleased 破坏性条目 |

## 技术笔记

- **能力水位行不构成拒连风险**：守卫认领判定只吃能力名（`packages/rxdb/src/system/capability-watermark.ts:127-142`），包名只是行内第三段提示信息。改名后旧库旧行（…:workingTree:1:旧包名）与新客户端写的新行并存、互相放行，双向打开均不被拒；改能力名才是守卫意义上的新能力（破坏性），因此 `WORKING_TREE_CAPABILITY = 'workingTree'` 冻结。
- **迁移名与表名是持久化元数据**：`0004-working-tree-commits` 迁移名、`rxdb_working_tree_*` 表名、`workingTreeRevision` 列名随库走，改名时不动。
- **受信登记表**：`trusted-write-intent.ts` 的 TRUSTED_CALLSITE_REGISTRY #10/#11 file 段随包路径改名，`audit:callsite-drift` 验证。
- **npm 处置**：旧包名从未发布（release-plan.md 开项 2），无 deprecate 对象；按仓内约定（desktop-split 先例）以迁移文档指路。
