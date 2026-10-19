---
id: RV-083
title: PR #122（重构 working tree）评审发现待修清单
status: Open # Open / Resolved
created: 2026-10-19
updated: 2026-10-19
pr: # 修复 PR 链接，Resolved 时填
---

# Review：PR #122（重构 working tree）评审发现待修清单

对 `claude/worktree-rename-contexts` @ `0c1cfee4` 的整分支评审（四个切片：核心库 / 六后端适配器 / 三端 demo / 需求工件一致性 + CI 证据与 PR 过程核对）。完整背景与逐条论证见 [worktree-rename-contexts-branch-review.md](worktree-rename-contexts-branch-review.md)，本记录只留尚未处理的条目。代码本体四个切片均无 P1；全部问题集中在 CI 门禁、需求工件自相矛盾与一批收尾项。

## 问题

### P0-1 CI 门禁红：`nx format:check` 失败，所有 lane 被跳过

- **证据**：PR #122 最新 run（head `0c1cfee4`，2026-10-17T21:37Z）`ci / setup` 的 `check-format` 列出 `benchmarks/reports/working-tree-ui-first-visible-angular.json` 后 exit 1；`ci / gate` FAILURE，lint / test / e2e 等 lane 全部 SKIPPED。复验：`gh run view --job 117510505362 --log-failed`。
- **现状**：该文件键序是 a11y e2e 的 `writeFile` 对象字面量序（`metric, framework, route, firstPhase, firstVisibleMs, recordedAt, note`），不符合 `.prettierrc` 里 `prettier-plugin-sort-json` 的字母序（`note` 应在 `recordedAt` 前）。main 上 checked-in 文件是字母序（CI 通过），即仓库已知噪音「e2e 每跑必改写该文件且键序过不了 prettier」的一次实弹。

### P1-1 `roadmap.md` 状态汇总表头与自身正文、status-overview 矛盾

- **证据**：`requirements/roadmap.md` 表头 `| 🚧 In Progress | 1 |`、`| **未完成合计** | **29** |`；同文件紧接正文写「仓库还剩 **30 条**未关闭故事（**2** In Progress + 6 In Review + 22 Backlog + 0 Blocked）」。`status-overview.md` 汇总为 2 In Progress（US-211 + US-314）、未完成 30（README.md 的 75/105 已同步）。

### P1-2 `status-overview.md`「阶段 4～5 尚无故事认领」与紧邻的 US-314 行矛盾

- **证据**：`requirements/status-overview.md` 新增行「多检出位（v1 之后）阶段 4～5 尚无故事认领」，其上数行刚写入 `🚧 US-314 … 是多检出位阶段 5`；epic-006 分期表明确「阶段 5 = US-314」，阶段 A 已随 #122 交付。

### P2-3 两条新插件系统表缺「既有库升级重开」回归测试（本仓库已知坑）

- **证据**：新增表 `rxdb_worktree`（`packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts`）与 `rxdb_commit_fork_point`（`packages/rxdb-plugin-working-tree/src/commit/commit-fork-point.entity.ts`）；`system-entity-registration.spec.ts` 断言贡献表 10→12 张；全包 grep `reopen|重开` 只命中同版本重开，没有「旧代码建库（无这两张表）→ 新代码重开 → 表补建、旧数据完好」的用例。
- **现状**：补建路径由核心 `RxDB.#ensureSystemTables` 覆盖（两表均 `log: false`，不触发「重建不存在表的触发器」旧坑），但该行为没有回归锁定。

### P2-11 启动回收 `take(1)`：页内重连后新孤儿不再回收

- **证据**：`packages/rxdb-plugin-working-tree/src/plugin.ts` 里 `adapterConnected$.pipe(filter(Boolean), take(1)).subscribe(() => void this.#pruneWorktrees())`；`bootstrapExisting` 每次连接都重新判定并置 `#reclaimPending`，但 `take(1)` 只消费第一次。同实例 disconnect→reconnect 后新判定的孤儿没有订阅消费，直到整页刷新或手动 `prune()`。影响是空间泄漏，非数据正确性。

### P2-13 OPFS 占用探针的 SecurityError 会盖掉重试用尽后的原始错误

- **证据**：`packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts` 里 `isOpfsAccessHandleBusy` 用 `file.createSyncAccessHandle()` 探测，非专用 Worker 上下文该方法直接抛 `SecurityError`——重试用尽后把最后一次 `SQLITE_CANTOPEN` 换成与原因无关的 `SecurityError`。

### P2 收尾批（一行到几行的小修，建议与上列问题同一批改掉）

- **P2-1**：tip 提交 `0c1cfee4` 引入的 US-314 阶段 A（三端 `CreateBranchDialog` + e2e）完全没进 PR 描述（`gh pr view 122 --json body` 中 `US-314` 与 `createBranchFromCommit` 出现次数均为 0），而 status-overview 声称其「与 #122 一起交付」。在 PR 描述补一节，或把该提交拆出本 PR。
- **P2-5**：`requirements/stories/collaboration/US-313-read-only-checkout.md` 实现文件清单仍写 demo「Open read-only」菜单，与同文件 Out of Scope / 设计决定 8（demo 不提供只读入口）及 demo 实际状态矛盾。
- **P2-6**：`website/docs/plugins/rxdb-plugin-working-tree/README.md` 顶部「十一张」系统表与底部「十二张」自相矛盾（源码为 12 张）。
- **P2-7**：`CHANGELOG.md` Unreleased 缺 US-314 阶段 A 条目（`createBranchFromCommit()` / `checkBranchFromCommit()` / `rxdb_commit_fork_point` 为新公开 API）。
- **P2-8**：`apps/dev-rxdb-angular` 残留死样式 `.gd-branch-create-popover`（`styles.scss`，React/Vue 已删）与 `branch-menu.component.ts` 的 `Trash2` 死导入（模板零引用）。
- **P2-9 / P2-10**：US-221 的 `db-open-contention` e2e 仅 React/Vue（Angular e2e 端口强制 IDB，理由已成文）、US-311 草稿缓存 e2e 仅 Angular——在 PR 描述注明单端覆盖即可，或补等价用例。
- **P2-4（可选加固）**：`compareBranches` / `previewMerge` 无跨后端一致性用例，可在任一 SQLite 系 + PGlite 各加一条真库冒烟。
- **P2-12（可选加固）**：`packages/rxdb-plugin-working-tree/src/working-tree/raw-write-judgment.ts` 的 `breaksReadOnly` 放行 `SELECT set_config('default_transaction_read_only','off',false)`（首词 `select` 不在写词表），PGlite 封印第三层对非事务路径可绕过。文档自认「防误写不防蓄意」，收紧成本一行。

## 根因

- P0-1：三端 `working-tree.a11y.spec.ts` 的 `writeFile` 键序与 `prettier-plugin-sort-json` 字母序不符（main 上就是这序），收尾时把 e2e 改写后的文件按写入序提交，未走「还原 + 只留格式化」惯例。
- P1-1 / P1-2：分支改状态汇总时只动了 In Review 与合计两格（In Progress 的 context 行没动）；新增「阶段认领」说明行时未与同文件 US-314 行交叉核对。
- P2-3：惯例「新增实体表必须有升级重开测试」未覆盖到插件贡献表这条路径。
- P2-11：`take(1)` 订阅在重连场景下不复位；P2-13：探针未区分「OPFS 不可用」与「句柄被占」。

## 修复方案

- **P0-1（推荐根治）**：把三端 a11y spec 的 `writeFile` 键序改成 sort-json 字母序（`note` 提到 `recordedAt` 前）并按该序提交文件——此后每次 e2e 改写都天然 prettier 合规。最小修复：仅把该文件还原到 main 的排序版本。修完重推 CI，等全部 lane（当前 tip 上从未跑过 lint / test / e2e）。
- **P1-1**：表头改为 `In Progress | 2`、`未完成合计 | 30`。
- **P1-2**：改为「阶段 4 尚无故事认领；阶段 5 是 US-314（阶段 A 已随 #122 交付，B/C 未开始）」。
- **P2-3**：补一条迁移类 spec：10 张表形态建库 → 重开 → 断言两新表存在、旧提交可读、`createBranchFromCommit` 对旧提交返回 `fork_point_unknown`（实体 TSDoc 已声明该语义）。
- **P2-11**：去掉 `take(1)`（内部 pending 标志已防重复），或断开时重置订阅。
- **P2-13**：探针把 `SecurityError` 归入 `return false`（原样抛出最后一次 CANTOPEN），或至少在 JSDoc 注明。
- **P2 收尾批**：按上文逐条改；P2-4 / P2-12 可合入亦可单列。

## 随修复一起确认（owner 决策项，非代码缺陷）

1. `preview_merge` 非事务读（TSDoc 已声明）：预览期间另有合并/切换落库，预览与随后落库可能不一致，业务上是否可接受。
2. 官方 sqlite（oo1 `OpfsDb`）与 sqliteai 的 OPFS 打开是否有与 US-221 同形的刷新竞态（US-221 只覆盖 OPFSCoopSyncVFS 双端），三端 demo 默认后端是否为这两个之一。
3. 措辞口径：epic-006 写只读检出位展示「文件的当前内容」，storage / working-tree 两份 README 写「打开那一刻」，以哪个为准。
4. `mergeBasePoint` 在「分叉点之后回滚 + 再分叉」边界无回归用例，冲突标注语义需补用例确认。

## 解决记录

- [ ] 开 PR 修复（`pr` 字段记录链接）
- [ ] PR 合并，`status: Resolved`
