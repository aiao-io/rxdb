---
id: RV-01a21194e68f7aacb5782c196d2ea870
title: '状态查询的分区分支没有逐分区的错误处理，撤销分区的竞态下 checkRepositoryUpdates 整体抛错'
project: 'rxdb-plugin-sync'
status: Fixed
severity: 'P3'
anchors: ['packages/rxdb-plugin-sync/src/check-repository-updates.ts#checkRepositoryUpdates']
affected_projects: ['rxdb-adapter-supabase']
related_findings: []
found_on_branch: 'refs/heads/supabase-log-access-baseline'
found_view: commit
found_snapshot: 'b739b164a7dec9093c2e27c124563fd99a250400'
found_range: project
found_base: null
created: 2026-11-25
updated: 2026-11-25
pr: null
---

# RV-01a21194e68f7aacb5782c196d2ea870：状态查询的分区分支没有逐分区的错误处理，撤销分区的竞态下 checkRepositoryUpdates 整体抛错

## 问题与影响

（2026-11-25 复核收窄了范围，见 `EV-01a21224d49d7cab938151060d42f01b`。原记录的主体「新客户端先于服务端 SQL 升级时 `pull()` 整轮抛错」
是迁移文档写明的升级顺序约束，触发前提不成立，不在本记录范围。）

`checkRepositoryUpdates` 的分区分支先 `getCallerBuckets()`，再对每个分区调 `getBucketSnapshotPoint()`；服务端在分区不在 `rxdb_caller_buckets()` 里时报 `42501`。
两次调用之间某个分区被撤销，整个状态查询 reject，而不是像拉取那样按分区记失败、其他分区照常。

定 P3：只在撤销分区与状态查询交错的瞬间触发，是一次性 Promise 的 reject，下一次查询即恢复，不涉及数据；
不定 P2：没有吞错、也没有给出错误的计数，只是与拉取的逐分区降级口径不对称。

## 证据与根因

快照 `45114a4aa36d2649ce281855e4beac56c6d7000c`（与发现快照 `b739b164` 相同）：

- `packages/rxdb-plugin-sync/src/check-repository-updates.ts:145-158`：`getCallerBuckets()` 之后逐个 `getBucketSnapshotPoint()`，循环里没有错误处理。
- `docker/sql/02-rxdb-sync-functions.sql:408-411`：`rxdb_bucket_snapshot_point` 在分区不属于调用者时 `RAISE ... insufficient_privilege`（42501）。
- 对照 `packages/rxdb-plugin-sync/src/bucketed-pull.ts:146-174`：拉取对每个分区 try/catch，失败记进 `failures`、`hasMore = true`，其他分区照常推进。
- 触发：状态查询 `getCallerBuckets()` 返回 `[p, q]` → 此时 q 被撤销 → `getBucketSnapshotPoint(q)` 抛 42501 → 整个 `checkRepositoryUpdates` reject。

## 修复方向

状态查询的分区循环按分区处理 `42501`：跳过已撤销的分区（下一次拉取会清掉它的本地范围），与拉取同口径；其他错误照常抛出。
可选：把 PGRST202 映射成带升级提示的 `SupabaseConfigError`（比照 US-038 的能力门控），让「先升级了客户端」的报错直接指向迁移文档。

不采用原方向「第一次 404 就把实体标记为非分区并缓存」：PGRST202 不只出现在旧服务端，PostgREST 的 schema cache 没刷新时同样返回；
那时服务端已有分区实体，按非分区去拉只读 `bucket IS NULL` 的日志（`docker/sql/02-rxdb-sync-functions.sql:733`），会静默拉空并被缓存，违反「不加 fallback 兜底」。

## 处理记录

### EV-01a21194e79f72a0950530f368080520：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：部分修复。源头是 2026-11-23 深度评审（随 WIP 提交删除）的第 4 条——「sync 关闭的实体不再被探测」已落实、逐仓失败会结构化进 failures；
  残留为旧服务端 404 令 `pull()` 整轮抛错、状态查询分区分支无错误处理。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `pull.ts:87-107` 与 `check-repository-updates.ts:127-173` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 排期；与迁移文档「升级顺序」口径一起核对。

### EV-01a211cfe2557e71978623d5e59b5532：复核（方案层，2026-11-25 批次 8/9 授权后）

- 时间：2026-11-25T16:26:06+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`0c53cb30dc05a53483e1a5f8a9f647d82f4029d7`
- 输出快照：同输入（只写评审记录）
- 状态：Open（不变）
- 结论：本记录锚点（`pull.ts#findBucketedRepositories`、`check-repository-updates.ts#checkRepositoryUpdates`）仍无故事认领。
  本轮方案更新出现同构新敞口：US-229 新增读历史 RPC 与适配器读取方法，全文未定义旧服务端（未跑升级 SQL）下的能力门控或错误处理；
  对照 US-038 已为自己的新参数建立完整模式（能力标志 + PGRST202 → `SupabaseConfigError`，`US-038:86`、`:139`），US-229 实现时应比照。
  US-226 立项池仍挂「先定旧服务端处理方式」，滚动升级窗口风险延续。
- 验证：文档评审工作流 wf_9f752545-f43（3 读者 + 1 评审）交叉核对，主会话复核 US-229 全文与 US-038 门控段落；未运行测试，结论基于静态证据。
- 剩余事项：原修复方向不变；新增——US-229 落地时沿用 US-038 的门控模式，或把本记录范围扩展到新 RPC。

### EV-01a21224d49d7cab938151060d42f01b：复核（收窄范围与定级）

- 时间：2026-11-25T18:02:16+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`45114a4aa36d2649ce281855e4beac56c6d7000c`
- 输出快照：同输入（只改评审记录）
- 状态：Open（不变）；定级 P1 → P3
- 结论：主体不成立，子项成立；已改写标题、锚点与正文：
  - 「新客户端对旧服务端 `pull()` 整轮抛错」是迁移文档写明的升级顺序：`website/docs/migration/supabase-sync-access.md:27`「先让应用以已登录身份同步，再更新服务端 SQL，最后升级客户端」，`:99` 原文「新客户端要用新版 SQL 的按区函数，必须在第 2 步之后升级：先升级客户端，拉取会报 `Could not find the function public.rxdb_entity_sync_info`」。与 `rxdb_backend_id` 那次同一个约定：新客户端在旧服务端上响亮报错。触发前提不成立；
  - 原修复方向不采用：PGRST202 也出现在 PostgREST schema cache 没刷新时，那时服务端已有分区实体，按非分区拉只读 `bucket IS NULL` 的日志（`docker/sql/02-rxdb-sync-functions.sql:733`），会静默拉空并被缓存，正是「不加 fallback 兜底」要防的；
  - 子项成立：`checkRepositoryUpdates` 的分区分支逐分区没有错误处理，撤销分区的竞态下整体 reject，与拉取的逐分区降级（`packages/rxdb-plugin-sync/src/bucketed-pull.ts:146-174`）不对称。它是一次性 Promise、下一次查询即恢复，定 P3；
  - 上一事件提到的 US-229 新 RPC 门控：比照 US-038 的「能力标志 + PGRST202 → `SupabaseConfigError`」是合理建议，属 US-229 的设计范围，不并入本记录。
- 验证：静态阅读上述行号；对照 `git show main:docker/sql/02-rxdb-sync-functions.sql` 与 `04`：`rxdb_pull_changes`、`rxdb_mutations` 在 main 上签名相同，旧服务端只缺分区那批函数；`rxdb_server_version()`（`docker/sql/04-rxdb-utils-functions.sql:1413-1421`）返回的是 PostgreSQL 版本，不是 RxDB SQL 版本。
- 剩余事项：按「修复方向」处理逐分区的 42501（P3，排期）；PGRST202 → 配置错误的映射可选。

### EV-01a212fb69747a2f942db42d9e1b116a：修复

- 时间：2026-11-25T21:53:16+0800
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`2b12192f5f7ad2bc9004f90014a9f2de7ee01b4f`（提交视图；`checkRepositoryUpdates` 与收窄范围时的快照 `45114a4a` 相同）
- 输出快照：工作区树 `10dff253d738defe79f10c55809862563ff88081`（`ai-review snapshot --worktree`，基于 `2b12192f`）；本记录不在该树内。
- 状态：Open → Fixed
- 结论：按收窄后的「修复方向」修。不按错误码猜是不是撤销：插件对适配器无关，`42501` 是参考 SQL 的错误码；改为问快照点失败之后重读一次可读分区，确实不在了才跳过，与拉取逐分区记失败的口径一致。还在列表里或重读本身也失败，原样抛出原来的错误，网络与配置错误不被当成撤销吞掉。可选的 PGRST202 → `SupabaseConfigError` 映射没有做：迁移文档 `website/docs/migration/supabase-sync-access.md:99` 已写明先升级客户端时的报错原文，改报错类型要连文档一起改，留给需要时。
- 改动：
  - `packages/rxdb-plugin-sync/src/check-repository-updates.ts:220` 新增 `snapshotPointUnlessRevoked()`；分区循环（`:160-165`）改用它，返回 `undefined` 的分区跳过、不计入待拉数与本地游标；
  - `packages/rxdb-plugin-sync/src/scoped-sync.ts` 的 `ScopedSyncAdapter.getBucketSnapshotPoint` 补 `@throws`：分区此刻已不属于调用者时抛错，状态查询据重读可读分区判定撤销。
- 验证（Node 26，均 `--skip-nx-cache`）：
  - 修复前红：`pnpm nx test rxdb-plugin-sync -- src/__tests__/check-repository-updates.spec.ts --coverage.enabled=false`，新增「问快照点时分区已被撤销」下的「重读可读分区确认它已不在：跳过它，其他分区照常计数」失败（整个查询 reject）；两条守卫「分区仍在可读列表里却失败：原样抛出，不当作撤销吞掉」「重读可读分区也失败：确认不了撤销，抛原来那个错误」为绿；
  - 修复后：同文件 18 条通过；`pnpm nx test rxdb-plugin-sync` 39 个文件 622 条通过（覆盖率 93.9 / 86.9 / 94.57 / 95.21）；`pnpm nx run-many -t lint typecheck --projects=rxdb-plugin-sync,rxdb-adapter-supabase --parallel=1` 通过；改动文件 prettier 通过。
- 剩余事项：复核（verify）。
