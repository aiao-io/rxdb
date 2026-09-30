---
id: US-519
title: 扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-09-22
tags: [plugin, bom, extensibility, schema]
---

# 用户故事：扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升

## 作为/我想要/以便

**作为** 行业实施顾问
**我想要** 行业字段写进 `ext` jsonb，语义与约束写进 `attr_def` 元数据表
**以便** 不改表结构就能扩展，且扩展字段仍有类型校验、必填校验与可查询性

## 范围边界

### In Scope

- `item` / `bom_header` / `bom_line` 各带 `ext jsonb`
- `attr_def` 元数据表：`code` / `data_type` / `required` / `enum_values` / `applies_to` / `unit`
- 写入期按 `attr_def` 校验；`applies_to` 作用域越界拒绝
- 热字段提升为 generated column + 索引，**不改 `ext` 的读写方式**
- 任意 jsonb key 过滤（GIN）

### Out of Scope

- 属性的界面编辑器（→ US-522）
- 跨组织的属性字典治理流程
- EAV 表——**本故事明确不采用**

## 验收标准

| #   | 前置条件                               | 操作                           | 预期结果                                       | 状态 |
| --- | -------------------------------------- | ------------------------------ | ---------------------------------------------- | ---- |
| 1   | `attr_def` 定义必填枚举字段            | 写入非法值                     | 拒绝，错误指明字段与合法取值                   | ⬜   |
| 2   | `applies_to = 'item'` 的属性           | 写到 `bom_line.ext`            | 拒绝                                           | ⬜   |
| 3   | 某扩展字段变热                         | 提升为 generated column + 索引 | 查询走索引，`ext` 的读写方式不变、无需数据迁移 | ⬜   |
| 4   | 任意 jsonb key                         | 按其过滤                       | 走 GIN 索引，无需预先声明                      | ⬜   |
| 5   | `attr_def` 声明必填、既有行缺该字段    | 读取 / 写入                    | 读不报错；写必须补齐（语义在契约里明确）       | ⬜   |
| 6   | 同一 `code` 在两个 `applies_to` 上定义 | 保存                           | 允许，二者独立（唯一键含作用域）               | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

**本故事的关闭条件是「没有 EAV 表」。** EAV（`entity_id` / `attr_name` / `attr_value`）的四个致命问题：

1. 行爆炸——一个物料 30 个属性就是 30 行，百万物料即三千万行
2. 每取一个字段要一次 self-join，取 10 个字段就是 10 次
3. `attr_value` 只能是 text，类型安全彻底丢失
4. 约束无处安放——必填、枚举、区间都没有落点

jsonb 解决 1～2（一行一物料，一次读取）；`attr_def` 解决 3～4（类型与约束有了落点）；
generated column 解决「jsonb 字段无法建高效索引」这一 jsonb 自身的短板（AC#3）。
三者缺一，方案就退化成 EAV 的某种变体。

AC#3 的关键是**提升不改读写路径**：`ext->>'rohs_status'` 与 generated column 同时可用，
消费方不需要知道某个字段被提升过。否则「提升」就成了一次 breaking change。

AC#5 必须选一种语义并写进契约：`required` 是「新写入必须有」还是「所有行必须有」。
选前者才能让 `attr_def` 增量演进而不需要回填全表。

存储侧：PGlite 原生支持 jsonb + GIN + generated column。SQLite 侧 `json_extract` 可用，
但 generated column 的索引能力与错误语义需单独验证——这属实现期任务，不在本故事的 AC 内。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；`attr_def` 与 `ext` 校验

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置
