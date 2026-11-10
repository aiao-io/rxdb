---
id: RV-01a1bba1e7087f52b39ab7cbeb2fb6eb
title: 'JS 统计合并遗漏普通代码行导致作者与项目代码统计归零'
project: '@aiao/source'
branch: 'refs/heads/codex/full-review-main-20261108'
range: project
base_ref: null
review_scopes: []
scope_id: 'project:@aiao/source'
status: Resolved
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: 'refs/heads/codex/full-review-main-20261108'
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-09
anchors:
  - 'scripts/git-stats.mjs#mergeProjectStats'
affected_projects: []
related_findings: []
pr: null
---

# RV-01a1bba1e7087f52b39ab7cbeb2fb6eb：JS 统计合并遗漏普通代码行导致作者与项目代码统计归零

## 问题与影响

当 worker 的统计结果含普通生产代码行时，主线程合并只累加测试、注释和文档，`authorLines` 始终保持空对象。项目和作者 Code 列以及总行数、占比因此丢掉全部生产代码。隔离输入即能证明合并函数违反累加契约；属于开发统计工具错误，定为 P2。

## 证据与根因

`scripts/git-stats.mjs:103` 初始化 `authorLines: {}`，`:110` 至 `:117` 只合并另外三个桶，`:122` 直接返回。`:291` 和 `:380` 消费该空桶计算项目/作者代码数。`scripts/git-stats-worker.mjs:159` 确实把普通代码累加到 `authorLines`，因此不是上游无代码。冻结 SHA：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

复现导入实际 worker 的 `parseBlameOutput`，为两个普通 TS 文件各解析一行 Alice 的代码，再从原脚本提取未修改的 `mergeProjectStats`。输入两个桶均为 Alice:1，合并 authorLines={}、代码数0，期望 Alice:2。本组 `repro-git-stats-merge-003.json` 保存输入、结果。没有运行全仓 blame，也不把此函数级验证描述成完整 CLI 成功运行。

## 修复方向

与另外三个桶一样按作者累加 `authorLines`，使用真实 worker 结果覆盖多批次合并，并核对项目、作者和 Rust 版的总数。

## 处理记录

### EV-01a1bba1e72f725fa6688ab670ed3f12：发现

- 时间：2026-11-08T22:49:56.102275+08:00
- 操作：review/full
- 执行者：ai；provider=unknown、model=unknown、version=unknown、session=unknown
- 输入快照：0ffa3c419fcc59dc3e13d695ca4658116134bfa0
- 输出快照：0ffa3c419fcc59dc3e13d695ca4658116134bfa0
- 状态：未登记 → Open
- 结论：当 worker 的统计结果含普通生产代码行时，主线程合并只累加测试、注释和文档，`authorLines` 始终保持空对象。项目和作者 Code 列以及总行数、占比因此丢掉全部生产代码。隔离输入即能证明合并函数违反累加契约；属于开发统计工具错误，定为 P2。
- 验证：Node 调用真实 parser + 未修改合并函数；确认2行→0行；未跑全仓统计。
- 剩余事项：按修复方向处理后复核；本轮未修代码。

### EV-01a1c049332f7754a9b091fbb4b75a49：修复

- 时间：2026-11-09T20:38:20+08:00
- 操作：fix
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G02）
- 输入快照：`1b5fb4e43f449bace1d6f67df78e55a129863f50`（提交视图，修复起点）
- 输出快照：工作区树 `195d0bed3c7a4a60e1aa5cbf32985a255d7ad793`（`ai-review snapshot --worktree`，基于 788c4baf（外部自动提交，含各组 WIP））
- 状态：Open → Fixed
- 结论：成立，维持 P2。`scripts/git-stats.mjs:96-123`（快照 `1b5fb4e4`）合并 worker 结果时只累加测试、注释、文档三个桶，`authorLines` 恒为空对象，而 `scripts/git-stats-worker.mjs:160` 确实把普通代码记进 `authorLines`，项目与作者的 Code 列、总行数与占比因此整列归零。Rust 版（`scripts/git-stats-rs/src` 的 `merge`）四个桶都合并，不受影响。
- 改动：四个桶统一按作者累加（`STAT_BUCKETS` + `addAuthorCounts`）；`mergeProjectStats` 导出供测试，CLI 入口加 `import.meta.url === argv[1]` 守卫，导入模块不再触发全仓 blame。
- 验证：新增 `scripts/git-stats.spec.mjs`：用真实 worker 的 `parseBlameOutput` 为两个普通 TS 文件各解析一行 Alice 的代码，再与另一批测试 / 注释 / 文档计数一起合并。修复前红（`authorLines: {}`），修复后绿。eslint 通过。
- 剩余事项：无，复核见下一事件。

### EV-01a1c04933747976befd63d35e58c7e0：复核

- 时间：2026-11-09T20:38:20+08:00
- 操作：verify
- 执行者：ai；anthropic/claude-opus-5-5；会话 aa117580-681a-4540-85b2-3c61967b2092（Claude Code 并行子 agent G02，复核角色）
- 输入快照：工作区树 `195d0bed3c7a4a60e1aa5cbf32985a255d7ad793`
- 输出快照：工作区树 `2ee1675ff7a5a9cb1c447ed42e01dafa8c0858da`（基于 788c4baf（外部自动提交，含各组 WIP），复核未改代码）
- 状态：Fixed → Resolved
- 结论：合并对四个桶同口径累加，`printStats` 读取的 `authorLines` 不再为空（项目 Code 合计与作者 code 列都从它取）。合并契约以真实 worker 解析结果验证，本条所述缺陷已不存在。
- 验证：`node --test scripts/git-stats.spec.mjs` 1/1（与本组其余 spec 合跑 47/47）；`@aiao/source:test-scripts` 575/576（唯一失败与本条无关）；`@aiao/source:lint` 通过。
- 剩余事项：在临时小仓库里端到端跑 CLI 时发现另一个独立缺陷：`scripts/git-stats.mjs:137-138`（快照 `1b5fb4e4` 同样如此）的 `renderProgressBar` 引用未定义的 `barLength` / `filledLength`，第一批 worker 回报进度时即 `ReferenceError` 退出，CLI 走不到合并与打印。根因不同，未在本条修改，已作为新线索交主会话（建议另立 RV）。
