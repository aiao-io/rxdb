---
id: US-528
title: 独立消费接入示例与接入成本记录
status: Backlog
priority: Low
epic: epic-010-model-driven-admin-framework
created: 2026-10-19
updated: 2026-11-06
tags: [domain, admin-framework, docs, consumer-example]
---

# 用户故事：独立消费接入示例与接入成本记录

## 作为/我想要/以便

**作为** 评估本框架的开发者
**我想要** 以 React Admin 应用模板验证公开包接入，并记录实际业务新增的代码、依赖与样式
**以便** 判断「定义实体之后少写了多少 CRUD」是否成立

## 交付阶段

| 阶段 | 内容                                                                  | 状态 |
| ---- | --------------------------------------------------------------------- | ---- |
| A    | 应用模板消费验证：只用发布产物接线实体页（录入 / 编辑 / 筛选 / 重开） | ⚠️   |
| B    | 模板接入成本与独立重搭：实际业务新增代码、依赖、样式及复验入口        | ⚠️   |

阶段归属：A 关闭 AC#1；B 关闭 AC#2 / #3。

## 范围边界

### In Scope

- 接入载体为 `apps/rxdb-admin-template-react`；应用通过公开包入口接线引擎、模型 UI 与后台外壳
- 公开发布产物的消费验证不依赖 workspace 源码、私有包模块或其他应用内部模块
- 用模板跑通录入 / 编辑 / 筛选 / 刷新重开，记录同一实际业务任务的接入工作
- 成本记录回答三件事：新增多少代码（行数按文件列出）、加了哪些依赖、样式怎么接入
  （Tailwind + daisyUI 管线或无样式管线，二选一写清）

### Out of Scope

- 从 schema 自动生成整个应用源码（首版不承诺）
- 用总代码量直接比较最小 CRUD 页面与完整工作台的接入收益
- 在当前应用孵化批次实施独立复制或仓外工程；AC#1 / #3 仍保留待验
- 市场推广材料

## 验收标准

| #   | 前置条件           | 操作                                           | 预期结果                                                                                             | 状态 |
| --- | ------------------ | ---------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---- |
| 1   | 发布 tarball 可用  | 在仓库外隔离安装发布产物，按示例搭建并运行     | 录入 / 编辑 / 筛选 / 刷新重开全部可用；依赖、样式与 WASM 资源完整，不使用 workspace 源码或工作台模块 | ⚠️   |
| 2   | 示例应用可运行     | 对照代码清单                                   | 文档列出新增代码行数、依赖清单与样式要求，读者可逐项复验                                             | ⚠️   |
| 3   | 文档与发布产物可用 | 由试用者按文档在隔离环境重搭，并记录步骤与问题 | 无需额外咨询即可完成 AC#1 的闭环；记录依赖、配置、时间和减少的手工接线，作为接入收益证据             | ⚠️   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

本故事是 [admin-framework 候选分析](../../domain-research/admin-framework.md) 首版边界第 5 条的落点，
也是成功信号（具名试用者独立完成录入 / 编辑 / 筛选 / 重开 / 备份 / 恢复）的接入验收落点。

应用载体是 [React Admin 模板](../../../apps/rxdb-admin-template-react/README.md)，当前在本仓库孵化，
应用配置与业务扩展由 [ADMIN 应用故事](../../../apps/rxdb-admin-template-react/requirements/README.md) 管理。
[`createWorkbenchDatabase`](../../../apps/rxdb-admin-template-react/src/app/rxdb/setup_rxdb.ts) 使用 sqlite-wasm
主线程 IndexedDB，固定该组合以支持全文搜索与备份恢复。

仓库内构建与 e2e 只证明 workspace 接线及默认资产闭环。[成本记录](../../../website/docs/entity-model/admin-workbench-cost.md)
列出当前模板源码基线、依赖与样式入口；实际业务新增代码与接入用时尚未测量，AC#2 保留待验。
发布 tarball 的隔离安装和试用者按文档独立重搭仍缺证据，AC#1 / #3 不能由模板重命名或既有浏览器测试关闭。

## 价值待证

本故事的长期目标已获 [epic-010 授权](../../epics/epic-010-model-driven-admin-framework.md#价值待证整个-epic)，
不新增引擎抽象的首版范围沿用 owner 豁免。当前按 [应用孵化决策](../../../apps/rxdb-admin-template-react/requirements/decisions.md)
仅在仓库内推进，独立消费与实际接入成本保留 Backlog；进入实施前需明确发布产物、具体业务任务与试用者。

## 实现文件

- `apps/rxdb-admin-template-react/` — 应用模板与默认资产场景，当前通过 workspace 接线孵化
- `apps/rxdb-admin-template-react-e2e/` — 模板的本地浏览器闭环，不替代仓外安装验收
- `website/docs/entity-model/admin-workbench-cost.md` — 模板代码基线、依赖、样式与待验成本项

## References

- [epic-010 模型驱动后台管理框架](../../epics/epic-010-model-driven-admin-framework.md)
- [admin-framework 候选分析](../../domain-research/admin-framework.md) — 设计依据（首版边界第 5 条与成功信号）
- [US-526 模型驱动数据工作台](US-526-admin-workbench.md) — 当前模板的默认资产闭环
- [entity-model 文档](../../../website/docs/entity-model/README.md) — 文档写法与示例来源先例
