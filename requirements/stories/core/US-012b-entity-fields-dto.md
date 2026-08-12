---
id: US-012b
title: 实体字段描述 DTO
status: Backlog
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-13
updated: 2026-08-13
tags: [core, model, metadata, dto, transport]
inherited_acs:
  - from: US-012
    ac: 4
    note: 原 AC#4，richText contentType 原样透传且不做净化。
  - from: US-012
    ac: 6
    note: 原 AC#6，enum 顺序与 options 展示元数据。
  - from: US-012
    ac: 11
    note: 原 AC#11，date + dateTime 的 DTO 输出与 JSON 往返。
  - from: US-012
    ac: 12
    note: 原 AC#12 / 12c / 12d，四种关系的 DTO 形状与关系目标主键解析。
  - from: US-012
    ac: 13
    note: 原 AC#13 / 13b / 13c，计算属性、系统字段、布尔标志与 encrypted 忠实输出。
  - from: US-012
    ac: 14
    note: 原 AC#14，既有导出冻结；比较口径已改为可执行的快照基线（见本故事 AC 表脚注）。
  - from: US-012
    ac: 16
    note: 原 AC#16，DTO JSON 往返与严格解析；已补未知键策略（D6.1）。
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-012a 的 format 类型，但 DTO 派生与解析可独立设计与交付
- [x] Negotiable: DTO 键名与 relation 子对象形状可在实现前调整
- [x] Valuable: 前端拿到一份稳定 JSON 就能决定展示、编辑与写入路径
- [x] Estimable: 派生规则、字段清单与顺序已在 US-012 的 D1 / D5～D10 / D13 定死
- [x] Small: 只产出两个函数与一组类型；不含值校验、生成器与三框架
- [x] Testable: 派生规则、关系解析、JSON-safe 往返与既有导出冻结均可自动判定
-->

# 用户故事：实体字段描述 DTO

> 设计契约见 [US-012](./US-012-field-semantic-metadata.md) 的 INV-1～INV-6 与 D1、D5～D10、D13。
> 本故事不重述那些决策，只承接落地与验收。

## 作为/我想要/以便

**作为** 前端应用开发者
**我想要** 从后端/本地库拿到一份 JSON-safe、版本化、顺序稳定的实体字段描述
**以便** 按字段元数据自动选择展示、编辑控件和写入路径，而不需要按字段名猜测业务含义

## 前置依赖

`describeEntityFields()` 的 `format` 字段类型来自 [US-012a](./US-012a-field-format-declaration.md)。
US-012a 未落地时本故事可以先做非 format 部分（关系、系统字段、计算属性、布尔标志、解析器），
但 AC#1 / AC#2 需要等 format 类型可用。

## 范围边界

### In Scope

- `EntityFieldsDescriptor` / `EntityFieldDescriptor` 判别联合与 `ENTITY_FIELDS_DTO_VERSION`（D6）
- `describeEntityFields(metadata, resolve)` —— **`resolve` 必填**，无关系实体也要传（D7）
- `EntityMetadataResolver` 与 `EntityRelationResolutionError`；`missingRelationPrimary` / `unsupportedRelationValueType` 的实际产出
- `parseEntityFieldsDescriptor(value)` 严格解析入口，按 D6.1 的三档键策略处理输入
- `cardinality` / `source` 的派生（D1）与 `fields` 稳定顺序（INV-6）
- 既有 `EntityFieldConfig` / `EntityFieldType` / `extractEntityFields` / `extractSystemFields` 冻结 + `@deprecated`（D5）
- 更新 `requirements/api-baseline/rxdb.json` 中本故事新增的类型与导出

### Out of Scope

- `format` 接口定义与注册期校验 —— 属 [US-012a](./US-012a-field-format-declaration.md)
- `validateFieldValue()` —— 属 [US-012c](./US-012c-field-value-validation-codegen.md)
- 生成器透传与三框架契约回归 —— 属 US-012c
- `default` 进入 DTO（D10）、`columnName` 进入 DTO（D8）
- 把 DTO 接入任何 UI 或 DevTools 面板

## 验收标准

| #   | 原 AC | 前置条件                                                                   | 操作                                                                                       | 预期结果                                                                                                                                                                                                                                                                  | 状态 |
| --- | ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 4     | `richText` 声明 `text/markdown` 或 `text/html`                             | 生成字段 DTO                                                                               | DTO 原样保留 `contentType`；不包含编辑器私有 JSON 结构；**不做净化、不断言内容安全**                                                                                                                                                                                      | ⬜   |
| 2   | 6     | `enum` 字段包含 `options` 展示元数据                                       | 生成字段 DTO                                                                               | DTO 同时保留稳定 `enum` 顺序和 `label/color/disabled`；重命名 label 不改数据值                                                                                                                                                                                            | ⬜   |
| 3   | 11    | `date` 字段声明 `dateTime`                                                 | 生成字段 DTO 并做 JSON 往返                                                                | DTO 输出 `valueType: 'date'` 与 `format.kind: 'dateTime'`；不含 `Date` 实例；Date↔ISO、时区和 adapter 值 codec 按既有契约回归，不在本故事重新实现                                                                                                                         | ⬜   |
| 4   | 12    | 实体含 `1:1`、`m:1`、`1:m`、`m:n` 四种关系                                 | 调用 `describeEntityFields(metadata, resolve)`                                             | 四种关系全部出现且 `field` 均为**关系名**（D9）；无 `orderId` 之类外键字段；`cardinality` 按 D1 推导；含 `relation.kind/entity/namespace`；1:1 / m:1 带 `writeField: '${name}Id'` 与 `mutation: 'set-remove'`，1:m / m:n 带 `mutation: 'add-remove'`；均**不含** `format` | ⬜   |
| 5   | 12c   | 实体含关系                                                                 | ①省略 `resolve` 编译；②传入返回 `undefined` 的 `resolve`                                   | ①`@ts-expect-error` 确认省略 `resolve` 不可编译（D7：签名必填，不做「无关系可省略」特例）；②抛 `RxDBError`，消息含关系名与目标实体名，**不**回退成 `uuid`、**不**省略 `valueType`（INV-4）                                                                                | ⬜   |
| 6   | 12d   | 关系目标实体只有一个 `primary: true` 的 `string` 属性                      | 调用 `describeEntityFields(metadata, resolve)`                                             | 关系 DTO 的 `valueType` 为 `'string'`，而非默认猜测的 `'uuid'`；`relation` 结构和写入映射仍符合 D9                                                                                                                                                                        | ⬜   |
| 7   | 12d   | 关系目标实体没有主键，或主键类型不在 `uuid/string/integer/bigint` 内       | 调用 `describeEntityFields(metadata, resolve)`                                             | 先形成带 `rule`、关系字段和目标实体信息的 `EntityRelationResolutionError`，再抛 `RxDBError`；规则分别是 `missingRelationPrimary` / `unsupportedRelationValueType`                                                                                                         | ⬜   |
| 8   | 13    | 计算属性 + `createdAt` / `updatedAt` / `createdBy` 系统字段存在            | 调用 `describeEntityFields()`                                                              | 计算属性输出真实 `valueType` 且 `readonly: true`；系统字段 `source: 'system'` 且 `readonly: true`；`createdBy` / `updatedBy` 的 `valueType` 为 `'string'`（元数据实际声明），无用户语义                                                                                   | ⬜   |
| 9   | 13b   | 字段的通用布尔标志为 `false`，且能力字段未声明或为 `false`                 | 生成字段 DTO                                                                               | `readonly` / `nullable` / `required` / `unique` / `encrypted` 始终输出 `false`；`sortable` / `searchable` / `primary` 对支持该能力的字段输出 `false`，不支持该能力的字段省略键；`BinaryProperty` 不因缺少 `sortable` 而伪造 `false`                                       | ⬜   |
| 10  | 13c   | 字段同时声明 `encrypted: true` 与 `sortable: true`                         | ①不装加密 adapter 时注册并生成 DTO；②单独跑 `@aiao/rxdb-adapter-encrypted` 的 adapter init | ①core 注册期**不**报错，DTO 忠实输出 `encrypted: true` 与 `sortable: true`，不做裁剪（D13）；②加密 adapter 仍抛 `encrypted_sortable_forbidden`，既有行为无回归                                                                                                            | ⬜   |
| 11  | 16    | 任意实体的字段 DTO                                                         | 执行 `parseEntityFieldsDescriptor(JSON.parse(JSON.stringify(dto)))` 并深比较               | 解析成功且往返无损；不含 `Map`、函数、`Date`、`Uint8Array`、`columnName`、`default`；`dtoVersion === ENTITY_FIELDS_DTO_VERSION`                                                                                                                                           | ⬜   |
| 12  | 16    | DTO 被人为注入未知键、未知 `dtoVersion`、已知键类型错误、违反 INV-5 的组合 | 逐项调用 `parseEntityFieldsDescriptor()`                                                   | 按 D6.1 三档判定：未知键被忽略且**不出现在返回值中**；未知版本、已知键类型错误、非 JSON-safe 值与违反 INV-5 的字段联合一律显式失败                                                                                                                                        | ⬜   |
| 13  | 14    | 同一份元数据                                                               | 调用 `extractEntityFields()` / `extractSystemFields()`                                     | 与实施前落库的基线快照零 diff（口径见脚注）；不新增任何字段、不改变键顺序；`@deprecated` 注释不改变运行时行为                                                                                                                                                             | ⬜   |
| 14  | 新增  | `fields` 顺序                                                              | 对同一实体重复调用 `describeEntityFields()`，并打乱 Map 构造顺序重跑                       | 输出顺序恒为 `propertyMap` → `computedPropertyMap` → `relationMap`，各 Map 内保持规范化插入顺序，不做隐式字母排序（INV-6）                                                                                                                                                | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> **AC#13 的比较口径**（替换原 AC#14 的「逐字节一致」——那句话对 JS 对象不可直接判定，
> 也没说基线从哪来）。可执行步骤，缺一不可：
>
> 1. **动 `entity-field.utils.ts` 之前**先提交一个只加测试的 commit：用 `toMatchFileSnapshot`
>    把 `JSON.stringify(output, null, 2)` 落成入库的快照文件。`JSON.stringify` 保留插入顺序，
>    因此字段增删、改名和顺序变化都会产生 diff。
> 2. 基线实体矩阵必须覆盖：系统字段、四种关系、计算属性、`stringArray`、可空字段、唯一字段、
>    加密字段、非 `uuid` 主键。矩阵不全的快照锁不住回归。
> 3. 实施后同一测试零 diff。本故事的 PR **禁止**执行 `--update-snapshot`；review 时检查快照文件
>    是否出现在改动列表里，出现即视为违反 D5 冻结。
>
> `validateEntityFieldValue()` 的冻结不走快照（它返回 `null` 或错误对象，分支比结构更重要），
> 改由 US-012c 用参数化输入/输出对表锁定。

## 技术笔记

- `describeEntityFields()` 的 `resolve` 必填是有意的：可选参数会让类型系统放行一个在有关系时必然抛错的调用，
  把编译期能挡住的错误推迟到运行时（见 D7）。
- 系统字段的 `valueType` 一律读 `propertyMap`，不照抄 `extractSystemFields()` 的硬编码——
  那里 `id` 写死 `uuid`，但实体可以用 `integer` / `bigint` 主键覆盖。
- `entity-field.utils.ts` 中 `(prop as Record<string, unknown>)['readonly']` 与关系侧的 `nullable` 强转是多余的
  （两者都在 `IEntityObject` 上）。可以顺手清掉，但不得改变输出，否则 AC#13 的快照会 diff。
- 新 DTO 与旧结构**故意不对齐命名**（`valueType` vs `type`、`enum` vs `enumValues`、`relation.entity` vs `relatedEntityName`），
  不提供别名、不做双向转换（D5）。
- 覆盖率门禁：`packages/rxdb` ≥ 90%。

## 实现文件

- `packages/rxdb/src/entity/entity-field.utils.ts` — `describeEntityFields()` / `parseEntityFieldsDescriptor()` / `EntityMetadataResolver` / `EntityRelationResolutionError` / `ENTITY_FIELDS_DTO_VERSION`；既有导出冻结 + `@deprecated`
- `packages/rxdb/src/index.ts` — 导出新类型与函数
- `packages/rxdb/src/__tests__/entity/` — DTO 派生规则、关系解析失败路径、布尔标志与 encrypted 忠实输出
- `packages/rxdb/src/__tests__/contracts/` — parser JSON 往返、未知键策略、字段顺序、既有导出基线快照
- `requirements/api-baseline/rxdb.json`

## References

- [US-012 扩展字段语义与前端通信契约（契约父故事）](./US-012-field-semantic-metadata.md)
- [US-012a 字段 format 声明与注册期校验](./US-012a-field-format-declaration.md)
- [US-012c 字段值校验、生成器透传与三框架契约](./US-012c-field-value-validation-codegen.md)
