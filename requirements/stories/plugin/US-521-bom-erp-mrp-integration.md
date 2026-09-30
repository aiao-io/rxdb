---
id: US-521
title: ERP/MRP 集成契约
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, integration, api-baseline]
---

# 用户故事：ERP/MRP 集成契约

## 作为/我想要/以便

**作为** 集成开发者
**我想要** 一份稳定的 BOM 导出契约与可诊断的批量导入
**以便** 对接 ERP/MRP 时不靠读源码猜字段，且导入失败能定位到行

## 范围边界

### In Scope

- 导出契约：展开结果与主数据的稳定形状，纳入 api-baseline 与兼容承诺
- 批量导入：逐行诊断，含环路数据时**按行报错**而非整批静默丢弃
- `supply_to_vendor`（委外供料）语义：影响采购而非生产结构
- 组织/工厂维度（`org_id`）在契约里显式

### Out of Scope

- MRP 运算本身（净需求、提前期、批量规则）
- 具体 ERP 厂商的字段映射表
- 实时双向同步

## 验收标准

| #   | 前置条件                           | 操作     | 预期结果                                                                      | 状态 |
| --- | ---------------------------------- | -------- | ----------------------------------------------------------------------------- | ---- |
| 1   | 已建 BOM                           | 导出     | 契约稳定、进 api-baseline，破坏性变更被门禁拦下                               | ⬜   |
| 2   | 批量导入含环路的数据               | 导入     | 逐行报错并给出环路路径，**不静默丢弃整批**                                    | ⬜   |
| 3   | 行标 `supply_to_vendor`            | 展开     | 影响采购视图，生产结构不变                                                    | ⬜   |
| 4   | 同一物料在两个 `org_id` 下不同 BOM | 导出     | 按组织隔离，不串                                                              | ⬜   |
| 5   | 导入部分行失败                     | 事务语义 | 契约里明确是「整批回滚」还是「成功行落地 + 失败清单」，二者不得由实现偶然决定 | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

AC#1 按本仓约定：新导出必须进 api-baseline（首跑失败属正常，基线 diff 随提交）。

AC#2 的「按行报错」是集成场景的关键质量项：ERP 导入动辄数万行，整批失败且只给一条错误
等于让对方从头人工排查。环路检测（[US-509](US-509-bom-dag-cycle-detection.md)）在批量路径上
必须能报出**是哪条路径成环**，而不只是「存在环」。

AC#5 遵守「无 fallback 兜底」的同款理由：两种事务语义都合理，但必须是被选择的、写进契约的，
而不是实现细节漏出来的。

`supply_to_vendor`（AC#3）是少数「不改结构只改视图」的真实例子——它确实可以用视图过滤实现，
与 [US-516](US-516-ebom-mbom-mapping.md) 的 EBOM→MBOM 重构形成对照。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；导出契约与批量导入

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-509 DAG 约束与环路检测](US-509-bom-dag-cycle-detection.md) — 批量导入的环路诊断来源
- [US-510 多级展开与 where-used 反查](US-510-bom-multilevel-explosion.md) — 前置
