---
id: RV-01a21194e6b6742e98c9d90c0a3e6270
title: '分桶快照循环不受 fetchAll 与中断约束，limit=0 会死循环'
project: 'rxdb-plugin-sync'
status: Fixed
severity: 'P2'
anchors: ['packages/rxdb-plugin-sync/src/bucketed-pull.ts#pullBucketScope']
affected_projects: []
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

# RV-01a21194e6b6742e98c9d90c0a3e6270：分桶快照循环不受 fetchAll 与中断约束，limit=0 会死循环

## 问题与影响

`pullBucketScope` 的快照循环 `while (!progress.snapshotComplete)` 只以「本页行数 < limit」为退出条件，完全不读 `options.fetchAll`，
也没有任何 AbortSignal/取消通道。对照同一文件的增量循环有 `while (hasMore && options.fetchAll)` 约束（`:349`），两侧不对称：
`fetchAll=false` 时大分区仍会翻页直到整个快照读完（快照可能比增量大几个数量级），拉取期间无法协作中断。
边界条件：`limit=0` 时 `rows.length < 0` 恒假，快照页永远「不完整」，死循环（公开 API 未挡 0）。

定 P2：大分区首拉的资源与响应性问题、公开参数边界死循环；不丢数据，不定 P1。

## 证据与根因

快照 `b739b164a7dec9093c2e27c124563fd99a250400`：

- `packages/rxdb-plugin-sync/src/bucketed-pull.ts:278-294`：`while (!progress.snapshotComplete)`；`:290` `const snapshotComplete = rows.length < (options.limit ?? 1000);`——唯一正常退出条件。
- `packages/rxdb-plugin-sync/src/bucketed-pull.ts:349`：增量循环 `while (hasMore && options.fetchAll)` 的对照。
- `packages/rxdb/src/sync-contract/VersionManager.interface.ts:155-186`：`PullOptions` / `PullRepositoryOptions` 无 signal/abort 字段。
- 触发：`fetchAll=false` + 2 万行分区首拉 → 仍翻完 20 页；`limit=0` → 死循环。

## 修复方向

快照循环与增量同口径地受 `fetchAll` 约束（或提供取消通道），`limit` 入参校验 ≥ 1；
大分区下把快照拆成多轮同步返回，让调用方能推进进度与中断。

## 处理记录

### EV-01a211955e9f7a4192fe37de279bfd5d：发现

- 时间：2026-11-25T15:19:59+0800
- 操作：review/independent
- 执行者：ai；anthropic/claude-fable-5；会话 5812bc94-4aee-477d-b7b0-036b9c8fbed8
- 输入快照：`b739b164a7dec9093c2e27c124563fd99a250400`
- 输出快照：同输入
- 状态：未登记 → Open
- 结论：成立。快照循环不受 fetchAll/中断约束，与增量不对称；limit=0 死循环边界存在。
- 验证：4 个独立验证 agent 在 HEAD 上对抗性核对（工作流 wf_fbd47c66-d14），主会话对 `bucketed-pull.ts:276-296` 做行级复核；未运行测试与真栈回归，结论基于静态证据。
- 剩余事项：owner 决定中断语义（fetchAll 对齐 vs 取消通道）。

### EV-01a21224d400724e88d6d117cb7421a3：修复

- 时间：2026-11-25T18:02:16+0800
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 8b131c28-0801-4140-925f-c944249ee3cf
- 输入快照：`45114a4aa36d2649ce281855e4beac56c6d7000c`（提交视图；相关代码与发现快照 `b739b164` 相同）
- 输出快照：工作区树 `00a3a6eab9aa449d8b213f7ee822858bc8048fab`（`ai-review snapshot --worktree`，基于 `b1fcba9b`：会话中途外部以「123123」提交了大部分改动）；本记录不在该树内。
- 状态：Open → Fixed
- 结论：两处都成立，第一处比原描述更普遍：非分区路径的 `fetchAll` 默认就是 `false`（`packages/rxdb-plugin-sync/src/pull-repository.ts:116`，`pull-batch.ts:71`「默认只拉一轮并用 `hasMore` 告知还有剩余」，核心契约 `PullOptions.fetchAll` 同样 `@default false`），所以按默认参数调 `pull()` / `pullRepository()` 首拉大分区就会一次翻完整个快照，不只是显式传 `false` 时。`limit ≤ 0` 的死循环只在快照循环：非分区单仓遇空页 `break`，批量路径有 `pulled === 0` 收手与轮数上限；但批量路径在 `limit = 0` 时一条不拉就报 `hasMore: false`（「已全部同步」），同样不对，所以校验放在两个公开入口。没有加取消通道：快照按 `fetchAll` 一页一停之后单次调用已有上界，与增量、非分区路径同口径。
- 改动：
  - `packages/rxdb-plugin-sync/src/bucketed-pull.ts:308`：快照页落库之后，没拉完且没要 `fetchAll` 就带 `hasMore: true` 返回；进度（`snapshotAfterId`）随这一页落库，下一次从这页最后一个 id 接着拉，快照拉完才进增量。没有用「空页即完成」兜底：那会把快照判完整、触发清理删掉本地行；
  - `packages/rxdb-plugin-sync/src/sync-manager.utils.ts:87` 新增 `assertPullLimit()`，`pull.ts:43`、`pull-repository.ts:150` 在派发开始事件之前调用：`limit` 不是正整数（0、负数、小数、NaN、Infinity）抛 `RxDBError`，一个请求都不发；不传或显式 `undefined` 用默认值；
  - 核心契约 `packages/rxdb/src/sync-contract/VersionManager.interface.ts` 的 `PullOptions` / `PullRepositoryOptions`：`limit` 写明必须是正整数，`fetchAll` 写明分区实体每个分区各拉一页、按区快照同样一页一停。
- 验证（Node 26，均 `--skip-nx-cache`）：
  - 修复前红：`pnpm nx test rxdb-plugin-sync -- src/__tests__/bucketed-pull.spec.ts src/__tests__/pull-repository.spec.ts src/__tests__/pull.spec.ts --coverage.enabled=false`，新增 10 条全部失败：`bucketed-pull.spec.ts`「没要 fetchAll 时快照一页一停…」第一次调用拉了 4 条、报 `hasMore: false`；`pull-repository.spec.ts`「limit = 0 / -1 / 1.5 / NaN / Infinity」5 条与 `pull.spec.ts`「limit = 0 / -1 / 1.5 / NaN」4 条都 resolve 而非 reject；守卫用例「不传 limit（含显式 undefined）：按默认值拉取」为绿；
  - 修复后：同命令 3 个文件 62 条通过；`pnpm nx run-many -t test --projects=rxdb,rxdb-plugin-sync --parallel=1`：rxdb 180 个文件 2923 条通过、1 条跳过（覆盖率 95.88 / 92.68 / 96.14 / 96.55），rxdb-plugin-sync 39 个文件 619 条通过（覆盖率 93.87 / 86.85 / 94.52 / 95.19）；`pnpm nx run-many -t lint typecheck --projects=rxdb,rxdb-plugin-sync,rxdb-adapter-supabase --parallel=1` 通过（lint `--max-warnings=0`）；`node scripts/audit/api-surface.mjs --check` 63 个包表面无变化、命名合规；改动文件 prettier 通过；
  - 未跑：`rxdb-adapter-supabase` 真栈测试（共享栈会清空 dev demo 数据）与 `pnpm test-all`。静态排查：真栈用例里没有以小于数据量的 `limit` 且不带 `fetchAll` 拉分区实体的调用，demo 的分区面板本就传 `fetchAll: true`（`apps/dev-rxdb-supabase/src/app/catalog/catalog-synced-panel.ts:131`）。
- 剩余事项：复核（verify）。
