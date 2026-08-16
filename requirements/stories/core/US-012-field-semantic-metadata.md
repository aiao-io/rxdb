---
id: US-012
title: 扩展字段语义与前端通信契约
status: Backlog
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-06
updated: 2026-08-16
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
> | 阶段 | 交付                                                    | AC 区段   |
> | ---- | ------------------------------------------------------- | --------- |
> | A    | `format` 声明层 + `validateEntityMetadata()` 注册期校验 | AC#1～12  |
> | B    | `describeEntityFields()` / DTO / 严格解析器             | AC#13～26 |
> | C    | `validateFieldValue()` + 生成器透传 + 三框架契约回归    | AC#27～37 |
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

## 设计原则

Teable 的字段设计值得借鉴，但不直接复制其字段枚举。Aiao 的字段契约只有**两个可声明维度**：

| 维度           | 职责                       | 示例                               |
| -------------- | -------------------------- | ---------------------------------- |
| `PropertyType` | 运行时值和持久化语义       | `string`、`number`、`date`、`json` |
| `format`       | 字段业务语义和默认渲染方式 | `url`、`richText`、`currency`      |

另有两个**派生视图**，只出现在 DTO 输出里，不接受作者声明（见 D1）：

| 视图          | 职责               | 派生自                          |
| ------------- | ------------------ | ------------------------------- |
| `cardinality` | 值是单个还是集合   | `PropertyType` / `RelationKind` |
| `source`      | 值的来源和可编辑性 | 元数据所属的 Map                |

`url`、`email`、`phone`、`richText` 等不新增数据库物理类型；它们默认复用 `PropertyType.string`。只有运行时值、精度、时区或结构确实不同的类型，才进入 `PropertyType` 演进。本故事的 JSON 只描述字段，不携带实体字段值，也不替代现有 change codec、adapter 或远端 API 的值序列化。

### 核心不变式（INV）

> **原始数据是什么类型，就是什么类型。`format` 和 `cardinality` 都不得改变它。**

- **INV-1**：运行时值的形状**只由** `PropertyType`（属性）或 `RelationKind`（关系）决定。`format` 是纯粹的语义/展示标注，`cardinality` 是对前者的只读投影，二者都不参与值形状的决定。
- **INV-2**：给字段加、改、删 `format` **不得**改变它的运行时值类型、持久化列类型或序列化形状。`{ type: string, format: url }` 与 `{ type: string }` 存的、读的、传的都是同一个 `string`。
- **INV-3**：单值/多值的唯一表达方式是选对 `PropertyType`（`stringArray` / `numberArray`）或选对 `RelationKind`（`1:m` / `m:n`）。`format` 不能把单值字段"变成"多值，也不能反过来 —— 组合不匹配时按 `cardinalityConflict` 在注册期报错，而不是迁就 `format` 去改写类型。
- **INV-4**：DTO 的 `cardinality` 与 `valueType` 一旦出现分歧即是实现 bug，不是可协商的降级路径。消费方以 `valueType` 为准。
- **INV-5**：`source` 是 DTO 的判别字段。`source: relation` 必须有 `relation` 子对象，`source: computed` 必须 `readonly: true`，关系不得携带 `format`；解析器遇到不满足这些不变式的 JSON 必须失败。
- **INV-6**：字段 DTO 的 `fields` 顺序稳定且可复现：先按 `propertyMap` 的规范化插入顺序输出系统/普通属性，再按 `computedPropertyMap`，最后按 `relationMap`；各 Map 内不做隐式字母排序。

## 设计决策

以下决策在本故事内已定死，实现时不得重新协商；如需变更必须先改本文档。

### D1 — `cardinality` 与 `source` 是派生只读量，不接受作者声明

这是 INV-1 / INV-3 的落地形式。两者都能从既有元数据唯一推导，允许声明会产生第二个真相源（例如 `stringArray` + `cardinality: single` 无解），因此它们**只出现在 DTO 输出中**，不进入 `EntityPropertyMetadataOptions` / `EntityRelationMetadataOptions`。

`cardinality` 是 `PropertyType` / `RelationKind` 的**只读投影**，本身不携带任何新信息 —— 它存在只是为了让前端少写一张类型映射表，不是为了给作者提供第二种表达单值/多值的方式。

| 输入                                                                      | `source`   | `cardinality`    |
| ------------------------------------------------------------------------- | ---------- | ---------------- |
| `propertyMap` 且字段名 ∈ {id, createdAt, updatedAt, createdBy, updatedBy} | `system`   | `single`         |
| `propertyMap` 且 `type ∈ {stringArray, numberArray}`                      | `property` | `multiple`       |
| `propertyMap` 其他                                                        | `property` | `single`         |
| `computedPropertyMap`                                                     | `computed` | 按其 `type` 推导 |
| `relationMap` 且 `kind ∈ {1:1, m:1}`                                      | `relation` | `single`         |
| `relationMap` 且 `kind ∈ {1:m, m:n}`                                      | `relation` | `multiple`       |

### D2 — 选项集合的唯一真相源是 `enum` 数组，`options` 只承载展示元数据

`StringArrayProperty` 新增可选 `enum?: readonly string[]`（与 `EnumProperty.enum` 对称）；声明 `multiSelect` 或声明 `options` 时必填。选项**顺序**由 `enum` 数组决定，`options` 是按值索引的展示元数据 Record，其键必须是 `enum` 的子集；`enum` 不允许重复值。

```ts
// EnumProperty（enum 必填，已有）与 StringArrayProperty（enum 新增可选）共用
enum: readonly string[];
options?: Readonly<Record<string, {
  label?: string;
  color?: string;
  disabled?: boolean;
}>>;
```

选项值不得依赖显示文本；删除、禁用或重命名 `label` 不能破坏已有数据。`disabled` 只影响展示，不改变枚举合法性；删除 `enum` 值属于破坏性元数据变更，不在本故事自动迁移。

### D3 — 注册期校验在 `EntityManager.init()` 绑定实体时执行，不在装饰器求值时

装饰器在模块加载时求值，在那里抛错会让整个 bundle 的 import 失败，且无法聚合多个字段错误。

`transitionMetadata` 已经在 `@Entity` 装饰器里跑完（[entity.decorator.ts:51](../../../packages/rxdb/src/entity/entity.decorator.ts#L51)），`EntityManager.init()` 拿到的就是合并好的 `EntityMetadata`（[entity-manager.ts:104](../../../packages/rxdb/src/entity/entity-manager.ts#L104) 的 `getEntityMetadata(EntityType)`）。因此校验点是「读到 metadata 之后、注册 manager 之前」，不需要也不应该再跑一次 transition。

**聚合粒度跨实体**：`init()` 是对 `config.entities` 的 forEach，若逐实体抛错，第一个坏实体会掩盖后面所有实体的问题。`validateEntityMetadata(metadata)` 必须是纯函数，返回按 `namespace/entity/field/rule` 排序的 `EntityMetadataValidationError[]`，不得在首个错误处抛出。`EntityManager.init()` 先对全部实体收集违规，再把**所有实体的所有字段错误**汇总成一个 `RxDBError` 抛出；每条消息包含实体名、字段名和规则标识。`init()` 既有的 `boundTypes` 回滚 try/catch 保持不变。

```ts
export type MetadataValidationRule =
  | 'unknownFormat'
  | 'formatTypeMismatch'
  | 'formatOnRelation'
  | 'missingFormatConfig'
  | 'invalidFormatConfig'
  | 'invalidRange'
  | 'missingEnum'
  | 'invalidEnumConfig'
  | 'duplicateEnum'
  | 'enumOptionsMismatch'
  | 'invalidOptionsConfig'
  | 'cardinalityConflict'
  | 'missingRelationPrimary'
  | 'unsupportedRelationValueType';

export interface EntityMetadataValidationError {
  namespace: string;
  entity: string;
  field: string;
  rule: MetadataValidationRule;
  message: string;
}

export function validateEntityMetadata(metadata: EntityMetadata): readonly EntityMetadataValidationError[];
```

`missingRelationPrimary` 与 `unsupportedRelationValueType` 是关系目标解析阶段使用的规则标识，`validateEntityMetadata()` 在没有目标实体解析器时不返回这两类错误；`describeEntityFields()` 发现它们时仍须抛 `RxDBError`，消息必须包含规则标识、关系名和目标实体名，不得猜测或降级。

### D4 — `format` 只声明在具体属性接口上，关系接口一律不含

**不能**把 `format?` 加到 `IEntityObject`：`EntityRelationOneToOneMetadataOptions`（[metadata-options.interface.ts:433](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L433)）与 `EntityRelationManyToOneMetadataOptions`（同文件 L505）都 `extends IEntityObject`，加在那里等于给 1:1 / m:1 关系开了合法的 `format` 声明口子，与本决策直接矛盾；而 1:m / m:n 只 extends `EntityRelationMetadataBase`，压根拿不到 —— 同一条规则在四种关系上表现不一致。

正确落点是**逐属性接口声明窄类型 format**：

```ts
StringProperty.format?:      PlainTextFormat | MultilineTextFormat | RichTextFormat | UrlFormat
                           | EmailFormat | PhoneFormat | CodeFormat | ColorFormat;
NumberProperty.format?:      NumberFormat | CurrencyFormat | PercentageFormat | RatingFormat | DurationFormat;
IntegerProperty.format?:     NumberFormat | RatingFormat | DurationFormat;
DateProperty.format?:        DateTimeFormat;
EnumProperty.format?:        SingleSelectFormat;
StringArrayProperty.format?: MultiSelectFormat;
```

收益是 `formatOnRelation`、`formatTypeMismatch`、`unknownFormat`、`missingFormatConfig`（如 `richText` 缺 `contentType`）这些**结构约束**能在编译期拦截，AC#4 的类型级用例才有前提。同名运行时规则用于兜住绕过类型系统的元数据来源：生成器回填的 JSON、`transitionMetadata()` 直接传对象、跨版本 d.ts 漂移。

编译期与运行时的一致性边界固定为：

- 类型层负责 `kind` 封闭集合、载体匹配、关系禁用 `format`、必填配置键及字面量联合
- 运行时必须覆盖上述全部结构规则，并额外校验类型系统无法表达的值语义，例如有限数、`min <= max`、URI scheme 语法、货币代码形状和 enum 去重
- **单向不变式**：类型层拒绝的结构，运行时也必须拒绝；运行时接受的配置，必须能通过公开 TypeScript 类型。类型层接受但被运行时值语义拒绝是预期行为，不算分叉

不得声称 TypeScript 接口能静态证明 `min <= max`、数组无重复或任意字符串满足协议语法。

`attachment` / `user` 推迟的原因：二者都依赖尚不存在的引用转换层 —— `EntityBase.createdBy` / `updatedBy` 在元数据里声明为 `PropertyType.string`（[entity-base.ts:61](../../../packages/rxdb/src/entity/entity-base.ts#L61)，TS 侧标注为 `UUID | null`），既没有指向用户实体的关系声明，也没有 `UUID → UserRef` 的解析路径。在这层缺位时定义 `attachment` / `user` 的字段描述，等于先把协议锁死再补语义，风险高于收益。二者一并推迟到专门的 story（见 Out of Scope）。

关系字段在本故事中**仍然进入 DTO**，只是携带结构信息（`source` / `cardinality` / `relation`）而不携带 `format`。

### D5 — 既有 `EntityFieldConfig` / `extractEntityFields()` 冻结，语义信息只进新 DTO

`EntityFieldConfig`、`EntityFieldType`、`extractEntityFields`、`extractSystemFields` 已在 `requirements/api-baseline/rxdb.json` 中，且经全仓检索确认**除自身模块与 spec 外零调用方**。为避免给既有深等比较与快照调用方静默增加字段，它们**输出保持逐字节不变**；本故事新增独立的 `describeEntityFields()` 与 `EntityFieldsDescriptor`，多值关系与计算属性 `valueType` 只在新 DTO 中补齐。

配套两条，避免两套字段提取函数永久并存：

- 旧导出加 `@deprecated` TSDoc，指向 `describeEntityFields()`；`@deprecated` 只改注释，不改运行时输出，不违反冻结
- 新 DTO 与旧结构**故意不对齐命名**（`valueType` vs `type`、`enum` vs `enumValues`、`relation.entity` vs `relatedEntityName`），不提供别名、不做双向转换；实际移除另开故事

### D6 — DTO 版本号是顶层整数 `dtoVersion`

- 本故事产出 `dtoVersion: 1`
- **新增可选字段不升版本**；删除字段、改变既有字段语义或收窄取值域才升版本
- 新增 `source` / `format.kind` / `relation.kind` 等判别值或扩展已知字段的字面量联合也必须升版本；旧解析器无法把新判别值当成“未知可选键”忽略
- 消费方读到未知 `dtoVersion` 必须显式失败，不得猜测或降级
- 唯一真相源是 `@aiao/rxdb` 导出的 `ENTITY_FIELDS_DTO_VERSION` 常量；DTO 生产方、解析器与三框架契约测试一律引用它，不允许各端硬编码字面量。实体代码生成器只有在实际输出 DTO 时才引用该常量，普通实体 metadata 生成不伪造 `dtoVersion`。

新增严格解析入口：

```ts
export function parseEntityFieldsDescriptor(value: unknown): EntityFieldsDescriptor;
```

#### D6.1 — 解析器的未知键策略（消解「不升版本」与「严格解析」的冲突）

「新增可选字段不升版本」与「解析器必须显式失败」两条如果不划清边界就是自相矛盾的：
库 v2 在同一个 `dtoVersion: 1` 里加了一个可选键，版本检查放行，严格解析器却会因为"多了一个键"报错，
于是"不升版本"这条承诺立刻作废。因此解析器的行为按键分三档定死：

| 输入情况                                                                                                               | 解析器行为                   | 理由                                       |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------ |
| `dtoVersion` 不等于 `ENTITY_FIELDS_DTO_VERSION`                                                                        | 显式失败                     | 语义可能已变，无法安全解释                 |
| **未知键**（任意协议对象层级）                                                                                         | 忽略并从返回值中丢弃，不报错 | 这是「新增可选字段不升版本」成立的唯一前提 |
| **已知键**缺失、类型错误、取值越界、违反联合或 INV-5/6                                                                 | 显式失败                     | 已知键的语义是契约的一部分                 |
| 非 JSON-safe 值（`undefined`、函数、symbol、非有限数、`Date`、`Uint8Array`、`bigint`、`Map`、`Set`、循环引用或类实例） | 显式失败                     | DTO 的 JSON-safe 是硬约束                  |

推论：**「往返无损」的口径限定为同一库版本内的生产与解析**。跨版本只保证已知键无损，
新版本新增的可选键在旧解析器处会被丢弃——这是有意的，不是 bug，消费方不得依赖解析器透传未知键。
「任意协议对象层级」包括顶层、字段、`format`、`relation`、单个 `options` 展示项和
`keyValueSchema` 条目。Record 的业务键（例如 enum 值）不是协议键，不得当成未知键删除。
解析顺序固定为：先对完整输入做 JSON-safe 检查，再执行版本、已知键和联合校验，最后构造只含已知键的
新对象；因此未知键里藏着函数或 `Date` 也必须失败，不能借“未知键会丢弃”绕过 JSON-safe 闸门。

「非法字段联合」包括：`source` 判别值与其依赖的必填键组合不满足 INV-5
（`source: relation` 必须有 `relation` 子对象、`source: computed` 必须 `readonly: true`、关系不得带 `format`），
以及某个 format 携带其他已知 format 的配置键（例如 `url` 携带 `currency`）。它不包括单纯出现协议未知键。

解析器不得通过类型断言或静默删除**已知**字段来"修复"输入。

### D7 — DTO 只包含 `valueType`，不再重复输出 `type`

- `valueType`：对 `property` / `computed` / `system` 是其 `PropertyType`
- 对 `relation` 是**关联实体主键的 `PropertyType`**（`uuid` / `string` / `integer` / `bigint`）
- 关系的结构信息放在独立的 `relation: { kind, entity, namespace, mutation, writeField? }` 子对象里

**关联实体主键类型必须显式解析**：`EntityMetadata` 只存 `mappedEntity` / `mappedNamespace` 两个名字，本实体元数据里没有目标实体的主键类型；调用方应通过 `SchemaManager.getEntityMetadata()` 构造解析器。解析目标必须恰好有一个 `primary: true` 属性，且类型只能是 `uuid` / `string` / `integer` / `bigint`；缺少主键或类型不支持时分别按 `missingRelationPrimary` / `unsupportedRelationValueType` 报错，不猜 `uuid`：

```ts
export type EntityMetadataResolver = (entity: string, namespace: string) => EntityMetadata | undefined;

export interface EntityRelationResolutionErrorDetails extends Omit<EntityMetadataValidationError, 'rule'> {
  rule: 'missingRelationPrimary' | 'unsupportedRelationValueType';
  targetEntity: string;
  targetNamespace: string;
}

export class EntityRelationResolutionError extends RxDBError {
  constructor(readonly details: EntityRelationResolutionErrorDetails) {
    super(details.message);
    this.name = 'EntityRelationResolutionError';
  }
}

export function describeEntityFields(metadata: EntityMetadata, resolve: EntityMetadataResolver): EntityFieldsDescriptor;
```

**`resolve` 是必填参数，不是 `resolve?`。** 早期草案写成可选，理由是"实体无关系时可省略"——
但那样类型系统就会放行一个在有关系时必然抛错的调用，把编译期能挡住的错误推迟到运行时，
正是「消除特殊情况、不加 fallback」要禁掉的形状。调用方拿到 `EntityMetadata` 的地方总有
`SchemaManager`，传一个 `getEntityMetadata` 的引用没有成本；无关系实体传进去也不会被调用。

- `resolve` 返回 `undefined`：抛 `RxDBError`，消息含关系名与目标实体名。**不得**回退成 `uuid`、不得省略 `valueType`（INV-4：`valueType` 缺位或与 `cardinality` 分歧即是 bug，不是降级路径）。
- 目标实体缺少唯一主键或主键类型不在允许集合时，抛 `EntityRelationResolutionError`；它本身 `extends RxDBError`，结构化信息放在只读 `details`，不得只把 `rule`、关系字段和目标实体拼进 message。

### D8 — `columnName` 不进入 DTO

物理列名是持久化实现细节，透传等于把 schema 泄露给前端和网络。DTO 只输出逻辑字段名。

### D9 — 关系在 DTO 里用**关系名**做 `field`，同时提供逻辑写入映射

`relationMap` 以关系名为键（`order`），`foreignKeyRelationMap` 以 `${name}Id` 为键（`orderId`，见 [metadata-transition.ts:295](../../../packages/rxdb/src/entity/metadata-transition.ts#L295)）；外键列**不在 `propertyMap` 里**，是从关系派生的。1:1 / m:1 有两个候选名，1:m / m:n 只有关系名。

定死：DTO 遍历 `relationMap`，`field` 一律取**关系名**，四种 kind 表达一致；`orderId` 这类外键列不作为独立字段出现。1:1 / m:1 的 `relation.writeField` 必须是逻辑属性名 `${name}Id`，不是数据库 `columnName`；其 `mutation` 为 `set-remove`。1:m / m:n 不产生 `writeField`，其 `mutation` 为 `add-remove`。这样前端仍面向关系名展示，同时能通过 DTO 完成正确的关系写入操作。

这与 `extractEntityFields()` 用 `orderId` 做 `field` 的行为**不同**，是 D5「故意不对齐」的一部分，不是回归；新 DTO 不得要求消费方猜测 `${name}Id`。

关系字段的 `readonly: true` 与 `writeField` / `mutation` 并存不矛盾，含义定死为：**该字段不能像普通属性那样被直接赋值**，而不是「不可变更」。关系的变更入口只有 `relation.writeField`（1:1 / m:1 写逻辑外键属性）与 `relation.mutation`（1:m / m:n 走增删语义）。消费方据此把关系渲染成关系选择器而不是可编辑文本框，同时仍然知道该往哪里写；D11 的 `validateFieldValue()` 对关系字段也据此只校验 ID 形状。

### D10 — `default` 一律不进入 DTO

不区分工厂函数和常量：常量 default 也不输出。理由是 default 的完整语义还包含 `'CURRENT_TIMESTAMP'` 这类 adapter 侧字面量（见 `DateProperty.default`）和 `Uint8Array` / `bigint` 等非 JSON-safe 值，逐类型定义通信表示是独立议题。前端需要初始值时走创建接口，不从字段描述里读。

**DTO 不输出 default 不等于生成器可以丢失 default 语义。** 生成器规则固定如下：

| metadata `default`                                              | 生成器行为                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `string` / `boolean` / 有限 `number` / JSON-safe 数组和普通对象 | 输出等价 JS 字面量                                                 |
| `bigint`                                                        | 输出十进制 bigint 字面量，如 `7n`                                  |
| `Uint8Array`                                                    | 输出 `new Uint8Array([...])`，只取当前视图字节                     |
| 有效 `Date`                                                     | 输出 `new Date('<ISO>')`                                           |
| `'CURRENT_TIMESTAMP'`                                           | 原样输出该字符串字面量                                             |
| 任意函数，包括 `() => new Date()`、`() => uuid()` 和闭包        | 抛 `Error`，message 含实体名、字段名和 `unsupportedDefaultFactory` |
| 其他值、循环引用、非有限数或非法 `Date`                         | 抛 `Error`，message 含实体名、字段名和 `unsupportedDefaultValue`   |

运行时函数对象不携带可靠的闭包与 import 信息，本故事禁止用 `Function#toString()` 猜测源码。若未来需要保留工厂，必须由独立 story 定义可序列化表达式或基于 AST 的依赖协议。

从“静默丢弃函数 default”改成“生成期失败”是有意的用户可见行为变化。阶段 C 的 PR 必须标注
`BREAKING CHANGE`，并在迁移说明中要求生成器用户把函数 default 移到可表达的常量、实体构造逻辑
或创建接口；不得把它包装成无行为变化的 patch fix。

### D11 — 值校验新增吃 `EntityFieldDescriptor` 的入口，旧签名不动

`validateEntityFieldValue(field: EntityFieldConfig, value)` 读的是 `field.type` / `field.enumValues`，而 format、`enum`、`options` 只存在于新 DTO —— 给 `EntityFieldConfig` 加 `format` 会同时破坏 D5 的冻结和 D5「不对齐命名」的边界。

定死：新增 `validateFieldValue(descriptor: EntityFieldDescriptor, value: unknown): FieldValidationError | null`。新函数先复用旧函数的 required、基础类型、日期、enum、JSON 规则，再增加 `stringArray`、`numberArray` 与 format 校验；旧 `validateEntityFieldValue` 签名、行为、输出全部不变，同样加 `@deprecated` 指向新函数。关系字段按 `relation.mutation` 只校验 ID 形状，不访问 repository。

### D12 — 校验错误值必须是 JSON-safe 且默认不回显加密值

```ts
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

export type FieldValidationRule =
  | 'required'
  | 'type'
  | 'uuid'
  | 'number'
  | 'integer'
  | 'date'
  | 'enum'
  | 'json'
  | 'stringArray'
  | 'numberArray'
  | 'url'
  | 'urlScheme'
  | 'email'
  | 'phone'
  | 'range'
  | 'multiSelect';

export interface FieldValidationError {
  field: string;
  message: string;
  rule?: FieldValidationRule;
  value?: JsonValue;
}
```

`value` 的规范化规则固定为：`Date` 转 ISO 8601 字符串，`bigint` 转十进制字符串，`Uint8Array` 转小写 hex 字符串；函数、`Map`、实体实例和无法安全转换的值省略 `value`。`encrypted: true` 的字段始终省略 `value`，不得把原始秘密值放进错误对象。

### D13 — 加密列约束留在加密 adapter，不上提到 core

`encrypted: true` + `sortable: true` 的拒绝**已经**由 `@aiao/rxdb-adapter-encrypted` 在 adapter init 时执行（[metadata-validation.ts:245](../../../packages/rxdb-adapter-encrypted/src/metadata-validation.ts#L245)，抛 `EncryptedConfigurationError`，code `encrypted_sortable_forbidden`，既有 `metadata-validation.spec.ts` 已覆盖）。core 的 `transitionMetadata` 只收集 `encryptedPropertyMap`，并明确注释「不在此处校验冲突，校验由 `@aiao/rxdb-adapter-encrypted` 在 adapter init 时进行，避免反向依赖」（[metadata-transition.ts:264](../../../packages/rxdb/src/entity/metadata-transition.ts#L264)）。

定死：本故事**不**把这条约束搬进 `validateEntityMetadata()` —— D3 的 `MetadataValidationRule` 里没有 encrypted 相关规则是有意的，不是遗漏。`describeEntityFields()` 对 `encrypted` / `sortable` 忠实输出元数据声明：未装加密 adapter 时该组合在 core 里合法，DTO 擅自把 `sortable` 改写成 `false` 会与 D1「DTO 只是元数据的只读投影」冲突，制造第二个真相源，也会让 AC#21 的「支持但关闭输出 `false`」与「被裁剪成 `false`」不可区分。加密语义在本故事里只落到一处：D12 规定错误对象对 `encrypted: true` 字段省略 `value`。

## Teable 字段映射

| Teable 字段             | Aiao 映射                                             | 通信值                                           | 本故事范围                                      |
| ----------------------- | ----------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------- |
| 单行文本                | `PropertyType.string` + `plainText/url/email/phone`   | `string`                                         | ✅                                              |
| 多行文本                | `PropertyType.string` + `multilineText`               | `string`                                         | ✅                                              |
| 富文本                  | `PropertyType.string` + `richText`                    | `string`                                         | ✅，必须声明内容格式                            |
| 数字                    | `PropertyType.number` + `number`                      | `number`                                         | ✅ 定义语义；`decimal` 与十进制字符串值另开故事 |
| 单项选择                | `PropertyType.enum` + `singleSelect`                  | `string`                                         | ✅                                              |
| 多项选择                | `PropertyType.stringArray` + `enum` + `multiSelect`   | `string[]`                                       | ✅ 见 D2                                        |
| 日期                    | `PropertyType.date` + `dateTime`                      | 现有契约：运行时 `Date`，wire 层 ISO 8601 字符串 | ✅ 仅描述 metadata；不实现或改变值 codec        |
| 勾选                    | `PropertyType.boolean`                                | `boolean`                                        | ✅ 兼容现有类型                                 |
| 附件                    | —                                                     | —                                                | ❌ 缺引用转换层，整体推迟（D4）                 |
| 创建时间 / 最后修改时间 | 现有系统字段 + `source: system`                       | ISO 8601 字符串                                  | ✅ 描述只读语义                                 |
| 创建者 / 最后修改者     | 现有 `createdBy` / `updatedBy`，元数据声明为 `string` | `string`（UUID 原样）                            | ⚠️ `valueType: 'string'`，不做用户语义          |
| 用户                    | —                                                     | —                                                | ❌ 缺引用转换层，整体推迟（D4）                 |
| 链接                    | `RelationKind`                                        | 遵守现有关联值契约                               | ✅ 仅描述 relation DTO；不新增或改变值编码      |
| 公式 / 汇总             | 现有计算属性 + `source: computed`                     | 由结果类型决定                                   | ⚠️ 不实现公式引擎                               |
| 自动编号                | `integer` 只读生成字段                                | `number`                                         | ⚠️ 生成策略另开故事                             |
| 评分                    | `number` + `rating`                                   | `number`                                         | ✅ 定义 `min/max/step`                          |
| 持续时间                | `number` + `duration`                                 | `number`                                         | ✅ 必须声明单位                                 |
| 按钮                    | 非持久化 action descriptor                            | 无字段值                                         | ❌ 不作为 PropertyType                          |

## 字段语义契约

### format

第一阶段支持以下格式。下列接口必须从 `@aiao/rxdb` 导出；`kind` 是唯一判别字段，配置字段不得跨格式复用。

```ts
export interface PlainTextFormat {
  kind: 'plainText';
}
export interface MultilineTextFormat {
  kind: 'multilineText';
}
export interface RichTextFormat {
  kind: 'richText';
  contentType: 'text/markdown' | 'text/html';
}
export interface UrlFormat {
  kind: 'url';
  schemes?: readonly string[];
}
export interface EmailFormat {
  kind: 'email';
}
export interface PhoneFormat {
  kind: 'phone';
}
export interface CodeFormat {
  kind: 'code';
  language?: string;
}
export interface ColorFormat {
  kind: 'color';
  colorSpace?: 'hex' | 'rgb' | 'hsl' | 'hsv' | 'lab' | 'lch';
}
export interface NumberFormat {
  kind: 'number';
  min?: number;
  max?: number;
  step?: number;
}
export interface CurrencyFormat {
  kind: 'currency';
  currency: string;
  min?: number;
  max?: number;
  step?: number;
}
export interface PercentageFormat {
  kind: 'percentage';
  scale: '0..1' | '0..100';
  min?: number;
  max?: number;
  step?: number;
}
export interface RatingFormat {
  kind: 'rating';
  min: number;
  max: number;
  step: number;
}
export interface DurationFormat {
  kind: 'duration';
  unit: 'ms' | 's' | 'min' | 'h' | 'd';
  min?: number;
  max?: number;
  step?: number;
}
export interface DateTimeFormat {
  kind: 'dateTime';
  timezone?: string;
  display?: 'date' | 'time' | 'datetime';
}
export interface SingleSelectFormat {
  kind: 'singleSelect';
}
export interface MultiSelectFormat {
  kind: 'multiSelect';
}

export type FieldFormat =
  | PlainTextFormat
  | MultilineTextFormat
  | RichTextFormat
  | UrlFormat
  | EmailFormat
  | PhoneFormat
  | CodeFormat
  | ColorFormat
  | NumberFormat
  | CurrencyFormat
  | PercentageFormat
  | RatingFormat
  | DurationFormat
  | DateTimeFormat
  | SingleSelectFormat
  | MultiSelectFormat;
```

`currency` 只校验 ISO 4217 的代码形状 `/^[A-Z]{3}$/`，本故事不内置会随时间变化的货币分配表；`schemes` 中每项必须匹配 `/^[A-Za-z][A-Za-z0-9+.-]*$/`，按 ASCII 小写去重并以不带冒号的原值输出；`language`、`timezone` 非空时原样透传，`timezone` 在本故事中是 opaque hint，不验证 IANA 数据库；`percentage.scale` 是两个字符串字面量之一，不是任意数值范围。

第一阶段支持以下格式：

| format          | 适用载体                  | 必填配置                                  | 默认前端行为           |
| --------------- | ------------------------- | ----------------------------------------- | ---------------------- |
| `plainText`     | `string`                  | 无                                        | 单行文本               |
| `multilineText` | `string`                  | 无                                        | 多行文本               |
| `richText`      | `string`                  | `contentType: text/markdown \| text/html` | 富文本编辑器或只读渲染 |
| `url`           | `string`                  | 可选 `schemes`                            | 链接预览、打开链接     |
| `email`         | `string`                  | 无                                        | 邮箱输入、`mailto:`    |
| `phone`         | `string`                  | 无                                        | 电话输入、`tel:`       |
| `code`          | `string`                  | 可选 `language`                           | 代码编辑器、语法高亮   |
| `color`         | `string`                  | 可选颜色空间                              | 颜色选择器和色板       |
| `number`        | `number` / `integer`      | 可选 `min/max/step`                       | 数字输入和格式化       |
| `currency`      | `number` / 后续 `decimal` | `currency: ISO 4217`                      | 货币格式化             |
| `percentage`    | `number` / 后续 `decimal` | `scale: 0..1 \| 0..100`                   | 百分比输入和展示       |
| `rating`        | `number` / `integer`      | `min/max/step`                            | 星级或数字评分         |
| `duration`      | `number` / `integer`      | `unit: ms \| s \| min \| h \| d`          | 时长格式化             |
| `dateTime`      | `date`                    | 可选 `timezone/display`                   | 日期时间控件           |
| `singleSelect`  | `enum`                    | `enum`（已必填）                          | 单选下拉或标签         |
| `multiSelect`   | `stringArray`             | `enum`（D2 新增，此时必填）               | 多选下拉或标签组       |

所有 format 的载体都是**属性**。`attachment` / `user` 不在第一阶段（D4）。

`format` 使用可判别对象，而不是无配置字符串。例如：

```ts
{
  name: 'homepage',
  type: PropertyType.string,
  format: { kind: 'url', schemes: ['https'] }
}

{
  name: 'content',
  type: PropertyType.string,
  format: { kind: 'richText', contentType: 'text/markdown' }
}
```

富文本通信格式必须是 `text/markdown` 或 `text/html`。禁止把 TipTap、Quill 等编辑器私有 JSON 直接作为公共协议；编辑器文档需要独立的版本化协议。**本层不做净化，也不承诺内容安全**：`contentType` 仅在合法联合类型内透传，净化责任归渲染方（见「范围边界」）。

### 注册期校验规则

按 D4，下表的**结构规则**由窄类型 format 优先在编译期拦截；值语义只能在运行时判定。`validateEntityMetadata` 是给未类型化元数据来源（生成器回填的 JSON、直接调用 `transitionMetadata()`、跨版本 d.ts 漂移）兜底的运行时闸门。它必须覆盖所有类型层结构规则，并补齐值语义，不能因输入形状畸形而自身抛出非聚合异常。每条违规产出一个带实体名、字段名和规则标识的错误，跨实体聚合后一次抛出（D3）。

| 规则                           | 判定                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unknownFormat`                | `format.kind` 不在支持列表内                                                                                                                                                   |
| `formatTypeMismatch`           | `format.kind` 与属性的 `PropertyType` 不匹配                                                                                                                                   |
| `formatOnRelation`             | 关系元数据上出现 `format`（D4：四种 kind 一律不接受）                                                                                                                          |
| `missingFormatConfig`          | `richText` 缺 `contentType`、`currency` 缺 `currency`、`percentage` 缺 `scale`、`duration` 缺 `unit`、`rating` 缺 `min/max/step`                                               |
| `invalidFormatConfig`          | `format` 非普通对象、缺合法 `kind`、含当前 kind 不允许的键，或 `contentType`、货币代码、`scale/unit/colorSpace/display`、非空 `language/timezone`、scheme 语法及大小写去重非法 |
| `invalidRange`                 | `min > max`、`step <= 0`、非有限数、`rating` 端点不能按 step 对齐，或 percentage 的 `min/max` 超出其 `scale` 固有值域                                                          |
| `missingEnum`                  | `EnumProperty`，或声明 `multiSelect` / `options` 的 `stringArray` 没有非空 `enum`                                                                                              |
| `invalidEnumConfig`            | 已声明的 `enum` 不是数组或含非字符串元素                                                                                                                                       |
| `duplicateEnum`                | `enum` 中存在重复值                                                                                                                                                            |
| `enumOptionsMismatch`          | `options` 的键不是 `enum` 的子集                                                                                                                                               |
| `invalidOptionsConfig`         | `options` 不是普通对象，展示项不是普通对象，或 `label/color/disabled` 的类型错误、出现未知展示键                                                                               |
| `cardinalityConflict`          | `multiSelect` 用在 `enum` 上、`singleSelect` 用在 `stringArray` 上                                                                                                             |
| `missingRelationPrimary`       | DTO 关系目标没有恰好一个 `primary: true` 属性（D7；由关系目标解析阶段报告）                                                                                                    |
| `unsupportedRelationValueType` | DTO 关系目标主键类型不是 `uuid` / `string` / `integer` / `bigint`（D7；由关系目标解析阶段报告）                                                                                |

每个字段的同一 `rule` 最多产生一条错误。依赖形状的规则只有在前置形状合法时才继续：非法 `format`
对象不再判断 kind/范围，非法 `enum` 不再判断重复值或 options 子集，非法 `options` 不再判断键越界。
错误 message 可以列出全部重复值或越界键，但不得靠同一 rule 重复多条来表达。

校验的处置方式只有一种：**报错**。不得静默降级为 `string`，不得吞掉未知 `format`，尤其**不得为了迁就 `format` 去改写字段的 `PropertyType` 或单值/多值形态**（INV-2、INV-3）。`formatTypeMismatch` 与 `cardinalityConflict` 的正确修法始终是作者改声明，而不是运行时替作者改类型。

`validateFieldValue()` 的格式值规则固定如下：

- `url` 使用 WHATWG `URL` 解析；配置 `schemes` 时取 `url.protocol` 去掉末尾冒号并转 ASCII 小写，与同样小写化的白名单比较
- `email` 使用“无空白、恰好一个 `@` 且域名含 `.`”的保守规则
- `phone` 使用“可选 `+`，其余仅数字、空格、括号和连字符，长度 3～32”的规则
- 数字格式只接受有限 `number`；先校验 `min/max`，再以 `base = min ?? 0` 校验 step。令 `q = (value - base) / step`，当 `abs(q - round(q)) <= Number.EPSILON * max(1, abs(q)) * 8` 时视为命中 step
- `rating` 要求 `min < max`，且 `(max - min) / step` 按同一容差为整数，保证两个端点都可选
- `percentage` 的固有值域由 `scale` 决定：`0..1` 对应 `[0, 1]`，`0..100` 对应 `[0, 100]`；声明的 `min/max` 必须落在固有值域内，实际校验取二者交集
- `multiSelect` 要求字符串数组且每项存在于 `enum`；`options.disabled` 不参与合法性判定

### 通信 DTO

新增 JSON-safe 的实体字段描述。它只描述字段元数据，不包含实体记录值。

```ts
export const ENTITY_FIELDS_DTO_VERSION = 1; // D6，唯一真相源

export interface EntityFieldsDescriptor {
  dtoVersion: typeof ENTITY_FIELDS_DTO_VERSION; // D6
  entity: string;
  namespace: string;
  fields: EntityFieldDescriptor[];
}

interface EntityFieldDescriptorBase {
  field: string;
  displayName: string;
  cardinality: 'single' | 'multiple'; // D1，派生
  valueType: `${PropertyType}`;
  format?: FieldFormat;
  readonly: boolean;
  nullable: boolean;
  required: boolean;
  unique: boolean;
  encrypted: boolean;
  sortable?: boolean;
  searchable?: boolean;
  primary?: boolean;
  enum?: readonly string[];
  options?: Readonly<Record<string, { label?: string; color?: string; disabled?: boolean }>>;
  keyValueSchema?: Record<string, KeyValueSchemaEntry>;
}

export interface EntityPropertyFieldDescriptor extends EntityFieldDescriptorBase {
  source: 'property' | 'system';
  relation?: never;
}

export interface EntityComputedFieldDescriptor extends EntityFieldDescriptorBase {
  source: 'computed';
  readonly: true;
  relation?: never;
}

export type EntityRelationFieldDescriptor = Omit<EntityFieldDescriptorBase, 'format' | 'valueType'> & {
  source: 'relation';
  readonly: true;
  format?: never;
  valueType: `${PropertyType.uuid | PropertyType.string | PropertyType.integer | PropertyType.bigint}`;
  relation: {
    kind: `${RelationKind}`;
    entity: string;
    namespace: string;
    mutation: 'set-remove' | 'add-remove';
    writeField?: string;
  };
};

export type EntityFieldDescriptor =
  EntityPropertyFieldDescriptor | EntityComputedFieldDescriptor | EntityRelationFieldDescriptor;

export function describeEntityFields(
  metadata: EntityMetadata,
  resolve: EntityMetadataResolver // D7，必填；无关系实体也要传，不做可选特例
): EntityFieldsDescriptor;

export function parseEntityFieldsDescriptor(value: unknown): EntityFieldsDescriptor;
```

约束：

- 覆盖 `propertyMap`、`computedPropertyMap`、`relationMap`（含 `1:m` / `m:n`）与系统字段；系统字段以 `source: 'system'` 输出，不再像 `extractSystemFields` 那样单独成表
- 关系字段的 `field` 取关系名，外键列不单独成字段；1:1 / m:1 必须带逻辑 `relation.writeField`，1:m / m:n 必须带 `mutation: 'add-remove'`（D9）
- 计算属性必须输出其真实 `valueType` 且 `readonly: true`，不得塌缩成 `'computed'`
- `readonly` / `nullable` / `required` / `unique` / `encrypted` 是通用语义，始终输出 `true` 或 `false`；`sortable` / `searchable` / `primary` 只有在对应属性接口支持时输出，支持但关闭时输出 `false`，不支持时省略。这样消费方不需要猜测默认值，也不会把“不支持”和“支持但关闭”混为一谈
- 不得包含 `Map`、函数、实体实例、`Date`、`Uint8Array`、`columnName`（D8）或框架组件引用
- `default` 一律不进入 DTO，工厂函数和常量都不输出（D10）
- `encrypted` 与 `sortable` 一律按元数据声明**忠实输出**，DTO 不代替加密 adapter 做裁剪（D13）
- `fields` 顺序严格遵守 INV-6；`enum` 顺序原样保留；`options` 只复制 JSON-safe 的展示元数据
- `parseEntityFieldsDescriptor()` 必须校验 `dtoVersion`、字段判别联合、关系主键类型、布尔字段和 JSON-safe 约束；未知版本显式失败

### 值校验扩展

`FieldValidationError` 与 `JsonValue` 的完整定义见 D12。它们按纯 additive 方式扩展，既有 `{ field, message }` 形状不变；新函数只为新增错误补充 `rule` 和规范化后的 `value`。

新增 `validateFieldValue(descriptor: EntityFieldDescriptor, value)`（D11），实现旧函数全部基础规则、`stringArray` / `numberArray` 分支与 format 相关校验（`url` 的 `schemes`、`email` / `phone`、`number` 系的 `min/max/step`、`percentage` 值域、`multiSelect` 的选项合法性）。旧 `validateEntityFieldValue(field: EntityFieldConfig, value)` 行为不变。

> 两者都是**纯函数**，返回错误对象而不抛出；当前都不在写路径上，本故事也不把它们接进写路径（见 Out of Scope）。

## 范围边界

### In Scope

- 新增字段语义层：**逐属性接口**的窄类型 `format`（关系四种 kind 一律不接受，D4），`cardinality` / `source` 作为派生量（D1）
- `StringArrayProperty` 新增可选 `enum`，`EnumProperty` / `StringArrayProperty` 新增可选 `options`（D2）
- 新增 `validateEntityMetadata`，在 `EntityManager.init()` 跨实体聚合后抛错（D3）
- 新增 `describeEntityFields()`、`EntityFieldsDescriptor`、`EntityRelationResolutionError` 与 `ENTITY_FIELDS_DTO_VERSION`（D5～D10、D13），覆盖多值关系与计算属性 `valueType`
- 新增严格的 `parseEntityFieldsDescriptor()` 反序列化入口：未知版本、非法字段联合、非 JSON-safe 值和关系解析缺口都显式失败；任意协议层级的未知键按 D6.1 丢弃
- `EntityFieldConfig` / `extractEntityFields()` / `extractSystemFields()` / `validateEntityFieldValue()` 输出**逐字节不变**，仅加 `@deprecated` 注释（D5、D11）
- 新增 `validateFieldValue()`：`stringArray` 分支与 format 校验（D11）；`FieldValidationError` additive 扩展；该纯函数不接入 repository 写路径
- 生成器透传新语义元数据，并按 D10 确定性输出支持的常量 `default`；函数工厂与其他不支持值显式失败，禁止静默丢弃
- 三框架只复用 core 的 DTO 类型与 `parseEntityFieldsDescriptor()`，并从 `@aiao/rxdb-test` 导入同一份契约 fixture，不增加专属语义 API
- 更新 `requirements/api-baseline/rxdb.json`

### Out of Scope

- 把 `validateEntityFieldValue` 或 `validateFieldValue` 接入 repository 写路径（属 US-004 范畴）
- 把加密列约束（`encrypted_sortable_forbidden` 等）从 `@aiao/rxdb-adapter-encrypted` 上提到 core 注册期校验（D13）
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

| #   | 前置条件                                                                             | 操作                                            | 预期结果                                                                                                                                                                                           | 状态 |
| --- | ------------------------------------------------------------------------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 现有实体只声明 `PropertyType`                                                        | 注册并读取旧元数据                              | 行为与既有公共类型不变；未声明 `format` 的字段在元数据里不出现 `format` 键，不填默认值                                                                                                             | ⬜   |
| 2   | `string` 字段声明 `url` / `email` / `phone`                                          | 编译并注册实体                                  | 类型合法；元数据保留 format 判别对象；生成的物理列类型仍是字符串                                                                                                                                   | ⬜   |
| 3   | 同一实体的两份元数据，唯一差异是其中一份字段带 `format`                              | 分别生成 schema、写入同一份数据、读回并序列化   | 物理列类型、运行时值类型与序列化结果完全一致（INV-2）                                                                                                                                              | ⬜   |
| 4   | `string` 字段声明 `richText`                                                         | 未提供 `contentType`                            | 类型测试（`@ts-expect-error` + `expectTypeOf`）确认声明不可编译；绕过类型的运行时配置在 `EntityManager.init()` 抛 `RxDBError`，消息含实体名、字段名与 `missingFormatConfig`                        | ⬜   |
| 5   | `enum` 字段声明 `multiSelect`，或 `stringArray` 声明 `singleSelect`                  | 注册实体                                        | 抛 `cardinalityConflict`；多选必须用带 `enum` 的 `stringArray`（INV-3）                                                                                                                            | ⬜   |
| 6   | `number` 字段声明 `currency` / `percentage` / `rating` / `duration`                  | 注册缺少配置、非法范围、step 或 percentage 边界 | 抛 `missingFormatConfig` / `invalidRange`；覆盖非有限数、rating 端点未对齐和 scale 固有值域；同一实体多个字段错误一次报出                                                                          | ⬜   |
| 7   | `config.entities` 中有两个实体各带违规字段                                           | `EntityManager.init()`                          | 一次异常同时报出两个实体的全部违规（D3 跨实体聚合），不在第一个实体处中断；`boundTypes` 全部回滚，无残留注册                                                                                       | ⬜   |
| 8   | `stringArray` 声明 `multiSelect` 但缺 `enum`；或 `options` 键越界                    | 注册实体                                        | 分别抛 `missingEnum` / `enumOptionsMismatch`                                                                                                                                                       | ⬜   |
| 9   | `enum` 含重复值                                                                      | 注册实体                                        | 抛 `duplicateEnum`，错误指出字段名和重复值                                                                                                                                                         | ⬜   |
| 10  | 关系元数据上声明任意 `format`                                                        | 类型检查 + 绕过类型后注册实体                   | 四种 kind 的关系接口在类型层均不接受 `format`（`@ts-expect-error`）；运行时注册抛 `formatOnRelation` 并指出关系名（D4）                                                                            | ⬜   |
| 11  | 使用未知 `format.kind`、与 `PropertyType` 不匹配的组合、畸形 enum/options 或非法配置 | 注册实体                                        | 分别抛 `unknownFormat` / `formatTypeMismatch` / `invalidEnumConfig` / `invalidOptionsConfig` / `invalidFormatConfig`；校验器对 `format: null`、非数组 enum 等 `unknown` 形状也聚合报错，不自身崩溃 | ⬜   |
| 12  | 同一组结构 fixture 与值语义 fixture                                                  | 分别走类型检查与 `validateEntityMetadata()`     | 结构 fixture 满足单向不变式：类型拒绝则运行时拒绝，运行时接受则类型合法；`min > max`、重复 enum、非法 scheme/货币代码等值语义允许“类型接受、运行时拒绝”，并逐项覆盖（D4）                          | ⬜   |

> **AC#12 为什么单独成条**：类型层和运行时层仍可能在可静态表达的结构规则上漂移。
> 落地方式：载体映射与 `kind` 列表共用 `as const` 数据源；类型级与运行时测试读取同一组结构 fixture。
> 值语义 fixture 单独维护，明确验证它们只能由运行时拒绝，不再伪造“TypeScript 能证明数值和字符串内容”的假门禁。

### 阶段 B — 实体字段描述 DTO（AC#13～26）

| #   | 前置条件                                                                      | 操作                                                                                       | 预期结果                                                                                                                                                                                                                                                                  | 状态 |
| --- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 13  | `richText` 声明 `text/markdown` 或 `text/html`                                | 生成字段 DTO                                                                               | DTO 原样保留 `contentType`；不包含编辑器私有 JSON 结构；**不做净化、不断言内容安全**                                                                                                                                                                                      | ⬜   |
| 14  | `enum` 字段包含 `options` 展示元数据                                          | 生成字段 DTO                                                                               | DTO 同时保留稳定 `enum` 顺序和 `label/color/disabled`；重命名 label 不改数据值                                                                                                                                                                                            | ⬜   |
| 15  | `date` 字段声明 `dateTime`                                                    | 生成字段 DTO 并做 JSON 往返                                                                | DTO 输出 `valueType: 'date'` 与 `format.kind: 'dateTime'`；不含 `Date` 实例；Date↔ISO、时区和 adapter 值 codec 按既有契约回归，不在本故事重新实现                                                                                                                         | ⬜   |
| 16  | 实体含 `1:1`、`m:1`、`1:m`、`m:n` 四种关系                                    | 调用 `describeEntityFields(metadata, resolve)`                                             | 四种关系全部出现且 `field` 均为**关系名**（D9）；无 `orderId` 之类外键字段；`cardinality` 按 D1 推导；含 `relation.kind/entity/namespace`；1:1 / m:1 带 `writeField: '${name}Id'` 与 `mutation: 'set-remove'`，1:m / m:n 带 `mutation: 'add-remove'`；均**不含** `format` | ⬜   |
| 17  | 实体含关系                                                                    | ①省略 `resolve` 编译；②传入返回 `undefined` 的 `resolve`                                   | ①`@ts-expect-error` 确认省略 `resolve` 不可编译（D7：签名必填，不做「无关系可省略」特例）；②抛 `RxDBError`，消息含关系名与目标实体名，**不**回退成 `uuid`、**不**省略 `valueType`（INV-4）                                                                                | ⬜   |
| 18  | 关系目标实体只有一个 `primary: true` 的 `string` 属性                         | 调用 `describeEntityFields(metadata, resolve)`                                             | 关系 DTO 的 `valueType` 为 `'string'`，而非默认猜测的 `'uuid'`；`relation` 结构和写入映射仍符合 D9                                                                                                                                                                        | ⬜   |
| 19  | 关系目标实体没有主键，或主键类型不在 `uuid/string/integer/bigint` 内          | 调用 `describeEntityFields(metadata, resolve)`                                             | 抛 `EntityRelationResolutionError` 且 `instanceof RxDBError`；`details` 保留关系字段、目标实体和 `missingRelationPrimary` / `unsupportedRelationValueType`，不得只检查 message                                                                                            | ⬜   |
| 20  | 计算属性 + `createdAt` / `updatedAt` / `createdBy` 系统字段存在               | 调用 `describeEntityFields()`                                                              | 计算属性输出真实 `valueType` 且 `readonly: true`；系统字段 `source: 'system'` 且 `readonly: true`；`createdBy` / `updatedBy` 的 `valueType` 为 `'string'`（元数据实际声明），无用户语义                                                                                   | ⬜   |
| 21  | 字段的通用布尔标志为 `false`，且能力字段未声明或为 `false`                    | 生成字段 DTO                                                                               | `readonly` / `nullable` / `required` / `unique` / `encrypted` 始终输出 `false`；`sortable` / `searchable` / `primary` 对支持该能力的字段输出 `false`，不支持该能力的字段省略键；`BinaryProperty` 不因缺少 `sortable` 而伪造 `false`                                       | ⬜   |
| 22  | 字段同时声明 `encrypted: true` 与 `sortable: true`                            | ①不装加密 adapter 时注册并生成 DTO；②单独跑 `@aiao/rxdb-adapter-encrypted` 的 adapter init | ①core 注册期**不**报错，DTO 忠实输出 `encrypted: true` 与 `sortable: true`，不做裁剪（D13）；②加密 adapter 仍抛 `encrypted_sortable_forbidden`，既有行为无回归                                                                                                            | ⬜   |
| 23  | 任意实体的字段 DTO                                                            | 执行 `parseEntityFieldsDescriptor(JSON.parse(JSON.stringify(dto)))` 并深比较               | 解析成功且往返无损；不含 `Map`、函数、`Date`、`Uint8Array`、`columnName`、`default`；`dtoVersion === ENTITY_FIELDS_DTO_VERSION`                                                                                                                                           | ⬜   |
| 24  | DTO 各协议层级被注入未知键、未知 `dtoVersion`、已知键类型错误、违反联合的组合 | 逐项调用 `parseEntityFieldsDescriptor()`                                                   | 顶层、字段、format、relation、options 展示项和 keyValueSchema 条目的未知键均被忽略且不出现在返回值中；Record 业务键保留；未知版本、已知键错误、跨 format 配置、非 JSON-safe 值与违反 INV-5 的组合显式失败                                                                 | ⬜   |
| 25  | 同一份元数据                                                                  | 调用 `extractEntityFields()` / `extractSystemFields()`                                     | 与实施前落库的基线快照零 diff（口径见脚注）；不新增任何字段、不改变键顺序；`@deprecated` 注释不改变运行时行为                                                                                                                                                             | ⬜   |
| 26  | 同一 metadata，以及内容相同但 Map 插入顺序相反的 metadata                     | 分别重复调用 `describeEntityFields()`                                                      | 同一 metadata 重复输出深相等；两份 metadata 都按 `propertyMap` → `computedPropertyMap` → `relationMap` 分组，并各自保留 Map 插入顺序；第二份允许组内顺序不同，以此证明没有隐式字母排序（INV-6）                                                                           | ⬜   |

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

### 阶段 C — 值校验、生成器透传与三框架契约（AC#27～37）

| #   | 前置条件                                                                                                  | 操作                                                              | 预期结果                                                                                                                                                                                                      | 状态 |
| --- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 27  | URL 字段声明 `schemes: ['HTTPS']`                                                                         | 对 `http://`、`https://` 与非 URL 文本调用 `validateFieldValue()` | `http` 返回 `urlScheme`，`https` 大小写无关地通过，非 URL 返回 `url`；错误 value 是 JSON-safe 字符串，不回显不可安全序列化对象                                                                                | ⬜   |
| 28  | `stringArray` + `enum` + `multiSelect`                                                                    | 对含非法选项值的数组调用 `validateFieldValue()`                   | 返回带字段名、`rule: 'multiSelect'` 和非法值的结构化错误；合法数组返回 `null`                                                                                                                                 | ⬜   |
| 29  | `FieldValidationRule` 的 16 条规则                                                                        | 参数化用例逐条走通过与失败两条路径                                | 每条规则至少各有一组用例；`range` 额外覆盖 `0.3/0.1` 浮点容差、step 不命中和 percentage 两种 scale；失败 rule 一一对应且不缺失；无任何规则只有 happy path                                                     | ⬜   |
| 30  | 值分别为 `Date`、`bigint`、`Uint8Array`、函数、`Map`、实体实例                                            | 触发校验失败并读取返回的 `value`                                  | 按 D12 规范化：ISO 8601 字符串 / 十进制字符串 / 小写 hex；后三类省略 `value`；`JSON.stringify(error)` 不抛且往返无损                                                                                          | ⬜   |
| 31  | 字段声明 `encrypted: true`                                                                                | 用任意非法值触发校验失败                                          | 错误对象**始终**省略 `value`（D12），无论该值本身是否 JSON-safe；`field`、`message`、`rule` 正常返回                                                                                                          | ⬜   |
| 32  | 四种关系的 `EntityFieldDescriptor`                                                                        | 对合法与非法 ID 值调用 `validateFieldValue()`                     | 只按 `relation.mutation` 校验 ID 形状（单值 vs 数组）与 `valueType`；不发起任何 repository / adapter 调用（用 spy 断言零调用），不校验目标记录是否存在                                                        | ⬜   |
| 33  | 同一份元数据与同一组值                                                                                    | 调用旧 `validateEntityFieldValue()`                               | 与实施前的输入/输出对表逐项一致（含返回 `null` 的分支）；`@deprecated` 注释不改变运行时行为                                                                                                                   | ⬜   |
| 34  | 实体元数据含 `format`、`enum`、`options`                                                                  | 运行生成器并编译输出                                              | 三者完整透传到生成代码且可编译；Angular / React / Vue 的类型表现一致                                                                                                                                          | ⬜   |
| 35  | 实体元数据分别含 JSON-safe 常量、bigint、Uint8Array 视图、Date、`'CURRENT_TIMESTAMP'`、函数工厂和不支持值 | 运行生成器                                                        | 前五类按 D10 生成并编译后保持值语义；后两类抛 `Error`，message 分别含 `unsupportedDefaultFactory` / `unsupportedDefaultValue`、实体名与字段名；禁止静默丢失或源码猜测；PR 标注 `BREAKING CHANGE` 并含迁移说明 | ⬜   |
| 36  | 现有 core、`rxdb-client-generator`、`rxdb-test` 及三框架契约测试                                          | 通过 Nx 执行回归                                                  | 既有字段、关系、计算属性与生成代码无回归；共享 fixture 包可构建；`packages/rxdb` 覆盖率 ≥ 90%                                                                                                                 | ⬜   |
| 37  | 三框架均已接入字段描述                                                                                    | 检查三端源码、依赖和 api-baseline                                 | fixture 位于 `@aiao/rxdb-test` 的 `cross-framework-fixtures`，三端以 devDependency 导入；直接复用 core parser，不跨包导入 `src/__tests__`；任一端都不新增专属语义 API，三端 api-baseline 相关导出为空集       | ⬜   |

> AC#34 / AC#35 是有意分开的两条：透传成功和「无法安全生成时失败」是两条相反的路径，
> 合成一行只要透传通过就容易被整行判绿。

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- `PropertyType` 继续作为存储和运行时判别联合；`url`、`richText` 等不新增物理列映射。
- `format` 使用判别对象（`{ kind, ...options }`），避免把 `currency`、`timezone`、`contentType` 等配置散落成互相冲突的可选字段。
- **仓库里有两个同名的 `transitionMetadata`，不要混淆**：`@aiao/rxdb` 的 `entity/metadata-transition.ts` 把 `EntityMetadataOptions` 合并成 `EntityMetadata`（装饰器求值时跑，见 D3）；`rxdb-client-generator` 的 `core/RxDBClientGenerator.utils.ts:306` 把 `EntityMetadata` 序列化成**字符串**回填 `Entity(...)`。本故事只在前者的产物上做校验，只对后者做透传回归。
- 生成器与 DTO 是两层契约：生成器源 metadata 按 D10 保留支持的常量 `default`，函数工厂一律显式失败；DTO 则有意不输出任何 `default`。禁止先 `JSON.stringify` 再假装函数从未存在。
- `parseEntityFieldsDescriptor()` 是 DTO 的唯一严格反序列化入口；它在解析时再次检查 `dtoVersion`、字段判别联合、JSON-safe 值、稳定顺序和关系 `valueType`。未知键必须规范化删除，已知键不得用类型断言、静默删除或默认值猜测来修复。
- DTO 生成顺序固定为 `propertyMap`（含系统字段）、`computedPropertyMap`、`relationMap`；关系使用逻辑 `writeField` 与 `mutation` 描述写入意图，绝不把数据库 `columnName` 或值 wire codec 混入 DTO。
- Date、bigint、binary 和关系值的运行时/远端 wire codec 继续遵守既有契约；本故事只验证 metadata DTO 的 JSON-safe 往返和纯函数校验，不新增 adapter、repository 或 API 编解码。
- Angular、React、Vue 只导入 core 的 DTO 类型和 parser；共享 fixture 放在 `@aiao/rxdb-test` 的 `cross-framework-fixtures`，三端通过 devDependency 导入，不复制语义，也不跨包引用 `src/__tests__` 私有路径。
- `entity-field.utils.ts` 中 `(prop as Record<string, unknown>)['readonly']` 与关系侧的 `nullable` 强转是多余的——两者都在 `IEntityObject` 上（1:1 / m:1 关系接口也 extends 它）。改这个文件时顺手清掉，但不得改变输出（D5 / AC#25）。
- 系统字段的 `valueType` 直接取 `propertyMap` 里的声明，**不要照抄 `extractSystemFields()` 的硬编码**：那里 `createdBy` / `updatedBy` 写死 `PropertyType.string`（[entity-field.utils.ts:121](../../../packages/rxdb/src/entity/entity-field.utils.ts#L121)），恰好与 `ENTITY_BASE_METADATA_OPTIONS` 一致，但 `id` 的 `uuid` 是硬编码的，实体可以用 `integer` / `bigint` 主键覆盖。新 DTO 一律读元数据。
- 附件与用户引用推迟的原因见 D4。后续 story 开工时的既有落点：附件可复用 `@aiao/rxdb-plugin-storage` 的 `file-meta.entity.ts`；用户引用需要先给 `createdBy` / `updatedBy` 定义关系或解析层。届时要一并回答的问题是「引用的远程 URL / 展示名从哪来、算不算实体值契约的一部分」——本故事不预设答案，也不预留字段。
- 百分比值域、step 基准与浮点容差按“注册期校验规则”后的算法执行；duration 必须明确单位；currency 只校验 `/^[A-Z]{3}$/` 代码形状，不依赖运行环境的货币表。
- 富文本 HTML 进入渲染器前必须经过净化；净化策略与编辑器实现属于后续 UI/安全 story，本故事只保证 `contentType` 无损传递。
- 新增公开类型、DTO 和 generator 输出必须更新 `requirements/api-baseline/`，并遵守兼容性与版本发布门禁。
- 本故事不新增物理 `PropertyType`，不进入 epic-005 的 bigint/binary 发布门禁。
- 校验点是「读到 metadata 之后、注册 manager 之前」，不需要也不应该重跑 `transitionMetadata()`（D3）。
  `validateEntityMetadata()` 必须是纯函数，返回按 `namespace/entity/field/rule` 排序的错误数组，不得在首个错误处抛出。
  `MetadataValidationRule` 联合在阶段 A 一次性定全 14 项，其中 `missingRelationPrimary` /
  `unsupportedRelationValueType` 由阶段 B 的关系解析阶段实际产出。
- `validateFieldValue()` 同样是纯函数：不读全局状态、不访问 repository、不做 I/O（AC#32 用 spy 断言）。
  它复用旧函数的 required、基础类型、日期、enum、JSON 规则，再叠加 `stringArray` / `numberArray` 与 format 校验（D11）。
  复用方式是**提取共享内部函数**，不是让新函数调用已冻结的旧函数——否则旧函数的行为改动会经由新函数外溢。
- 新 DTO 与旧结构**故意不对齐命名**（`valueType` vs `type`、`enum` vs `enumValues`、`relation.entity` vs
  `relatedEntityName`），不提供别名、不做双向转换（D5）。
- 覆盖率门禁：`packages/rxdb` ≥ 90%。

## 实现文件

按交付阶段归属，避免三个阶段同时改同一个文件：

| 文件                                                     | 阶段  | 内容                                                                                          |
| -------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------- |
| `packages/rxdb/src/entity/metadata-options.interface.ts` | A     | `format` 判别联合、逐属性窄类型 `format?`、`StringArrayProperty.enum` / `options`             |
| `packages/rxdb/src/entity/metadata-validate.ts`（新增）  | A     | `validateEntityMetadata` 与规则表                                                             |
| `packages/rxdb/src/entity/entity-manager.ts`             | A     | `init()` 跨实体聚合校验并抛错（D3）                                                           |
| `packages/rxdb/src/entity/entity-field.utils.ts`         | B     | DTO、parser、`EntityRelationResolutionError`、版本常量；既有导出冻结 + `@deprecated`          |
| `packages/rxdb/src/entity/entity-value.utils.ts`         | C     | `validateFieldValue()`；旧 `validateEntityFieldValue` 冻结 + `@deprecated`                    |
| `packages/rxdb-client-generator/src/`                    | C     | 生成器 `default` 语义保留与显式失败（`core/RxDBClientGenerator.utils.ts:306` 的透传点）       |
| `packages/rxdb-test/src/cross-framework-fixtures/`       | C     | 新增 `entity-fields-descriptor.ts` 并从既有 `index.ts` 导出，由 `@aiao/rxdb-test` 根入口共享  |
| `packages/rxdb-{angular,react,vue}/`                     | C     | 用 pnpm workspace 命令添加 `@aiao/rxdb-test` devDependency，复用同一组 DTO fixture 做契约回归 |
| `pnpm-lock.yaml`                                         | C     | 记录三框架测试依赖的 workspace 链接，不手改依赖图                                             |
| `requirements/api-baseline/rxdb.json`                    | A/B/C | 每个阶段各自追加，不集中一次改完                                                              |

## References

- [Teable GitHub](https://github.com/teableio/teable)
- [US-001 定义数据模型](./US-001-model-definition.md)
- [US-004 数据变更](./US-004-data-mutation.md)
- [US-011 定义 bigint 与 binary 类型及公共 API 契约](./US-011-property-type-bigint-binary.md)
- [US-402 代码编辑器组件](../ui/US-402-code-editor.md)
- [US-502 Storage 插件](../plugin/US-502-storage-plugin.md) — 附件语义的后续落点，本故事不依赖
