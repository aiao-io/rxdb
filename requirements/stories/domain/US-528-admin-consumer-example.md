---
id: US-528
title: 独立消费接入示例与接入成本记录
status: In Review
priority: Low
epic: epic-010-model-driven-admin-framework
created: 2026-10-19
updated: 2026-10-28
tags: [domain, admin-framework, docs, consumer-example]
---

# 用户故事：独立消费接入示例与接入成本记录

## 作为/我想要/以便

**作为** 评估本框架的开发者
**我想要** 一份不依赖工作台内部模块的最小独立消费示例，以及它新增了多少代码、依赖与样式
**以便** 判断「定义实体之后少写了多少 CRUD」是否成立

## 交付阶段

| 阶段 | 内容                                                                              | 状态 |
| ---- | --------------------------------------------------------------------------------- | ---- |
| A    | 最小独立消费应用：只用发布产物从零接线一个简单实体页（录入 / 编辑 / 筛选 / 重开） | ⚠️   |
| B    | 接入成本记录与独立重搭：新增代码行数、依赖清单、样式要求及复验入口                | ⚠️   |

阶段归属：A 关闭 AC#1；B 关闭 AC#2 / #3。

## 范围边界

### In Scope

- 独立应用只 import 发布包（`@aiao/rxdb*`、`@aiao/rxdb-model*`），不 import `apps/dev-rxdb-admin` 内部模块
- 应用跑通最小闭环：录入 / 编辑 / 筛选 / 刷新重开，作为「从零接入」的对照样本
- 成本记录回答三件事：新增多少代码（行数按文件列出）、加了哪些依赖、样式怎么接入
  （Tailwind + daisyUI 管线或无样式管线，二选一写清）

### Out of Scope

- 从 schema 自动生成整个应用源码（首版不承诺）
- 覆盖工作台全部功能的示例——只证明最小接入路径
- 市场推广材料

## 验收标准

| #   | 前置条件           | 操作                                           | 预期结果                                                                                             | 状态 |
| --- | ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | 发布 tarball 可用  | 在仓库外隔离安装发布产物，按示例搭建并运行     | 录入 / 编辑 / 筛选 / 刷新重开全部可用；依赖、样式与 WASM 资源完整，不使用 workspace 源码或工作台模块 | ⚠️   |
| 2   | 示例应用可运行     | 对照代码清单                                   | 文档列出新增代码行数、依赖清单与样式要求，读者可逐项复验                                             | ✅   |
| 3   | 文档与发布产物可用 | 由试用者按文档在隔离环境重搭，并记录步骤与问题 | 无需额外咨询即可完成 AC#1 的闭环；记录依赖、配置、时间和减少的手工接线，作为接入收益证据             | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

本故事是 [admin-framework 候选分析](../../domain-research/admin-framework.md) 首版边界第 5 条的落点，
也是成功信号（具名试用者独立完成录入 / 编辑 / 筛选 / 重开 / 备份 / 恢复）在仓库内的最小可复验形式。

示例应用放 `apps/dev-rxdb-admin-consumer`（独立最小工程，与工作台同仓库但零内部依赖），成本记录落
`website/docs/`（沿用 entity-model 文档的写法：代码示例取自真实可运行页面）。消费示例使用 React +
wa-sqlite 主线程 IndexedDB；[US-526](US-526-admin-workbench.md) 使用 sqlite-wasm 主线程 idb，
两者的适配器接线、依赖与功能范围须分别记录，不能把总代码行数直接当作接入收益对照。

现有构建与 e2e 通过 workspace 源码解析验证组件闭环。发布 tarball 的隔离安装尚未覆盖
`rxdb-model-react + rxdb-adapter-wa-sqlite`（[成本记录](../../../website/docs/entity-model/admin-workbench-cost.md)）；
AC#1 / #3 因此待验证，代码行数清单本身不证明独立接入或收益已成立。

## 价值待证

本故事已随 [epic-010 解锁记录](../../epics/epic-010-model-driven-admin-framework.md#价值待证整个-epic) 解锁
（2026-10-21，owner 决定）：三条故事不新增引擎抽象、对应零个已知病灶，「病灶数 ≥ 抽象数」按 owner
决定豁免，依据与边界见 epic。

## 实现文件

- `apps/dev-rxdb-admin-consumer/` — 仓库内最小独立消费应用，使用公开包入口；发布产物隔离安装待验证
- `website/docs/` — 接入成本记录与接入文档

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [admin-framework 候选分析](../../domain-research/admin-framework.md) — 设计依据（首版边界第 5 条与成功信号）
- [US-526 模型驱动数据工作台](US-526-admin-workbench.md) — 功能参考；适配器与功能范围不同，阶段 A 无硬前置
- [entity-model 文档](../../../website/docs/entity-model/README.md) — 文档写法与示例来源先例
