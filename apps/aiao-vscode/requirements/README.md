# Aiao VSCode 需求管理

这里维护 aiao-vscode（浏览器开发工作台应用）的用户故事、研究报告与状态。当前状态、未完成 AC 与关闭条件见[状态概览](status-overview.md)，接下来做什么见[路线图](roadmap.md)。

本应用承接仓库 `requirements/` 里登记的 US-404 手工开发工作台切片；需求原文迁移到本目录的 `stories/`，仓库级 `requirements/` 不再重复维护这条故事，两边通过链接关联。底层编辑器（US-402）、Git + OPFS 研究与 RxDB 能力仍归仓库 `requirements/` 管理，本应用只负责组合与验收。

## 目录结构

| 文件                                     | 回答的问题                                                    |
| ---------------------------------------- | ------------------------------------------------------------- |
| [status-overview.md](status-overview.md) | 每条故事**现在是什么状态**、哪些在做、哪些卡住                |
| [roadmap.md](roadmap.md)                 | **接下来做什么**、什么必须排在什么前面                        |
| [vivari-comparison-research.md](vivari-comparison-research.md) | Vivari 与本工作台的功能、实现差异、可借鉴设计和验证边界 |
| [vscode-extension-compatibility-research.md](vscode-extension-compatibility-research.md) | VS Code 插件兼容路线、保留 CodeMirror 的适配成本与验证范围 |
| [stories/](stories/)                     | 用户故事与可行性研究（含 `story.template.md`）                |
| [../benchmarks/](../benchmarks/)         | 验收证据：导出 / Git / 离线 / 保存 / SCM / 键盘的验证报告快照 |

## 状态定义

沿用仓库 `requirements/CONVENTIONS.md` 的状态集合（story 五态：`Backlog` / `In Progress` / `In Review` / `Done` / `Blocked`），真相源为故事 YAML 的 `status` 字段，本目录的派生视图不独立维护。
