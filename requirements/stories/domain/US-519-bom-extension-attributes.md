---
id: US-519
title: 扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升
status: Backlog
priority: Low
epic: epic-009-bom-domain-model
created: 2026-09-22
updated: 2026-10-09
tags: [domain, bom, extensibility, schema]
---

# 用户故事：扩展属性：jsonb 值 + attr_def 元数据 + 热字段提升

## 作为/我想要/以便

**作为** 行业实施顾问
**我想要** 行业字段写进 `ext` jsonb，语义与约束写进 `attr_def` 元数据表
**以便** 不改表结构就能扩展，且扩展字段仍有类型校验、必填校验与可查询性

## 范围边界

### In Scope

- `item` / `bom_header` / 行发生项（`bom_line_occurrence`）各带 `ext`（PGlite 为 `jsonb`，SQLite 为 JSON 文本）；
  逻辑行 `bom_line` 只承载身份、不带 `ext`——行级的值随时间变化，落在发生项层（[US-507](US-507-bom-graph-skeleton.md) 两层行身份）；
  ECN 改行只经「截止旧发生项 + 引入新发生项」，`bom_line` 在已发布头下一律不可改（[US-515](US-515-bom-change-management.md) 表 × 操作矩阵），所以行级扩展属性只能挂发生项
- `attr_def` 元数据表：`code` / `data_type` / `required` / `enum_values` / `applies_to` / `unit`；
  `applies_to` 的取值就是 `ext` 所在的三层：`item` / `bom_header` / `bom_line_occurrence`
- 写入期按 `attr_def` 校验；`applies_to` 作用域越界拒绝
- **契约是查询语义，不是索引技术**：SQLite 与 PGlite 对同一过滤给出同一结果（conformance），过滤操作限定为
  `eq` / `ne` / `in` / `lt` / `lte` / `gt` / `gte`（数值与日期）/ `exists`，按 `attr_def.data_type` 比较
- **缺字段与 null 语义**：缺字段与显式 `null` 等价；`exists` 对二者都为假；其余比较对缺字段一律不匹配（含 `ne`）；
  过滤值类型与 `data_type` 不符即拒绝查询，不做隐式转换
- **索引是能力化优化**：PGlite 的 GIN、两端的表达式索引与 generated column 都是可选加速，按后端能力启用；
  没有某项索引能力不等于不支持扩展属性，只是没有加速
- 热字段提升为 generated column + 索引：消费方的读写方式与查询写法不变、不需要手工回填；DDL 与建索引成本照常存在。
  生成列、表达式索引与索引方法的声明面是 [US-030](../core/US-030-declarative-storage-constraints.md) 阶段 D（AC#3 / #7 的前置，D 同样价值待证），
  本故事验收的是提升后的读写与查询计划
- `required` 的语义：**新写入与完整更新**必须有；既有行读取允许缺失；局部更新只要没触碰扩展属性就不强制补齐

### Out of Scope

- 属性的界面编辑器——本 Epic 无归属故事（US-522 只做 BOM 结构编辑与展开视图，不含 `attr_def` 编辑器）；需要时由驱动场景另立故事
- 跨组织的属性字典治理流程
- EAV 表——**本故事明确不采用**

## 验收标准

| #   | 前置条件                               | 操作                                                             | 预期结果                                                                                                                 | 状态 |
| --- | -------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ---- |
| 1   | `attr_def` 定义必填枚举字段            | 写入非法值                                                       | 拒绝，错误指明字段与合法取值                                                                                             | ⬜   |
| 2   | `applies_to = 'item'` 的属性           | 写到 `bom_line_occurrence.ext`                                   | 拒绝                                                                                                                     | ⬜   |
| 3   | 某扩展字段变热                         | 提升为 generated column + 索引                                   | 消费方读写与查询写法不变、无需手工回填；该热字段的等值查询计划在两端都命中新索引（以查询计划断言，不假定自动改走生成列） | ⬜   |
| 4   | 任意已声明的 key，同一数据集           | 在 SQLite 与 PGlite 上执行同一组过滤（含缺字段、null、类型不符） | 两端结果逐行一致；类型不符的过滤两端都拒绝                                                                               | ⬜   |
| 5   | `attr_def` 声明必填、既有行缺该字段    | ① 读取 ② 局部更新其他列 ③ 完整更新 / 新写入不带该字段            | ① 不报错 ② 允许 ③ 拒绝，错误点名缺失字段                                                                                 | ⬜   |
| 6   | 同一 `code` 在两个 `applies_to` 上定义 | 保存                                                             | 允许，二者独立（唯一键含作用域）                                                                                         | ⬜   |
| 7   | PGlite 启用 GIN                        | 对 `ext` 做 `eq` 过滤                                            | 查询计划命中 GIN；关掉 GIN 后结果不变                                                                                    | ⬜   |

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

AC#5 选「新写入与完整更新必须有」：这样 `attr_def` 能增量演进而不需要回填全表，局部更新也不会因为一个与它无关的必填字段被卡住。

**为什么契约是查询语义而不是 GIN。** 把「任意 jsonb key 过滤走 GIN」写成 API 契约，等于把一项 PostgreSQL 的实现技术写成了契约：
SQLite 没有 GIN，按 [US-030](../core/US-030-declarative-storage-constraints.md) 的 fail-fast 规则，SQLite 上整个 BOM 就会被判为不支持；
而 GIN 本身也只覆盖特定操作符（`@>`、`?` 等），范围比较不会命中。所以契约是两端**同一结果**（AC#4），
索引是按能力启用的优化，命中与否用具体查询计划验收（AC#3 / #7），关掉索引结果不变。
SQLite 侧的 `json_extract` 表达式索引与 generated column 索引同样在 AC#3 里验收。

## 价值待证

同 [epic-009](../../epics/epic-009-bom-domain-model.md#价值待证整个-epic)。

## 实现文件

- `packages/rxdb-plugin-bom/` — 待建；`attr_def` 与 `ext` 校验

## References

- [epic-009 BOM 领域模型](../../epics/epic-009-bom-domain-model.md)
- [US-507 BOM 图骨架](US-507-bom-graph-skeleton.md) — 前置；`ext` 所在的 `item` / `bom_header` / 行发生项三层
- [US-515 变更管理](US-515-bom-change-management.md) — 表 × 操作矩阵：行级变更只经新发生项、`bom_line` 不可改，所以行级 `ext` 在发生项层
- [US-030 实体元数据层的声明式存储约束](../core/US-030-declarative-storage-constraints.md) — 能力 fail-fast 规则；阶段 D（生成列、表达式索引与索引方法声明）是 AC#3 / #7 的前置，
  US-030 的消费方清单已把这两条记为 D 的消费方；AC#1 / #2 / #4～#6 不依赖 D
