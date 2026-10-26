---
title: 核心与框架包增量评审计划与结果
status: Done
baseline: ffed57da
incrementalFrom: 18ea576f
updated: 2026-10-26
---

# 核心与框架包增量评审计划与结果

## 范围与方法

覆盖 16 包：code-editor、rxdb、rxdb-model 的核心及 Angular/React/Vue 包，以及 rxdb-client-generator、rxdb-devtools、rxdb-test、utils。以 `18ea576f` 的上一版报告为起点，检查到 `ffed57da`；先按提交和路径盘点，再沿高风险调用链检查与现有测试反查。

本轮重点：WorktreeTableSet 与实体缓存/仓库事务/只读入口、模型只读与历史屏障、三端包装。既有模型、工具与 DevTools 缺陷按源码变更核对关闭证据。

缺陷必须有当前源码位置、触发条件与用户影响；无实现增量的包只核对元数据/配置/文档和旧发现的关闭证据。测试文件存在或提交标题含 fix 均不能证明问题已关闭。完整方法、提交清单和 51 包覆盖矩阵见 [本轮记录](./incremental-2026-10-26.md)。

## 结果

去重待处理 21 条：3 P1 + 15 P2 + 3 P3；本组无新增确认缺陷。 逐包问题见同名报告，跨组总数见 [汇总](./summary.md)。首批 6 条已修复记录移出当前问题清单，历史留在 Git。

## 验证与限制

三端 working-tree 包属于插件组；本组验证只计真实运行过的依赖构建，不声称核心、模型或编辑器全量测试已执行。

当前环境 Node `26.12.0` / pnpm `10.34.9`。上轮 Node 22 / Nx 插件加载失败的说明已过时，按 [实际执行表](./incremental-2026-10-26.md#验证) 判断通过范围；未跑全工作区 lint/typecheck/build/e2e。报告只更新文档，未修生产代码。
