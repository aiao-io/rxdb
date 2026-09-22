---
id: US-509
title: DAG 约束与环路检测下沉存储层
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, graph, integrity]
---

# 用户故事：DAG 约束与环路检测下沉存储层

## 作为/我想要/以便

**作为** 平台开发者
**我想要** 成环的边在存储层就被拒绝
**以便** ERP 集成、批量导入与直连脚本都绕不过去，成本卷算的拓扑排序永不死锁

## 范围边界

### In Scope

- 插入/更新 `bom_line` 时的可达性检查：子件是否已能到达父件
- 自反边（`child_item_id = parent_item_id`）的 CHECK 拒绝
- 无闭包表时的递归 CTE 兜底，带 `depth` 硬上限防脏数据
- 只有 `flow_direction = 'consume'` 的边参与环检测

### Out of Scope

- 闭包表的建立与增量维护（→ US-510 阶段 B；本故事只在闭包存在时用它加速）
- 联产品/副产品语义本身（→ US-513；本故事只负责把非 consume 边排除在检测外）

## 验收标准

| #   | 前置条件                           | 操作                  | 预期结果                                      | 状态 |
| --- | ---------------------------------- | --------------------- | --------------------------------------------- | ---- |
| 1   | A→B→C 已存在                       | 插入 C→A              | 存储层拒绝，错误里给出环路径                  | ⬜   |
| 2   | 任意 BOM                           | 插入 `child = parent` | CHECK 拒绝                                    | ⬜   |
| 3   | 无闭包表的 org                     | 插入成环边            | 递归 CTE 检出，`depth` 触上限时报错不静默通过 | ⬜   |
| 4   | `flow_direction <> 'consume'` 的边 | 构成反向物料流        | **不**参与环检测，保存成功                    | ⬜   |
| 5   | 绕过应用层直连数据库               | 写入成环边            | 仍被拒绝                                      | ⬜   |
| 6   | 闭包表已建                         | 插入成环边            | 检测走 O(1) 闭包命中，不退化为递归遍历        | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事是 epic-009 里唯一带独立病灶的一条**，可脱离 BOM 场景单独评审。

`@aiao/rxdb-plugin-graph` 的现状：`findPaths` 只保证**返回**非循环路径
（[README](../../../packages/rxdb-plugin-graph/README.md) 自述「路径查询返回非循环路径及对应边信息」），
但 `addEdge` 不阻止成环边**写入**。图插件的 `type: 'directed-graph'` 声明的是有向，不是无环——
调用方若假设 DAG，这个假设没有任何机制保证。

闭包表命中是环检测最便宜的形式，也是 US-510 阶段 B 除查询加速之外的第二个理由：

```sql
SELECT 1 FROM bom_closure
 WHERE bom_type = $t AND org_id = $o
   AND ancestor_id = $child AND descendant_id = $parent;
```

**关闭条件**：绕过应用层直接写库仍被拒（AC#5）。多写入端是本故事存在的全部理由——
只在仓储层校验等于没校验。

## 价值待证

本故事的独立病灶见技术笔记；BOM 语境部分同
[epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；可达性校验
- `packages/rxdb-plugin-graph/` — 可选：给有向图补写入期无环约束

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-503 图数据插件](US-503-graph-data.md) — 现有图能力与其边界
