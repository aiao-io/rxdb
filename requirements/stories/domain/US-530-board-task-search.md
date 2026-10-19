---
id: US-530
title: 看板任务搜索：FTS 接线
status: Backlog
priority: Low
epic: epic-010-task-board-domain-model
created: 2026-10-19
updated: 2026-10-19
tags: [domain, board, search]
---

# 用户故事：看板任务搜索：FTS 接线

## 作为/我想要/以便

**作为** 单人看板用户
**我想要** 在板里按关键词搜任务，从结果直接跳到卡片所在列
**以便** 几十列、几百张卡片里立刻找到那张「改过的 bug」

## 范围边界

### In Scope

- **板内搜索**：按关键词搜当前板全部任务的标题与描述（FTS5 on SQLite / tsvector on PGlite，
  能力已由 [US-702](../future/US-702-full-text-search.md) / [US-703](../future/US-703-pglite-full-text-search.md)
  交付，本故事纯接线）
- **结果与定位**：结果列表显示命中任务的标题、所在列与匹配片段；点结果跳到该卡片（滚动到
  所在列并高亮）
- **接线形态**：三端 `useSearch()`（US-702 已交付三端绑定：debounced query + `switchMap` 取消 +
  scope filter），看板只提供实体与搜索字段配置
- **边界如实声明**：adapter 缺失 FTS 能力时构造期 fail-fast（`SearchUnsupportedAdapterError`，
  US-702 已交付行为）；中文分词按 FTS5 unicode61 / PGlite 默认配置的既有边界，不做中文分词
  优化（见技术笔记）

### Out of Scope

- 跨板全局搜索（单人 MVP 是板内搜索；多板全局搜索随团队版 US-533 再评估）
- 标签 / 截止日作为搜索条件（首版只搜文本；结构化筛选走 rxdb-model 查询构建器，不属本故事）
- 附件内容搜索、语义搜索、中文分词优化
- 搜索高亮的完整方案（结果列表给匹配片段即可，卡片内高亮不承诺）

## 验收标准

| #   | 前置条件                                  | 操作       | 预期结果                                                              | 状态 |
| --- | ----------------------------------------- | ---------- | --------------------------------------------------------------------- | ---- |
| 1   | 板 B 有任务「修复登录 bug」「写发布说明」 | 搜「bug」  | 命中「修复登录 bug」，显示其所在列与匹配片段；未命中的不出现          | ⬜   |
| 2   | 任务描述含「回归测试」，标题不含          | 搜「回归」 | 描述命中（标题 + 描述都进索引）                                       | ⬜   |
| 3   | 无匹配关键词                              | 搜「zzzz」 | 空结果，界面显示「无匹配」而非报错                                    | ⬜   |
| 4   | 命中的任务在屏幕外的列                    | 点搜索结果 | 滚动到该任务所在列并高亮卡片                                          | ⬜   |
| 5   | 后端无 FTS 能力（如小程序档或未装插件）   | 打开搜索   | 构造期 fail-fast 或入口如实禁用，不静默降级成线性扫描（US-702 语义）  | ⬜   |
| 6   | 搜索「修复」后新建任务「修复样式」        | 观察结果   | 活查询语义：新任务自动进入结果（US-702 反应式管线，本故事接线不破坏） | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**这是 epic-010 里唯一一条「纯接线、零新抽象」的故事**（与 [US-532](US-532-board-end-to-end-demo.md)
同型）：US-702（✅ Done）已交付 FTS5 安装器、查询编译器、`SearchUnsupportedAdapterError`
fail-fast 与三端 `useSearch()` 反应式管线；US-703（✅ Done）交付 PGlite tsvector。看板侧要做
的只有：声明 task 的标题 / 描述进索引、提供板级 scope、把结果条目接到「跳转到卡片」的产品
交互。它的交付顺序独立后置（epic 首轮切片表「后续」），不挡首轮闭环。

**中文分词的边界如实写，不做优化。** FTS5 的 unicode61 分词器与 PGlite 默认配置对中文的
切分粒度都不适合做「高质量中文搜索」的承诺。本故事按「关键词子串 / 词元命中即返回」的既有
边界交付（US-702 语义），不引入结巴类分词——那是搜索质量项目，不是看板接线，也不写「支持
中文全文搜索」这类会误导接入者的措辞。

**板内 scope 与跨板全局搜索。** 单人 MVP 的搜索范围是「当前板」。跨板全局搜索需要一个
跨实体的 scope 与结果聚合，与团队版的账户 / 工作区概念纠缠，放到 US-533 再评估；本故事
不预埋全局搜索接口。

**关闭条件**：标题 / 描述可搜；结果带所在列与片段；点结果可定位；活查询语义不被破坏；
无 FTS 能力的组合如实失败。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-task-board-domain-model.md#价值待证整个-epic)
解锁（2026-10-19，owner 决定）：本故事不新增抽象（引擎能力已由 US-702 / US-703 交付），
「病灶数 ≥ 抽象数」按 owner 决定豁免（演示价值入场），依据与边界见 epic。

## 实现文件

- `packages/rxdb-plugin-board/` — 待建；task 搜索字段声明与板级 scope

## References

- [epic-010 任务看板领域模型](../../epics/epic-010-task-board-domain-model.md)
- [US-702 全文搜索](../future/US-702-full-text-search.md) — 前置：FTS5、`SearchUnsupportedAdapterError`、三端 `useSearch()`
- [US-703 PGlite 全文搜索](../future/US-703-pglite-full-text-search.md) — 前置：tsvector
- [US-526 看板领域模型骨架](US-526-board-column-task-skeleton.md) — 前置：task 实体
- [US-531 三框架看板视图与交互](US-531-board-tri-framework-ui.md) — 搜索框交互
