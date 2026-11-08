---
id: RV-01a1bb2b32f07a8cb7f2def4d3a4d9e1
title: '工作区路径含空格时覆盖率合并 CLI 静默不执行'
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
  - 'scripts/merge-vitest-reports.mjs'
affected_projects: [rxdb-plugin-search, rxdb-plugin-storage]
related_findings: []
pr: null
---

# RV-01a1bb2b32f07a8cb7f2def4d3a4d9e1：工作区路径含空格时覆盖率合并 CLI 静默不执行

## 问题与影响

开发者把仓库放在带空格的绝对路径（例如目录名为 `rxdb workspace`）后运行 search/storage 的 test-browser，报告合并命令直接 exit 0；不读取输入，也不生成最终合并覆盖率和 JUnit。Node/browser 数据继续以未合并状态被后续工具读取。Windows 的盘符与反斜线路径同样无法与这里拼出的 URL 对齐。本次已直接复现 POSIX 空格路径，不依赖 Windows 环境推测，定为 P2。

## 证据与根因

证据快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`。

`scripts/merge-vitest-reports.mjs:144` 用文件 URL 与手工拼接的 `file://${process.argv[1]}` 判断主程序入口。import.meta.url 是编码后的 file URL，空格为 `%20`，process.argv[1] 是文件系统路径，字符串不相等，整个 CLI 分支被跳过。

将冻结版本的 merge-vitest-reports.mjs 与其 coverage-artifacts.mjs 依赖复制到本组 `repro-merge-cli space/`，以 Node 执行，参数明确指向不存在的两个输入目录。空格路径命令退出码为 0、stdout/stderr 均为空；直接执行原路径的同一份源码和参数则退出 1、报 ENOENT。这证明 CLI 在前一种情况下根本没有运行合并。

`packages/rxdb-plugin-search/project.json:28`、`packages/rxdb-plugin-storage/project.json:43` 通过 `node ../../scripts/merge-vitest-reports.mjs` 调用它，受仓库绝对路径影响。既有 spec 只 import 函数，没有启动 CLI 的回归。

## 修复方向

使用 `pathToFileURL(resolve(process.argv[1])).href` 等统一路径与 URL 的比较方式，和仓库其他 CLI 保持一致。补带空格路径启动 CLI 的成功产物测试与失败退出码测试，再在 Windows 验证入口。

## 处理记录

### EV-01a1bb2b331770d586e8b244254b23e3：发现

- 时间：2026-11-08T20:41:00.655224+08:00
- 操作：review/full
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`（仅新增评审记录）
- 状态：未登记 → Open
- 结论：已在独立输入上复现错误，见证据。
- 验证：Node 隔离复现，结果保存在本组 `repro-merge-results.json`；输入与输出在本组 repro 目录。既有脚本全套测试由主任务先前通过，本次没有重复执行重型验证。
- 剩余事项：补回归并按单问题 fix/verify 处理；本次不改源码。

### EV-01a1bb2da8b37959a2f02e3583ca4a5b：证据定位更正

- 时间：2026-11-08T20:41:56.266210+08:00
- 操作：review/full（仅校正证据定位）
- 执行者：ai；provider、model、version、session 均为 unknown
- 输入快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 输出快照：`0ffa3c419fcc59dc3e13d695ca4658116134bfa0`
- 状态：Open → Open
- 结论：核对 nl 输出，入口判断位于第 144 行；anchor 使用文件路径。复现与缺陷结论不变；原发现事件保留。
- 验证：两次 git hash-object 核对后写入；仅正文行号与 anchor 更正，无源码变动。
- 剩余事项：按前述修复方向处理。
