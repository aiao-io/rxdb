---
id: BOM-US-201
title: 生产改版核对与人工交接摘要
status: In Review
priority: High
epic: BOM-EPIC-003
created: 2026-11-06
updated: 2026-11-06
tags: [bom, production]
dependsOn: [BOM-US-101, BOM-US-102]
capabilities: [rxdb:US-514, rxdb:US-515, rxdb:US-525]
---

# 用户故事：生产改版核对与人工交接摘要

## 作为/我想要/以便

作为准备生产的制造工程师，我想比较工程变更前后的备料和成本并确认交接摘要，以便明确当前批次该用什么料、为什么变化。

## 范围边界

### In Scope

现有 /review 主线、逐修订用量比较、人工确认、JSON 摘要、离线热页重算和窄屏完成反馈。

### Out of Scope

自动审批、真实变更发布、采购或生产下单、成本审计结论与整站离线能力。

## 验收标准

| #   | 前置条件                                   | 操作                                          | 预期结果                                                                   | 状态 |
| --- | ------------------------------------------ | --------------------------------------------- | -------------------------------------------------------------------------- | ---- |
| 1   | SC-100 十台生产任务与 ECN-2026-014         | 进入 /review 并执行两时点核对                 | 读取真实数量、成本、影响和差异，按物料与库存单位归集备料，路径与修订可追溯 | ✅   |
| 2   | 同物料总需求及修订集合相同、逐修订用量改变 | 比较改前改后                                  | 仍显示修订变化；仅路径拆分或排序变化不制造误报，大数小数精确汇总           | ✅   |
| 3   | 核对结果完整                               | 逐项人工确认后下载摘要                        | 条件、manifest、原始成本、费用构成、备料路径和修订元数据对应已显示结果     | ✅   |
| 4   | 已有结论                                   | 修改条件、写入数据或取消确认                  | 撤销当前结论并要求重新核对；缺价、未裁决、截断或缺元数据不生成成功结论     | ✅   |
| 5   | 已有数据或核对页已成功加载                 | 重开工作区、断网改变批量，或在 375px 完成核对 | 数据记录不被重置；已加载页离线可重算；焦点移到可见结果或结论               | ✅   |

## 实现文件

- [change-review.spec.ts](../../../src/app/presentation/change-review.spec.ts)
- [review.page.spec.ts](../../../src/app/pages/review/review.page.spec.ts)
- [bom-demo.service.spec.ts](../../../src/app/bom-demo.service.spec.ts)
- [bom-change-review.spec.ts](../../../../aiao-bom-e2e/src/bom-change-review.spec.ts)

## 验收证据

本地应用验收通过，当前 AC 标为 ✅；证据符号包括 `从 10 台生产任务完成改版核对，下载条件、用量与真实成本一致的结论`、`改为 20 台后旧结论失效，必须重算并重新确认；刷新只恢复条件`，以及 `change-review.spec.ts` 的逐修订用量和路径重排断言。

复验命令和结果见[验收台账](../../verification-report.md)与[应用化验收记录](../../plans/application-promotion-verification.md)。story 保留 In Review，等待 PR 评审及合并后再置 Done。

## References

- [应用决策](../../decisions.md)
- [应用约定](../../CONVENTIONS.md)
