---
id: BOM-US-101
title: 结构、数量、成本与变更分析
status: In Review
priority: High
epic: BOM-EPIC-002
created: 2026-11-06
updated: 2026-11-06
tags: [bom, analysis]
dependsOn: [BOM-US-001]
capabilities:
  [
    rxdb:US-507,
    rxdb:US-508,
    rxdb:US-509,
    rxdb:US-510,
    rxdb:US-511,
    rxdb:US-512,
    rxdb:US-513,
    rxdb:US-514,
    rxdb:US-515,
    rxdb:US-516,
    rxdb:US-517,
    rxdb:US-518,
    rxdb:US-519,
    rxdb:US-520,
    rxdb:US-524,
    rxdb:US-525
  ]
---

# 用户故事：结构、数量、成本与变更分析

## 作为/我想要/以便

作为制造工程师，我想用同一份 BOM 查询结构、备料、成本与变更，以便每个结果都能追溯到路径、条件和领域计算。

## 范围边界

### In Scope

现有展开、反查、时间轴、双图映射和成本页面及联产场景；承接原 US-525 的应用展示验收。

### Out of Scope

新增领域算法、MRP 下单、真实规模性能承诺与成本会计认证。

## 验收标准

| #   | 前置条件                       | 操作                         | 预期结果                                                               | 状态 |
| --- | ------------------------------ | ---------------------------- | ---------------------------------------------------------------------- | ---- |
| 1   | 已装载确定性 SC-100 样本       | 展开结构与反查 M3 螺钉       | 同物料不同发生项分别显示；位号、完整路径、虚拟件穿透与计算中间量可核对 | ✅   |
| 2   | 存在替代组、多输出和工序损耗   | 分别运行对应场景             | 替代分摊、副产废料和工序分摊与平台 golden 一致，不在应用重算数量       | ✅   |
| 3   | 指定评估日、序列号、批次和配置 | 查询、制造未裁决或不完整配置 | 结果保留执行条件；未裁决显示候选；错误不伪装成完整成功结构             | ✅   |
| 4   | 存在 ECN 与双图映射            | 比较生效日前后并检查映射     | 真实差异、影响路径及覆盖缺口可定位，取消操作针对当前选单               | ✅   |
| 5   | 已执行普通或联产成本计算       | 查看构成与原始十进制值       | 与 golden 一致，单位和批量明确；缺价有具体错误，不按零价展示           | ✅   |

## 实现文件

- [](../../../src/app/pages/)
- [](../../../src/app/components/)
- [bom-demo.spec.ts](../../../../aiao-bom-e2e/src/bom-demo.spec.ts)
- [bom-coproduct.spec.ts](../../../../aiao-bom-e2e/src/bom-coproduct.spec.ts)

## 验收证据

本地应用验收通过，当前 AC 标为 ✅；证据符号包括 浏览器用例 `AC#4 WH-01 phantom 穿透`、`AC#6 M3 螺钉 where-used`，以及 `US-525 AC#7` 至 `AC#19` 的对应数量、ECN、映射与成本断言；联产入口见 `bom-coproduct.spec.ts`。

复验命令和结果见[验收台账](../../verification-report.md)与[应用化验收记录](../../plans/application-promotion-verification.md)。story 保留 In Review，等待 PR 评审及合并后再置 Done。

## References

- [应用决策](../../decisions.md)
- [应用约定](../../CONVENTIONS.md)
