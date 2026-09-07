---
id: US-012
title: 扩展字段语义与前端通信契约
status: Done
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-06
updated: 2026-08-17
tags: [core, model, metadata, field-type, frontend, transport, teable]
---

<!--
INVEST 检查清单:
- [x] Independent: 基于现有 PropertyType、关系和计算属性，可独立定义字段描述契约
- [x] Negotiable: 公共契约按本文冻结；内部函数拆分、文件内组织和测试实现可在 plan 阶段调整
- [x] Valuable: 前端可根据字段元数据自动选择展示、编辑和校验方式
- [x] Estimable: 设计决策已在本文档定死（见「设计决策」），plan 阶段无需再做架构选择
- [ ] Small: 本文是总契约，不是可由一个开发任务直接领取的 Small story。实施前必须按 A / B / C
      建立三个独立子任务和 PR，分别维护状态、DoD 与回滚边界；本文只在三者全部验收后关闭
- [x] Testable: 类型约束、注册期校验、值校验、DTO 序列化与生成器回归均有明确验收标准
-->

# 用户故事：扩展字段语义与前端通信契约

> INV-1～INV-6 与 D1～D13 是本故事全部实现的唯一真相源。
>
> **交付阶段**（顺序硬约束，阶段之间不可并行）：
>
> | 阶段 | 交付                                                               | AC 区段   | 状态 |
> | ---- | ------------------------------------------------------------------ | --------- | ---- |
> | A    | `format` 声明层 + `validateEntityMetadata()` 注册期校验            | AC#1～12  | ✅   |
> | B    | `describeEntityFields()` / DTO / 严格解析器                        | AC#13～26 | ✅   |
> | C    | `validateFieldValue()` + format/enum/options 透传 + 三框架契约回归 | AC#27～36 | ✅   |
>
> 生成器的 `default` 序列化管线重写与函数工厂显式失败**不在本故事**，已拆到
> [US-018](./US-018-generator-default-serialization.md)：它修的是当前就存在的生成器缺陷，与字段语义无因果关系，
> 且是唯一带 `BREAKING CHANGE` 的部分，独立发布与回滚更安全。阶段 C 的透传只涉及 `format` / `enum` / `options`
> 这些 JSON-safe 纯数据，现有管线即可承载，**不依赖 US-018**。
>
> 本文是跨阶段的公共契约。进入开发前必须为 A / B / C 分别建立子任务；一个 PR 只能交付一个阶段，
> 每个子任务独立更新对应 AC 状态和 API baseline。不得用“阶段表已经拆分”为理由把三阶段塞进同一 PR。
>
> 阶段 B 的 DTO 需要阶段 A 已冻结的 `FieldFormat` 判别联合（阶段 A 未落地时 B 可先做关系、系统字段、
> 计算属性、布尔标志与解析器这些非 format 部分）；阶段 C 的 `validateFieldValue()` 入参是阶段 B 的
> `EntityFieldDescriptor`，A 与 B 都未落地时 C 不可开工。

## 作为/我想要/以便

**作为** 全栈应用开发者
**我想要** 在字段元数据中同时表达底层值类型、单值/多值、业务语义和展示约束
**以便** Angular、React、Vue 前端可以仅依赖一份稳定的 JSON 字段描述自动选择展示、编辑和校验方式，而不需要根据字段名猜测业务含义；字段值的 Date、bigint、binary 等 wire codec 继续遵守现有通信契约，不在本故事重新定义

## 设计原则、设计决策与字段语义契约

设计原则（核心不变式）、设计决策 **D1～D13**、Teable 字段映射与字段语义契约（format / 注册期校验规则 /
通信 DTO / 值校验扩展）全文见已随实现归档的 spec（目录已删除，用
`git show 780c1ab:specs/003-field-semantic-metadata/spec.md` 读取）。
验收标准里的 `D#` 引用指向该文件的对应小节。

## 范围边界

### In Scope

- 新增字段语义层：**逐属性接口**的窄类型 `format`（关系四种 kind 一律不接受，D4），`cardinality` / `source` 作为派生量（D1）
- `StringArrayProperty` 新增可选 `enum`，`EnumProperty` / `StringArrayProperty` 新增可选 `options`（D2）
- 新增 `validateEntityMetadata`，在 `EntityManager.init()` 跨实体聚合后抛错（D3）
- 新增 `describeEntityFields()`、`EntityFieldsDescriptor`、`EntityRelationResolutionError` 与 `ENTITY_FIELDS_DTO_VERSION`（D5～D10、D13），覆盖多值关系与计算属性 `valueType`
- 新增严格的 `parseEntityFieldsDescriptor()` 反序列化入口：未知版本、非法字段联合、非 JSON-safe 值和关系解析缺口都显式失败；任意协议层级的未知键按 D6.1 丢弃
- `EntityFieldConfig` / `extractEntityFields()` / `extractSystemFields()` / `validateEntityFieldValue()` 输出**逐字节不变**，仅加 `@deprecated` 注释（D5、D11）
- 新增 `validateFieldValue()`：`stringArray` 分支与 format 校验（D11）；`FieldValidationError` additive 扩展；该纯函数不接入 repository 写路径
- 生成器透传新语义元数据（`format` / `enum` / `options`）：三者都是 JSON-safe 纯数据，现有 `transitionMetadata()` 管线即可承载，不改管线结构
- 把 `rxdb-client-generator` 内部私有的 `validateEntityMetadata`（[RxDBClientGenerator.ts:143](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L143)）改名，避让 core 新增的同名公开导出（阶段 A，无公开 API 影响）
- 三框架只复用 core 的 DTO 类型与 `parseEntityFieldsDescriptor()`，并从 `@aiao/rxdb-test` 导入同一份契约 fixture，不增加专属语义 API
- 更新 `requirements/api-baseline/rxdb.json`

### Out of Scope

- 把 `validateEntityFieldValue` 或 `validateFieldValue` 接入 repository 写路径（属 US-004 范畴）
- 把加密列约束（`encrypted_sortable_forbidden` 等）从 `@aiao/rxdb-adapter-encrypted` 上提到 core 注册期校验（D13）
- **生成器 `transitionMetadata()` 的序列化管线重写与 `default` 语义**（JSON 往返拆除、bigint / `Uint8Array` / `Date` 字面量还原、函数工厂显式失败）：已整体拆到 [US-018](./US-018-generator-default-serialization.md)，本故事不触碰该函数的管线结构
- `keyValue` / `json` / `bigint` / `binary` / `boolean` 的**子结构**值校验：`validateFieldValue()` 对这五类只跑 `required` 与 `type` / `json` 两条规则（值是否为对象、是否 JSON-safe），不校验 `keyValueSchema` 里每个 entry 的类型、不校验 JSON 内部形状、不校验 bigint 值域与 binary 长度
- Date、bigint、binary 以及关系 ID/集合的值 wire codec、adapter 编解码和远端 API 值协议；本故事只定义 metadata DTO 与纯函数校验
- SQLite、PGlite、Supabase 等适配器新增物理列类型和数据库迁移
- `decimal`、`dateOnly`、`timeOnly`、递归 `object`、通用 `array` 等新运行时 PropertyType
- 富文本编辑器、HTML 净化器、Markdown 渲染器和跨端编辑器实现；本层不承诺内容安全
- 链接、协议白名单等**渲染期**安全行为（本故事只做写入前校验）
- **`attachment` format 与附件字段描述**（整体推迟，D4）：附件上传、Blob/OPFS 同步、缩略图和下载服务当然也不在内
- **`user` format 与用户引用字段描述**（整体推迟，D4）：`UserRef` 形状、用户目录、权限和头像服务均不定义
- **`createdBy` / `updatedBy` 的用户语义与引用转换**：本故事仅按元数据实际声明的 `string` 属性原样描述，不引入指向用户实体的关系、不做 `UUID → UserRef` 解析、不改动 `EntityBase` 的字段类型，也不把它们改声明成 `uuid`
- 公式、汇总、自动编号的计算引擎和执行策略
- 按钮 action 的持久化、自动化触发和权限校验
- 将字段展示元数据硬编码到 Angular、React 或 Vue 专属组件
- 从运行时函数对象恢复 default 工厂源码、闭包或 import；后续如需支持，必须先定义可序列化表达式或 AST 协议（D10）

## 验收标准

AC 按交付阶段分段，编号连续。阶段内可任意顺序验收，阶段之间按 A → B → C 推进。

### 阶段 A — `format` 声明层与注册期校验（AC#1～12）

| #   | 前置条件                                                                             | 操作                                            | 预期结果                                                                                                                                                                                                                                                | 状态 |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 现有实体只声明 `PropertyType`                                                        | 注册并读取旧元数据                              | 行为与既有公共类型不变；未声明 `format` 的字段在元数据里不出现 `format` 键，不填默认值                                                                                                                                                                  | ✅   |
| 2   | `string` 字段声明 `url` / `email` / `phone`                                          | 编译并注册实体                                  | 类型合法；`transitionMetadata()` 产出的 `propertyMap` 条目原样保留 format 判别对象；该条目的 `type` 仍是 `PropertyType.string`                                                                                                                          | ✅   |
| 3   | 同一实体的两份元数据，唯一差异是其中一份字段带 `format`                              | 对两份分别调用 `transitionMetadata()` 并深比较  | 除 `format` 键外两份 `EntityMetadata` 完全相同：`type`、`nullable`、`default`、索引与键顺序均无差异（INV-2 的**元数据层**证明）                                                                                                                         | ✅   |
| 4   | `string` 字段声明 `richText`                                                         | 未提供 `contentType`                            | 类型测试（`@ts-expect-error` + `expectTypeOf`）确认声明不可编译；绕过类型的运行时配置在 `EntityManager.init()` 抛 `RxDBError`，消息含实体名、字段名与 `missingFormatConfig`                                                                             | ✅   |
| 5   | `enum` 字段声明 `multiSelect`，或 `stringArray` 声明 `singleSelect`                  | 注册实体                                        | 抛 `cardinalityConflict`；多选必须用带 `enum` 的 `stringArray`（INV-3）                                                                                                                                                                                 | ✅   |
| 6   | `number` 字段声明 `currency` / `percentage` / `rating` / `duration`                  | 注册缺少配置、非法范围、step 或 percentage 边界 | 抛 `missingFormatConfig` / `invalidRange`；覆盖非有限数、rating 端点未对齐和 scale 固有值域；同一实体多个字段错误一次报出                                                                                                                               | ✅   |
| 7   | `config.entities` 中有两个实体各带违规字段，且违规实体排在合法实体**之后**           | `EntityManager.init()`                          | 一次异常同时报出两个实体的全部违规（D3 跨实体聚合），不在第一个实体处中断；抛错后对**排在前面的合法实体**调用 `resolveEntityManager()` 同样失败——即部分注册没有泄漏出去（由前置校验或既有 `boundTypes` 回滚保证，两种实现都可接受，断言只看可观察结果） | ✅   |
| 8   | `stringArray` 声明 `multiSelect` 但缺 `enum`；或 `options` 键越界                    | 注册实体                                        | 分别抛 `missingEnum` / `enumOptionsMismatch`                                                                                                                                                                                                            | ✅   |
| 9   | `enum` 含重复值                                                                      | 注册实体                                        | 抛 `duplicateEnum`，错误指出字段名和重复值                                                                                                                                                                                                              | ✅   |
| 10  | 关系元数据上声明任意 `format`，或在 1:1 / m:1 关系上声明 `readonly`                  | 类型检查 + 绕过类型后注册实体                   | 四种 kind 的关系接口在类型层均不接受 `format`，1:1 / m:1 因 `readonly?: never` 也不接受 `readonly`（均用 `@ts-expect-error` 断言）；运行时注册分别抛 `formatOnRelation` / `readonlyOnRelation` 并指出关系名（D4、D9.1）                                 | ✅   |
| 11  | 使用未知 `format.kind`、与 `PropertyType` 不匹配的组合、畸形 enum/options 或非法配置 | 注册实体                                        | 分别抛 `unknownFormat` / `formatTypeMismatch` / `invalidEnumConfig` / `invalidOptionsConfig` / `invalidFormatConfig`；校验器对 `format: null`、非数组 enum 等 `unknown` 形状也聚合报错，不自身崩溃                                                      | ✅   |
| 12  | 同一组结构 fixture 与值语义 fixture                                                  | 分别走类型检查与 `validateEntityMetadata()`     | 结构 fixture 满足单向不变式：类型拒绝则运行时拒绝，运行时接受则类型合法；`min > max`、重复 enum、非法 scheme/货币代码等值语义允许“类型接受、运行时拒绝”，并逐项覆盖（D4）                                                                               | ✅   |

> **AC#2 / AC#3 为什么只验到元数据层**：阶段 A 只交付声明层与注册期校验，此时 schema 生成、
> 写入和序列化路径一行都没改。让阶段 A 的 AC 去跑 adapter 写读，等于把阶段 B/C 的依赖倒挂回阶段 A，
> 而且断言的其实是"没碰过的代码没坏"。INV-2 的**存储层**证明放在阶段 C 的 AC#35 全量回归里：
> 既有 storage 契约测试在实体带 `format` 后必须零 diff 通过——那才是真正跑物理列和值 codec 的地方。
>
> **AC#7 的后半段是回归护栏，不是新行为**：`EntityManager.init()` 已经在 `catch` 里回滚
> `boundTypes`（[entity-manager.ts:121-158](../../../packages/rxdb/src/entity/entity-manager.ts#L121-L158)），
> 部分注册今天就不会泄漏。本条要锁的是：新增的跨实体聚合校验**不能**把这条既有保证改坏——
> 比如把校验插在部分实体已绑定之后、又不走原来的 `catch` 路径。因此断言只看可观察结果
> （`resolveEntityManager()` 对先注册的合法实体同样失败），不指定实现落在校验前置还是回滚。
>
> **AC#12 为什么单独成条**：类型层和运行时层仍可能在可静态表达的结构规则上漂移。
> 落地方式：载体映射与 `kind` 列表共用 `as const` 数据源；类型级与运行时测试读取同一组结构 fixture。
> 值语义 fixture 单独维护，明确验证它们只能由运行时拒绝，不再伪造“TypeScript 能证明数值和字符串内容”的假门禁。

### 阶段 B — 实体字段描述 DTO（AC#13～26）

| #   | 前置条件                                                                      | 操作                                                                                       | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | 状态 |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 13  | `richText` 声明 `text/markdown` 或 `text/html`                                | 生成字段 DTO                                                                               | DTO 原样保留 `contentType`；不包含编辑器私有 JSON 结构；**不做净化、不断言内容安全**                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | ✅   |
| 14  | `enum` 字段包含 `options` 展示元数据                                          | 生成字段 DTO                                                                               | DTO 同时保留稳定 `enum` 顺序和 `label/color/disabled`；重命名 label 不改数据值                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 15  | `date` 字段声明 `dateTime`                                                    | 生成字段 DTO 并做 JSON 往返                                                                | DTO 输出 `valueType: 'date'` 与 `format.kind: 'dateTime'`；不含 `Date` 实例；Date↔ISO、时区和 adapter 值 codec 按既有契约回归，不在本故事重新实现                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | ✅   |
| 16  | 实体含 `1:1`、`m:1`、`1:m`、`m:n` 四种关系                                    | 调用 `describeEntityFields(metadata, resolve)`                                             | 四种关系全部出现且 `field` 均为**关系名**（D9）；无 `orderId` 之类外键字段；`cardinality` 按 D1 推导；含 `relation.kind/entity/namespace`；1:1 / m:1 带 `writeField: '${name}Id'` 与 `mutation: 'set-remove'`，1:m / m:n 带 `mutation: 'add-remove'` 且**不含** `writeField`；四者均不含 `format`，`readonly` 恒 `true`（D9.1）；类型层同时断言两个方向：`@ts-expect-error` 确认无法在 `EntityToManyRelationFieldDescriptor` 上写 `nullable` 或 `writeField`；**并且**在 `EntityFieldDescriptor` 联合上按顶层 `cardinality === 'single'` 收窄后，`expectTypeOf` 确认 `d.nullable` 是 `boolean`（不是 `boolean \| undefined`）、`d.relation.writeField` 是 `string`——只有负向断言时消费方仍被迫写类型断言 | ✅   |
| 17  | 实体含关系                                                                    | ①省略 `resolve` 编译；②传入返回 `undefined` 的 `resolve`                                   | ①`@ts-expect-error` 确认省略 `resolve` 不可编译（D7：签名必填，不做「无关系可省略」特例）；②抛 `RxDBError`，消息含关系名与目标实体名，**不**回退成 `uuid`、**不**省略 `valueType`（INV-4）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | ✅   |
| 18  | 关系目标实体只有一个 `primary: true` 的 `string` 属性                         | 调用 `describeEntityFields(metadata, resolve)`                                             | 关系 DTO 的 `valueType` 为 `'string'`，而非默认猜测的 `'uuid'`；`relation` 结构和写入映射仍符合 D9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | ✅   |
| 19  | 关系目标实体没有主键，或主键类型不在 `uuid/string/integer/bigint` 内          | 调用 `describeEntityFields(metadata, resolve)`                                             | 抛 `EntityRelationResolutionError` 且 `instanceof RxDBError`；`details` 保留关系字段、目标实体和 `missingRelationPrimary` / `unsupportedRelationValueType`，不得只检查 message                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 20  | 计算属性 + `createdAt` / `updatedAt` / `createdBy` 系统字段存在               | 调用 `describeEntityFields()`                                                              | 计算属性输出真实 `valueType` 且 `readonly: true`；系统字段 `source: 'system'`，`readonly` **按元数据实际声明输出**——当前 `ENTITY_BASE_METADATA_OPTIONS` 五个字段恰好都声明了 `readonly: true`（[entity-base.ts:37-71](../../../packages/rxdb/src/entity/entity-base.ts#L37-L71)），因此本条断言值为 `true`，但实现必须读元数据而不是按 `source === 'system'` 填常量；用一个把 `createdAt` 覆盖成 `readonly: false` 的 fixture 实体反证这一点；`createdBy` / `updatedBy` 的 `valueType` 为 `'string'`（元数据实际声明），无用户语义                                                                                                                                                                       | ✅   |
| 21  | 布尔标志矩阵 fixture：属性 / 计算属性 / 四种关系各一行，标志一律不声明        | 生成字段 DTO，对每行断言键的**存在性**（`'unique' in d`）而非取值                          | 属性行：`readonly`/`nullable`/`required`/`unique`/`encrypted` 五键都在且为 `false`，`sortable`/`searchable`/`primary` 按属性接口能力决定在或不在（`BinaryProperty`/`JSONProperty`/`KeyValueProperty` 无 `sortable` 键，不伪造 `false`）；四种关系行：`sortable` 键都在且为 `false`，`readonly` 恒 `true`，`searchable`/`primary`/`enum`/`options`/`keyValueSchema` **一个都不出现**；`nullable`/`required`/`unique`/`encrypted` 四键**只在 1:1 / m:1 出现**（值为 `false`），在 1:m / m:n 上一个都不出现。断言必须用键存在性，`toEqual` 无法区分省略与 `undefined`                                                                                                                                       | ✅   |
| 22  | 字段同时声明 `encrypted: true` 与 `sortable: true`                            | ①不装加密 adapter 时注册并生成 DTO；②单独跑 `@aiao/rxdb-adapter-encrypted` 的 adapter init | ①core 注册期**不**报错，DTO 忠实输出 `encrypted: true` 与 `sortable: true`，不做裁剪（D13）；②加密 adapter 仍抛 `encrypted_sortable_forbidden`，既有行为无回归                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | ✅   |
| 23  | 任意实体的字段 DTO                                                            | 执行 `parseEntityFieldsDescriptor(JSON.parse(JSON.stringify(dto)))` 并深比较               | 解析成功且往返无损；不含 `Map`、函数、`Date`、`Uint8Array`、`columnName`、`default`；`dtoVersion === ENTITY_FIELDS_DTO_VERSION`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅   |
| 24  | DTO 各协议层级被注入未知键、未知 `dtoVersion`、已知键类型错误、违反联合的组合 | 逐项调用 `parseEntityFieldsDescriptor()`                                                   | 顶层、字段、format、relation、options 展示项和 keyValueSchema 条目的未知键均被忽略且不出现在返回值中，**跨 format 的陌生配置键同样只被删除而不报错**（D6.1：解析器不做跨 format 键检测，那是注册期 `invalidFormatConfig` 的职责）；Record 业务键保留；未知版本、已知键类型错误、非 JSON-safe 值与违反 INV-5 的组合显式失败。INV-5 用例必须含「给 1:m / m:n 关系塞 `nullable` / `unique` / `writeField`」——这类键最容易被实现成「未知键丢弃」，丢弃即判红                                                                                                                                                                                                                                                 | ✅   |
| 25  | 同一份元数据                                                                  | 调用 `extractEntityFields()` / `extractSystemFields()`                                     | 与实施前落库的基线快照零 diff（口径见脚注）；不新增任何字段、不改变键顺序；`@deprecated` 注释不改变运行时行为                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | ✅   |
| 26  | 同一 metadata，以及内容相同但 Map 插入顺序相反的 metadata                     | 分别重复调用 `describeEntityFields()`                                                      | 同一 metadata 重复输出深相等；两份 metadata 都按 `propertyMap` → `computedPropertyMap` → `relationMap` 分组，并各自保留 Map 插入顺序；第二份允许组内顺序不同，以此证明没有隐式字母排序（INV-6）                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | ✅   |

> **AC#25 的比较口径**（「逐字节一致」对 JS 对象不可直接判定，也没说基线从哪来）。可执行步骤，缺一不可：
>
> 1. **动 `entity-field.utils.ts` 之前**先提交一个只加测试的 commit：用 `toMatchFileSnapshot`
>    把 `JSON.stringify(output, null, 2)` 落成入库的快照文件。`JSON.stringify` 保留插入顺序，
>    因此字段增删、改名和顺序变化都会产生 diff。
> 2. 基线实体矩阵必须覆盖：系统字段、四种关系、计算属性、`stringArray`、可空字段、唯一字段、
>    加密字段、非 `uuid` 主键。矩阵不全的快照锁不住回归。
> 3. 实施后同一测试零 diff。该阶段的 PR **禁止**执行 `--update-snapshot`；review 时检查快照文件
>    是否出现在改动列表里，出现即视为违反 D5 冻结。
>
> `validateEntityFieldValue()` 的冻结不走快照（它返回 `null` 或错误对象，分支比结构更重要），
> 改由阶段 C 的 AC#33 用参数化输入/输出对表锁定。

### 阶段 C — 值校验、生成器透传与三框架契约（AC#27～36）

| #   | 前置条件                                                                                                        | 操作                                                              | 预期结果                                                                                                                                                                                                                                                                                                                                                                                                                                                          | 状态 |
| --- | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 27  | URL 字段声明 `schemes: ['HTTPS']`                                                                               | 对 `http://`、`https://` 与非 URL 文本调用 `validateFieldValue()` | `http` 返回 `urlScheme`，`https` 大小写无关地通过，非 URL 返回 `url`；错误 value 是 JSON-safe 字符串，不回显不可安全序列化对象                                                                                                                                                                                                                                                                                                                                    | ✅   |
| 28  | 三份 fixture：`stringArray`+`enum`+`multiSelect`、`stringArray`+`enum`**无 format**、`enum` 属性+`singleSelect` | 各自对含非法成员的值调用 `validateFieldValue()`                   | 三份都返回 `rule: 'enum'` 和非法值，**错误与是否声明 format 无关**（D2）；数组字段的 message 列出全部非法项而非只报第一个；`options.disabled` 的选项仍算合法值；合法输入一律返回 `null`                                                                                                                                                                                                                                                                           | ✅   |
| 29  | `FieldValidationRule` 的 15 条规则                                                                              | 参数化用例逐条走通过与失败两条路径                                | 每条规则至少各有一组用例；`range` 额外覆盖 `0.3/0.1` 浮点容差、step 不命中和 percentage 两种 scale；失败 rule 一一对应且不缺失；无任何规则只有 happy path；用例表长度与联合成员数做等值断言，新增规则漏测即红。另按 `valueType` 做覆盖矩阵：每个 `PropertyType` 成员至少一组用例，并断言 `keyValue`/`json`/`bigint`/`binary`/`boolean` 只触发 `required` 与 `type`/`json` 两条规则、不进入任何子结构校验（Out of Scope 的口径由本条锁定，避免日后被当成漏测补上） | ✅   |
| 30  | 值分别为 `Date`、`bigint`、`Uint8Array`、函数、`Map`、实体实例                                                  | 触发校验失败并读取返回的 `value`                                  | 按 D12 规范化：ISO 8601 字符串 / 十进制字符串 / 小写 hex；后三类省略 `value`，用 `'value' in error === false` 断言（`toEqual` 视 `{value: undefined}` 与 `{}` 相等，会永远判绿）；`JSON.stringify(error)` 不抛且往返无损                                                                                                                                                                                                                                          | ✅   |
| 31  | 字段声明 `encrypted: true`                                                                                      | 用任意非法值触发校验失败                                          | 错误对象**始终**省略 `value`（D12），无论该值本身是否 JSON-safe；断言用 `toStrictEqual` 或 `'value' in error === false`，不得用 `toEqual`；`field`、`message`、`rule` 正常返回                                                                                                                                                                                                                                                                                    | ✅   |
| 32  | 四种关系的 `EntityFieldDescriptor`                                                                              | 对合法与非法 ID 值调用 `validateFieldValue()`                     | 只按 `relation.mutation` 校验 ID 形状（单值 vs 数组）与 `valueType`；不发起任何 repository / adapter 调用（用 spy 断言零调用），不校验目标记录是否存在                                                                                                                                                                                                                                                                                                            | ✅   |
| 33  | 同一份元数据与同一组值                                                                                          | 调用旧 `validateEntityFieldValue()`                               | 与实施前的输入/输出对表逐项一致（含返回 `null` 的分支）；`@deprecated` 注释不改变运行时行为                                                                                                                                                                                                                                                                                                                                                                       | ✅   |
| 34  | 实体元数据含 `format`、`enum`、`options`                                                                        | 运行生成器并编译输出                                              | 三者完整透传到生成代码且可编译；嵌套判别对象与只读数组不被塌缩成 `string`；Angular / React / Vue 的类型表现一致                                                                                                                                                                                                                                                                                                                                                   | ✅   |
| 35  | 现有 core、`rxdb-client-generator`、`rxdb-test` 及三框架契约测试                                                | 通过 Nx 执行回归                                                  | 既有字段、关系、计算属性与生成代码无回归；共享 fixture 包可构建；`packages/rxdb` 覆盖率 ≥ 90%                                                                                                                                                                                                                                                                                                                                                                     | ✅   |
| 36  | 三框架均已接入字段描述                                                                                          | 检查三端源码、依赖和 api-baseline                                 | fixture 位于 `@aiao/rxdb-test` 的 `cross-framework-fixtures`，三端以 devDependency 导入；直接复用 core parser，不跨包导入 `src/__tests__`；任一端都不新增专属语义 API，三端 api-baseline 相关导出为空集                                                                                                                                                                                                                                                           | ✅   |

> AC#34 只覆盖 `format` / `enum` / `options` 三项**透传**。它们是 JSON-safe 纯数据
> （判别对象、字符串字面量、只读数组），现有 `transitionMetadata()` 的 `JSON.stringify` 往返能原样搬运，
> 因此本条**不依赖** [US-018](./US-018-generator-default-serialization.md)，也不要求管线先重写。
>
> `default` 的生成语义（bigint / `Uint8Array` / `Date` 还原、函数工厂显式失败、JSON 往返拆除、
> `enumerable: false` 内部键防护）属于 US-018 的 AC，本表不重复。两条 story 可并行推进。

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- `PropertyType` 继续作为存储和运行时判别联合；`url`、`richText` 等不新增物理列映射。
- `format` 使用判别对象（`{ kind, ...options }`），避免把 `currency`、`timezone`、`contentType` 等配置散落成互相冲突的可选字段。
- **仓库里有两个同名的 `transitionMetadata`，不要混淆**：`@aiao/rxdb` 的 `entity/metadata-transition.ts` 把 `EntityMetadataOptions` 合并成 `EntityMetadata`（装饰器求值时跑，见 D3）；`rxdb-client-generator` 的 `core/RxDBClientGenerator.utils.ts:460` 把 `EntityMetadata` 序列化成**字符串**回填 `Entity(...)`。本故事只在前者的产物上做校验；后者的管线归 [US-018](./US-018-generator-default-serialization.md)，这里只借它搬运 `format` / `enum` / `options` 三项 JSON-safe 数据。
- **`validateEntityMetadata` 这个名字今天已经被占用**：`rxdb-client-generator` 里有一个同名私有箭头函数
  （[RxDBClientGenerator.ts:143](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L143)，
  校验绑定标识符与 namespace，调用点在 L173 / L305）。它不导出，与 core 新增的公开导出不冲突编译，
  但同名不同义会让「哪个校验器报的错」这类问题在两个包之间反复误判。阶段 A 顺手把私有的那个改名
  （建议 `assertGeneratedEntityBindings`），无公开 API 影响，不需要 api-baseline 变更。
- 生成器与 DTO 是两层契约：生成器源 metadata 保留支持的常量 `default`（US-018 定义其语义与失败条件），DTO 则一律不输出任何 `default`（D10）。两层的边界不因 US-018 的进度而移动。
- `parseEntityFieldsDescriptor()` 是 DTO 的唯一严格反序列化入口；它在解析时再次检查 `dtoVersion`、字段判别联合、JSON-safe 值、稳定顺序和关系 `valueType`。未知键必须规范化删除，已知键不得用类型断言、静默删除或默认值猜测来修复。
- DTO 生成顺序固定为 `propertyMap`（含系统字段）、`computedPropertyMap`、`relationMap`；关系使用逻辑 `writeField` 与 `mutation` 描述写入意图，绝不把数据库 `columnName` 或值 wire codec 混入 DTO。
- Date、bigint、binary 和关系值的运行时/远端 wire codec 继续遵守既有契约；本故事只验证 metadata DTO 的 JSON-safe 往返和纯函数校验，不新增 adapter、repository 或 API 编解码。
- Angular、React、Vue 只导入 core 的 DTO 类型和 parser；共享 fixture 放在 `@aiao/rxdb-test` 的 `cross-framework-fixtures`，三端通过 devDependency 导入，不复制语义，也不跨包引用 `src/__tests__` 私有路径。
- `entity-field.utils.ts` 里两处 `as Record<string, unknown>` 强转**性质不同，别一起处理**：
  - [L85](../../../packages/rxdb/src/entity/entity-field.utils.ts#L85) 的 `(prop as Record<string, unknown>)['readonly']` 确实多余——`EntityPropertyMetadata` 的每个成员都 extends `IEntityObject`，直接写 `prop.readonly` 即可，可以顺手清掉。
  - [L115](../../../packages/rxdb/src/entity/entity-field.utils.ts#L115) 的 `(relation as Record<string, unknown>)['nullable']` **不多余**：`relationToField` 的形参声明成四路联合 `EntityRelationMetadata`，而 `nullable` 只在 1:1 / m:1（extends `IEntityObject`）上有，1:m / m:n 没有，直接访问编译不过。要清掉必须先把形参收窄成 `EntityRelationOneToOneMetadata | EntityRelationManyToOneMetadata`——运行时本来也只有 `foreignKeyRelationMap` 的这两种 kind 会进来。这是内部函数签名变更，输出不变，不违反 D5。
  - 注意 `name` / `displayName` / `columnName` 三个键**同时**存在于 `IEntityObject` 和 `EntityRelationMetadataBase`（[relation-types.interface.ts:228-239](../../../packages/rxdb/src/entity/relation-types.interface.ts#L228-L239)），所以四种关系都能直接访问；`IEntityObject` 相对 base 真正多出来的只有 `unique` / `readonly` / `nullable` / `required` / `encrypted` 五个。DTO 的关系键取舍就是按这条边界划的。
  - 两处改动都不得改变既有输出（D5 / AC#25）。
- 系统字段的 `valueType` 直接取 `propertyMap` 里的声明，**不要照抄 `extractSystemFields()` 的硬编码**：那里 `createdBy` / `updatedBy` 写死 `PropertyType.string`（[entity-field.utils.ts:164-167](../../../packages/rxdb/src/entity/entity-field.utils.ts#L164-L167)），恰好与 `ENTITY_BASE_METADATA_OPTIONS` 一致；但 `id` 同样写死 `PropertyType.uuid`（[同文件 L155](../../../packages/rxdb/src/entity/entity-field.utils.ts#L155)），而实体可以用 `integer` / `bigint` 主键覆盖——照抄就会输出错的 `valueType`。新 DTO 一律读元数据。
- 附件与用户引用推迟的原因见 D4。后续 story 开工时的既有落点：附件可复用 `@aiao/rxdb-plugin-storage` 的 `file-meta.entity.ts`；用户引用需要先给 `createdBy` / `updatedBy` 定义关系或解析层。届时要一并回答的问题是「引用的远程 URL / 展示名从哪来、算不算实体值契约的一部分」——本故事不预设答案，也不预留字段。
- 百分比值域、step 基准与浮点容差按“注册期校验规则”后的算法执行；duration 必须明确单位；currency 只校验 `/^[A-Z]{3}$/` 代码形状，不依赖运行环境的货币表。
- 富文本 HTML 进入渲染器前必须经过净化；净化策略与编辑器实现属于后续 UI/安全 story，本故事只保证 `contentType` 无损传递。
- 新增公开类型、DTO 和 generator 输出必须更新 `requirements/api-baseline/`，并遵守兼容性与版本发布门禁。
- 本故事不新增物理 `PropertyType`，不进入 epic-005 的 bigint/binary 发布门禁。
- 校验点是「读到 metadata 之后、注册 manager 之前」，不需要也不应该重跑 `transitionMetadata()`（D3）。
  `validateEntityMetadata()` 必须是纯函数，返回按 `namespace/entity/field/rule` 排序的错误数组，不得在首个错误处抛出。
  `MetadataValidationRule` 联合在阶段 A 一次性定全 13 项，全部由 `validateEntityMetadata()` 产出；
  关系目标解析的 `missingRelationPrimary` / `unsupportedRelationValueType` 属于另一个联合
  `RelationResolutionRule`，只由阶段 B 的 `describeEntityFields()` 产出（D3）。
- `validateFieldValue()` 同样是纯函数：不读全局状态、不访问 repository、不做 I/O（AC#32 用 spy 断言）。
  它复用旧函数的 required、基础类型、enum、JSON 规则，再叠加 `stringArray` / `numberArray` 与 format 校验（D11）。
  复用方式是**提取共享内部函数**，不是让新函数调用已冻结的旧函数——否则旧函数的行为改动会经由新函数外溢。
  `number` / `uuid` / `date` 三条刻意不复用：旧函数隐式转换，新函数只认原生类型（D11）。
- 新 DTO 与旧结构**故意不对齐命名**（`valueType` vs `type`、`enum` vs `enumValues`、`relation.entity` vs
  `relatedEntityName`），不提供别名、不做双向转换（D5）。
- 覆盖率门禁：`packages/rxdb` ≥ 90%。

## 实现文件

按交付阶段归属，避免三个阶段同时改同一个文件：

| 文件                                                             | 阶段  | 内容                                                                                                                                                                     |
| ---------------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/rxdb/src/entity/metadata-options.interface.ts`         | A     | `format` 判别联合、逐属性窄类型 `format?`、`StringArrayProperty.enum` / `options`                                                                                        |
| `packages/rxdb/src/entity/metadata-validate.ts`（新增）          | A     | `validateEntityMetadata` 与规则表                                                                                                                                        |
| `packages/rxdb/src/entity/format-rules.ts`（新增）               | C     | format 必填键表、`percentage` 固有值域、step 容差的内部唯一真相源；三处消费者共用，**不从包入口导出**（同 `json-safe.ts`）                                               |
| `packages/rxdb/src/entity/entity-manager.ts`                     | A     | `init()` 跨实体聚合校验并抛错（D3）                                                                                                                                      |
| `packages/rxdb/src/entity/entity-field.utils.ts`                 | B     | DTO、parser、`EntityRelationResolutionError`、版本常量；既有导出冻结 + `@deprecated`                                                                                     |
| `packages/rxdb/src/entity/entity-value.utils.ts`                 | C     | `validateFieldValue()`；旧 `validateEntityFieldValue` 冻结 + `@deprecated`                                                                                               |
| `packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts` | A     | 私有 `validateEntityMetadata` 改名（[L143](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L143) 及 L173 / L305 调用点），避让 core 同名公开导出 |
| `packages/rxdb-client-generator/src/`                            | C     | 透传 `format` / `enum` / `options`（AC#34）。**不改** `transitionMetadata()` 的管线结构——那属于 [US-018](./US-018-generator-default-serialization.md)                    |
| `packages/rxdb-test/src/cross-framework-fixtures/`               | C     | 新增 `entity-fields-descriptor.ts` 并从既有 `index.ts` 导出，由 `@aiao/rxdb-test` 根入口共享                                                                             |
| `packages/rxdb-{angular,react,vue}/`                             | C     | 用 pnpm workspace 命令添加 `@aiao/rxdb-test` devDependency，复用同一组 DTO fixture 做契约回归                                                                            |
| `pnpm-lock.yaml`                                                 | C     | 记录三框架测试依赖的 workspace 链接，不手改依赖图                                                                                                                        |
| `requirements/api-baseline/rxdb.json`                            | A/B/C | 每个阶段各自追加，不集中一次改完                                                                                                                                         |

## References

- [Teable GitHub](https://github.com/teableio/teable)
- [US-001 定义数据模型](./US-001-model-definition.md)
- [US-004 数据变更](./US-004-data-mutation.md)
- [US-011 定义 bigint 与 binary 类型及公共 API 契约](./US-011-property-type-bigint-binary.md)
- [US-018 生成器元数据序列化管线与 default 语义](./US-018-generator-default-serialization.md) — 从本故事拆出的生成器侧 `default` 语义，可并行
- [US-402 代码编辑器组件](../ui/US-402-code-editor.md)
- [US-502 Storage 插件](../plugin/US-502-storage-plugin.md) — 附件语义的后续落点，本故事不依赖
