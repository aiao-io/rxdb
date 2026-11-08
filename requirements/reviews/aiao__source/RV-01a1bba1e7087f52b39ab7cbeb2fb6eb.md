---
id: RV-01a1bba1e7087f52b39ab7cbeb2fb6eb
title: 'JS 统计合并遗漏普通代码行导致作者与项目代码统计归零'
project: '@aiao/source'
branch: 'refs/heads/codex/full-review-main-20261108'
range: project
base_ref: null
review_scopes: []
scope_id: 'project:@aiao/source'
status: Open
severity: P2
source_view: commit
source_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
base_sha: null
found_branch: 'refs/heads/codex/full-review-main-20261108'
found_snapshot: '0ffa3c419fcc59dc3e13d695ca4658116134bfa0'
found_range: project
created: 2026-11-08
updated: 2026-11-08
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
