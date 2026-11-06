---
id: BOM-US-301
title: 导入草稿恢复、导出与实例追溯
status: In Review
priority: High
epic: BOM-EPIC-004
created: 2026-11-06
updated: 2026-11-06
tags: [bom, data]
dependsOn: [BOM-US-101]
capabilities: [rxdb:US-519, rxdb:US-521, rxdb:US-523, rxdb:US-525]
---

# 用户故事：导入草稿恢复、导出与实例追溯

## 作为/我想要/以便

作为维护 BOM 与实物记录的工程师，我想在刷新后继续处理草稿并追溯实例换件，以便导入和安装事实不会因离页丢失或因主数据改版被覆盖。

## 范围边界

### In Scope

应用的导入诊断、草稿恢复、发布接线、快照导出、扩展属性编辑和实例页面。

### Out of Scope

对接真实 ERP、生产历史库迁移、多用户发布审批与物理设备验收。

## 验收标准

| #   | 前置条件                               | 操作                               | 预期结果                                                         | 状态 |
| --- | -------------------------------------- | ---------------------------------- | ---------------------------------------------------------------- | ---- |
| 1   | 待导入文件含环、重复键或错误十进制类型 | 导入文件                           | 整批回滚且逐行诊断；合法导出携带 manifest，十进制保留字符串      | ✅   |
| 2   | 已成功导入未发布草稿                   | 离页、刷新或导入第二个文件后返回   | 从数据库找回待发布草稿；恢复后须显式勾选再发布，整次发布失败回滚 | ✅   |
| 3   | 已有属性值                             | 回读并局部编辑扩展属性             | 校验声明类型及必填约束，保留未编辑属性                           | ✅   |
| 4   | 已有两台 SC-100 实例                   | 换件、按序列与批次追溯并修改主数据 | 换件区间与来源明确，失败整体回滚，实例实际修订不被主数据变化覆盖 | ✅   |
| 5   | 来源发生项被实例引用                   | 通过直连删除来源                   | 存储层拒绝且点名引用，页面树保留原事实                           | ✅   |

## 实现文件

- [integration-panel.spec.ts](../../../src/app/components/integration-panel.spec.ts)
- [ext-panel.spec.ts](../../../src/app/components/ext-panel.spec.ts)
- [instances.page.spec.ts](../../../src/app/pages/instances/instances.page.spec.ts)
- [bom-demo.spec.ts](../../../../aiao-bom-e2e/src/bom-demo.spec.ts)
- [bom-product-workflow.spec.ts](../../../../aiao-bom-e2e/src/bom-product-workflow.spec.ts)

## 验收证据

本地应用验收通过，当前 AC 标为 ✅；证据符号包括 浏览器用例 `US-525 AC#20`、`US-525 AC#21`、`US-525 AC#22`，以及 `导入草稿离页刷新后仍在待发布清单，恢复后需明确勾选再发布`。

复验命令和结果见[验收台账](../../verification-report.md)与[应用化验收记录](../../plans/application-promotion-verification.md)。story 保留 In Review，等待 PR 评审及合并后再置 Done。

## References

- [应用决策](../../decisions.md)
- [应用约定](../../CONVENTIONS.md)
