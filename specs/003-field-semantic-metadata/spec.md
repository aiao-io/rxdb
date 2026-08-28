# 字段语义元数据：设计原则、设计决策与契约

> 本文承载 [US-012 扩展字段语义与前端通信契约](../../requirements/stories/core/US-012-field-semantic-metadata.md)
> 的设计内容，从该 story 抽出。story 保留「作为/我想要/以便」、范围边界、验收标准、技术笔记与实现文件；
> 设计原则（核心不变式）、设计决策 D1～D13、Teable 字段映射与字段语义契约全文在此。
> 验收标准里以 `D#` 引用的决策，锚点见下方各 `### D#` 小节。

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
- **INV-5**：`source` 是 DTO 的判别字段。`source: relation` 必须有 `relation` 子对象，`source: computed` 必须 `readonly: true`，关系不得携带 `format`，1:m / m:n 关系不得携带 `nullable` / `required` / `unique` / `encrypted` / `writeField`（这些键在其元数据接口上根本不存在，输出即伪造）；解析器遇到不满足这些不变式的 JSON 必须失败。
- **INV-6**：字段 DTO 的 `fields` 顺序稳定且可复现：先按 `propertyMap` 的 **`Map` 迭代顺序**输出系统/普通属性，再按 `computedPropertyMap`，最后按 `relationMap`；各 Map 内不做任何重排，尤其不做隐式字母排序。
  「`Map` 迭代顺序」即插入顺序，由 [metadata-transition.ts:154](../../../packages/rxdb/src/entity/metadata-transition.ts#L154) 的 `metadataOptionsArray.reverse()` 决定：最远祖先在前、自身在最后；子类覆盖同名属性时 [metadata-transition.ts:165](../../../packages/rxdb/src/entity/metadata-transition.ts#L165) 的 `propertyMap.set()` **保留祖先的位置**，只替换值。DTO 不得对此做任何"规范化"补偿。

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

**`enum` 的约束力与 `format` 无关**（INV-1：`format` 是纯语义标注，不参与值判定）。只要字段声明了非空 `enum`，`validateFieldValue()` 就校验成员资格：`EnumProperty` 校验值本身，`StringArrayProperty` 逐项校验；两者共用 `rule: 'enum'`。声明 `multiSelect` 与否**不改变**这条判定，`multiSelect` 只决定前端默认渲染成多选控件。因此 `FieldValidationRule` 里**没有** `multiSelect` 规则——一个以 format 命名的值校验规则会让 format 反向影响值语义，正是 INV-1 要禁掉的形状。

### D3 — 注册期校验在 `EntityManager.init()` 绑定实体时执行，不在装饰器求值时

装饰器在模块加载时求值，在那里抛错会让整个 bundle 的 import 失败，且无法聚合多个字段错误。

`transitionMetadata` 已经在 `@Entity` 装饰器里跑完（[entity.decorator.ts:51](../../../packages/rxdb/src/entity/entity.decorator.ts#L51)），`EntityManager.init()` 拿到的就是合并好的 `EntityMetadata`（[entity-manager.ts:104](../../../packages/rxdb/src/entity/entity-manager.ts#L104) 的 `getEntityMetadata(EntityType)`）。因此校验点是「读到 metadata 之后、注册 manager 之前」，不需要也不应该再跑一次 transition。

**聚合粒度跨实体**：`init()` 是对 `config.entities` 的 forEach，若逐实体抛错，第一个坏实体会掩盖后面所有实体的问题。`validateEntityMetadata(metadata)` 必须是纯函数，返回按 `namespace/entity/field/rule` 排序的 `EntityMetadataValidationError[]`，不得在首个错误处抛出。`EntityManager.init()` 先对全部实体收集违规，再把**所有实体的所有字段错误**汇总成一个 `RxDBError` 抛出；每条消息包含实体名、字段名和规则标识。`init()` 既有的 `boundTypes` 回滚 try/catch 保持不变。

```ts
/** 注册期规则：13 项，全部由 `validateEntityMetadata()` 产出 */
export type MetadataValidationRule =
  | 'unknownFormat'
  | 'formatTypeMismatch'
  | 'formatOnRelation'
  | 'readonlyOnRelation'
  | 'missingFormatConfig'
  | 'invalidFormatConfig'
  | 'invalidRange'
  | 'missingEnum'
  | 'invalidEnumConfig'
  | 'duplicateEnum'
  | 'enumOptionsMismatch'
  | 'invalidOptionsConfig'
  | 'cardinalityConflict';

/** 关系目标解析规则：2 项，只由阶段 B 的 `describeEntityFields()` 产出（D7） */
export type RelationResolutionRule = 'missingRelationPrimary' | 'unsupportedRelationValueType';

export interface EntityMetadataValidationError {
  namespace: string;
  entity: string;
  field: string;
  rule: MetadataValidationRule;
  message: string;
}

export function validateEntityMetadata(metadata: EntityMetadata): readonly EntityMetadataValidationError[];
```

**两个联合刻意分开，不合并成一个 15 项联合。** 早期草案把关系解析的两条规则塞进 `MetadataValidationRule`，结果是 `validateEntityMetadata()` 的返回类型里有两个它结构上永远产不出的成员——类型说"可能"而实现说"不可能"，正是「消除特殊情况」要删掉的形状。`describeEntityFields()` 发现关系解析缺口时抛 `EntityRelationResolutionError`（D7），其 `details.rule` 用 `RelationResolutionRule`，消息必须包含规则标识、关系名和目标实体名，不得猜测或降级。

阶段边界：`MetadataValidationRule` 在阶段 A 一次性定全 13 项；`RelationResolutionRule` 与它同文件声明（阶段 A），在阶段 B 才有产出方。

### D4 — `format` 只声明在具体属性接口上，关系接口一律不含

**不能**把 `format?` 加到 `IEntityObject`：`EntityRelationOneToOneMetadataOptions`（[metadata-options.interface.ts:435](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L435)）与 `EntityRelationManyToOneMetadataOptions`（同文件 [L509](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L509)）都 `extends IEntityObject`，加在那里等于给 1:1 / m:1 关系开了合法的 `format` 声明口子，与本决策直接矛盾；而 1:m / m:n 只 extends `EntityRelationMetadataBase`（[同文件 L368](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L368)），压根拿不到 —— 同一条规则在四种关系上表现不一致。

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

同两个文件里还有 4 个已在 api-baseline 的导出，本故事对它们的处置一并定死，避免实现期各写各的：

| 导出                                                                                                             | 处置                                                                                                                        |
| ---------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `EntityFieldConfig`、`EntityFieldType`、`extractEntityFields`、`extractSystemFields`、`validateEntityFieldValue` | 冻结 + `@deprecated`                                                                                                        |
| `KeyValueSchemaEntry`（[entity-field.utils.ts:17](../../../packages/rxdb/src/entity/entity-field.utils.ts#L17)） | 冻结，但**不加** `@deprecated`：新 DTO 的 `keyValueSchema` 有意复用它（见「通信 DTO」的说明），加了会自相矛盾               |
| `getEntityColumnName`                                                                                            | 保持不变，不 deprecate。它是 `propertyName → columnName` 的查询入口，与字段描述无关，也不受 D8 影响（D8 约束的是 DTO 输出） |
| `parseEntityFieldValue`、`EntityFieldTypeName`                                                                   | 保持不变，不 deprecate。新 DTO 的 `valueType` 取值全部是真实 `PropertyType`，是 `EntityFieldTypeName` 的子集，可直接喂给它  |

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

「非法字段联合」限定为：`source` 判别值与其依赖的必填键组合不满足 INV-5
（`source: relation` 必须有 `relation` 子对象、`source: computed` 必须 `readonly: true`、关系不得带 `format`、
1:m / m:n 关系不得带 `nullable` / `required` / `unique` / `encrypted` / `writeField`）。
这些键是**已知键**——它们在属性字段和 1:1 / m:1 关系上都是契约的一部分，出现在错误的判别分支上属于「违反联合」，
不是「未知键」，因此走显式失败而不是丢弃。它不包括单纯出现协议未知键。

解析器不得通过类型断言或静默删除**已知**字段来"修复"输入。

##### 跨 format 配置键由注册期负责，不由解析器负责

早期草案还把「某个 format 携带其他已知 format 的配置键」（例如 `url` 携带 `currency`）算进解析失败。
定死：**移出解析器**，只留在 `validateEntityMetadata()` 的 `invalidFormatConfig`（注册期）。理由是它与
「未知键丢弃」不可共存：要区分 `{kind:'url', currency:'USD'}`（失败）和 `{kind:'url', 未知键}`（丢弃），
解析器必须维护一张"全部 format 的已知键并集"表，而这张表**会随版本漂移** —— D6 允许给
`NumberFormat` 加一个可选键且不升版本，那一刻起同名键在其他 kind 上的判定就从"丢弃"翻转成"失败"，
「新增可选字段不升版本」这条承诺当场作废。

因此解析器对 `format` 只有一条规则：**按当前 `kind` 的自有 schema 校验已知键，其余键一律丢弃。**
作者写错配置的场景由注册期闸门拦截，那里有完整的元数据上下文、能报出实体名和字段名，比在 wire 边界
猜测意图更准确。这也让 D6.1 的三档表格对所有协议层级保持同一条规则，没有 format 特例。

**「校验已知键」包含存在性**：`kind` 自有 schema 里的**必填**配置键（`richText.contentType`、
`currency.currency`、`percentage.scale`、`duration.unit`、`rating.min/max/step`）缺失时按 D6.1 第三档
显式失败，不能顺着「丢弃」那一档放行——它们是 `FieldFormat` 联合的必选属性，放行只能靠
`as FieldFormat` 断言出一个类型谎言，而下游 `validateFieldValue()` 读到 `undefined` 的 min/max 会
静默跳过全部范围校验。这与上面「跨 format 配置键移出解析器」不冲突：那张会漂移的是**全部 format 的
已知键并集**，这张只是**当前 kind 自有 schema 的必填子集**，加可选键不会改动它。必填键表在
`packages/rxdb/src/entity/format-rules.ts` 里与注册期闸门 `missingFormatConfig` 同源。

### D7 — DTO 只包含 `valueType`，不再重复输出 `type`

- `valueType`：对 `property` / `computed` / `system` 是其 `PropertyType`
- 对 `relation` 是**关联实体主键的 `PropertyType`**（`uuid` / `string` / `integer` / `bigint`）
- 关系的结构信息放在独立的 `relation: { kind, entity, namespace, mutation, writeField? }` 子对象里

**关联实体主键类型必须显式解析**：`EntityMetadata` 只存 `mappedEntity` / `mappedNamespace` 两个名字，本实体元数据里没有目标实体的主键类型；调用方应通过 `SchemaManager.getEntityMetadata()` 构造解析器。解析目标必须恰好有一个 `primary: true` 属性，且类型只能是 `uuid` / `string` / `integer` / `bigint`；缺少主键或类型不支持时分别按 `missingRelationPrimary` / `unsupportedRelationValueType` 报错，不猜 `uuid`：

```ts
export type EntityMetadataResolver = (entity: string, namespace: string) => EntityMetadata | undefined;

export interface EntityRelationResolutionErrorDetails extends Omit<EntityMetadataValidationError, 'rule'> {
  rule: RelationResolutionRule; // D3 已定义，不再写内联联合
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

#### D9.1 — 关系的 `readonly` 是常量 `true`，是 DTO 唯一的非投影字段

这条必须写明，因为它与 D13「DTO 只是元数据的只读投影」和 AC#21「`readonly` 始终按元数据输出」表面冲突：
1:1 / m:1 `extends IEntityObject`，作者**可以合法写** `readonly: false`；此时 DTO 仍然输出 `readonly: true`。

定死：

- `EntityRelationFieldDescriptor.readonly` 恒为 `true`，**不读元数据**。这是全 DTO 唯一的常量字段，因为它表达的是"赋值通道"这一结构事实（关系值不经属性赋值路径），不是作者可配置的策略。
- 为了不让声明被静默吞掉，注册期新增规则 `readonlyOnRelation`：关系元数据上出现 `readonly` 键即报错（与 `formatOnRelation` 同族，同样四种 kind 一致）。作者要表达"只读关系"应通过权限或 repository 层，不是这里。
- 类型层同步收窄：`EntityRelationOneToOneMetadataOptions` / `EntityRelationManyToOneMetadataOptions` 加 `readonly?: never`，让 `@ts-expect-error` 能覆盖这条（与 D4 的 `format?: never` 同一手法）。

`MetadataValidationRule` 因此为 **13 项**（12 + `readonlyOnRelation`）。

### D10 — `default` 一律不进入 DTO；生成器侧的 default 语义由 US-018 承接

不区分工厂函数和常量：常量 default 也不输出。理由是 default 的完整语义还包含 `'CURRENT_TIMESTAMP'` 这类 adapter 侧字面量（见 `DateProperty.default`）和 `Uint8Array` / `bigint` 等非 JSON-safe 值，逐类型定义通信表示是独立议题。前端需要初始值时走创建接口，不从字段描述里读。

**DTO 不输出 default 不等于生成器可以丢失 default 语义**——但那是另一条故事的事。生成器今天的
`JSON.stringify` / `JSON.parse` 往返会让 bigint 抛原生 `TypeError`、`Uint8Array` 塌成普通对象、
函数工厂被静默丢弃，这是**当前就存在的缺陷**，与本故事要定义的字段语义没有因果关系，且是唯一带
`BREAKING CHANGE` 的改动。整块已拆到 [US-018 生成器元数据序列化管线与 default 语义](./US-018-generator-default-serialization.md)，
本故事不再重复定义规则。

两层契约的边界固定为：**生成器保留支持的常量 `default`（US-018），DTO 一律不输出任何 `default`（本故事）**。
本故事阶段 C 只要求 `format` / `enum` / `options` 透传——它们是 JSON-safe 纯数据，现有管线即可承载，
因此阶段 C **不依赖** US-018，两者可并行。

### D11 — 值校验新增吃 `EntityFieldDescriptor` 的入口，旧签名不动

`validateEntityFieldValue(field: EntityFieldConfig, value)` 读的是 `field.type` / `field.enumValues`，而 format、`enum`、`options` 只存在于新 DTO —— 给 `EntityFieldConfig` 加 `format` 会同时破坏 D5 的冻结和 D5「不对齐命名」的边界。

定死：新增 `validateFieldValue(descriptor: EntityFieldDescriptor, value: unknown): FieldValidationError | null`。新函数先复用旧函数的 required、基础类型、enum、JSON 规则，再增加 `stringArray`、`numberArray` 与 format 校验；旧 `validateEntityFieldValue` 签名、行为、输出全部不变，同样加 `@deprecated` 指向新函数。关系字段按 `relation.mutation` 只校验 ID 形状，不访问 repository。

**刻意不复用的三处**：`number`、`uuid`、`date`。旧函数分别走 `Number()`、`String()`、`new Date(value)` 隐式转换，新函数按「无 fallback 兜底」铁律只认原生类型——`'3.14'` 不是 `number`，`'2026-01-01'` / `1735689600000` / `true` 都不是 `date`（`date` 只认 `Date` 实例，与同样「wire 层另有表示」的 `bigint` / `binary` 同一口径）。旧函数这三条行为按 D5 保持冻结。

### D12 — 校验错误值必须是 JSON-safe 且默认不回显加密值

```ts
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

/** 值校验规则：15 项。全部以**值语义**命名，没有任何一条以 format 命名（D2） */
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
  | 'range';

export interface FieldValidationError {
  field: string;
  message: string;
  rule?: FieldValidationRule;
  value?: JsonValue;
}
```

`value` 的规范化规则固定为：`Date` 转 ISO 8601 字符串，`bigint` 转十进制字符串，`Uint8Array` 转小写 hex 字符串；函数、`Map`、实体实例和无法安全转换的值省略 `value`。`encrypted: true` 的字段始终省略 `value`，不得把原始秘密值放进错误对象。

「省略 `value`」定义为**该键不存在于返回对象上**，不是 `value: undefined`。断言必须用 `toStrictEqual` 或 `expect('value' in error).toBe(false)`：vitest 的 `toEqual` 会把 `{ value: undefined }` 和 `{}` 判为相等，用它写的 AC#31 会恒绿。

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

`currency` 只校验 ISO 4217 的代码形状 `/^[A-Z]{3}$/`，本故事不内置会随时间变化的货币分配表；`schemes` 中每项必须匹配 `/^[A-Za-z][A-Za-z0-9+.-]*$/`（不带冒号），并按 ASCII 小写**判重**——存在大小写重复项时报 `invalidFormatConfig`，本层**不做归一化**，声明原样进入 DTO（口径见 [US-019](./US-019-url-scheme-duplicate-rejection.md) D1）；`language`、`timezone` 非空时原样透传，`timezone` 在本故事中是 opaque hint，不验证 IANA 数据库；`percentage.scale` 是两个字符串字面量之一，不是任意数值范围。

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

| 规则                   | 判定                                                                                                                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `unknownFormat`        | `format.kind` 不在支持列表内                                                                                                                                                   |
| `formatTypeMismatch`   | `format.kind` 与属性的 `PropertyType` 不匹配                                                                                                                                   |
| `formatOnRelation`     | 关系元数据上出现 `format`（D4：四种 kind 一律不接受）                                                                                                                          |
| `readonlyOnRelation`   | 关系元数据上出现 `readonly` 键（D9.1：DTO 恒输出 `true`，声明会被吞掉，故直接拒绝）                                                                                            |
| `missingFormatConfig`  | `richText` 缺 `contentType`、`currency` 缺 `currency`、`percentage` 缺 `scale`、`duration` 缺 `unit`、`rating` 缺 `min/max/step`                                               |
| `invalidFormatConfig`  | `format` 非普通对象、缺合法 `kind`、含当前 kind 不允许的键，或 `contentType`、货币代码、`scale/unit/colorSpace/display`、非空 `language/timezone`、scheme 语法及大小写去重非法 |
| `invalidRange`         | `min > max`、`step <= 0`、非有限数、`rating` 端点不能按 step 对齐，或 percentage 的 `min/max` 超出其 `scale` 固有值域                                                          |
| `missingEnum`          | `EnumProperty`，或声明 `multiSelect` / `options` 的 `stringArray` 没有非空 `enum`                                                                                              |
| `invalidEnumConfig`    | 已声明的 `enum` 不是数组或含非字符串元素                                                                                                                                       |
| `duplicateEnum`        | `enum` 中存在重复值                                                                                                                                                            |
| `enumOptionsMismatch`  | `options` 的键不是 `enum` 的子集                                                                                                                                               |
| `invalidOptionsConfig` | `options` 不是普通对象，展示项不是普通对象，或 `label/color/disabled` 的类型错误、出现未知展示键                                                                               |
| `cardinalityConflict`  | `multiSelect` 用在 `enum` 上、`singleSelect` 用在 `stringArray` 上                                                                                                             |

上表 13 项即 `MetadataValidationRule` 全集。`missingRelationPrimary` / `unsupportedRelationValueType` 属于 `RelationResolutionRule`，由阶段 B 的 `describeEntityFields()` 产出，不在本表（D3、D7）。

每个字段的同一 `rule` 最多产生一条错误。依赖形状的规则只有在前置形状合法时才继续：非法 `format`
对象不再判断 kind/范围，非法 `enum` 不再判断重复值或 options 子集，非法 `options` 不再判断键越界。
错误 message 可以列出全部重复值或越界键，但不得靠同一 rule 重复多条来表达。

**不同 rule 之间的优先级也必须定死**，否则同时触犯两条的 fixture 无法写出确定断言。`format` 相关规则按以下顺序判定，命中即停，同一字段的 `format` 最多产出一条错误：

`invalidFormatConfig`（形状：非普通对象、缺 `kind`）→ `formatOnRelation` / `readonlyOnRelation`（载体是关系）→ `unknownFormat`（`kind` 不在支持列表）→ `formatTypeMismatch`（`kind` 合法但载体 `PropertyType` 不匹配）→ `cardinalityConflict` → `missingFormatConfig` → `invalidFormatConfig`（配置键值语义）→ `invalidRange`。

即：`{ kind: 'bogus' }` 放在 `boolean` 属性上报 `unknownFormat`，**不**报 `formatTypeMismatch`——未知 `kind` 谈不上载体匹配。`enum` / `options` 族规则与 `format` 族相互独立，可同时产出。

校验的处置方式只有一种：**报错**。不得静默降级为 `string`，不得吞掉未知 `format`，尤其**不得为了迁就 `format` 去改写字段的 `PropertyType` 或单值/多值形态**（INV-2、INV-3）。`formatTypeMismatch` 与 `cardinalityConflict` 的正确修法始终是作者改声明，而不是运行时替作者改类型。

`validateFieldValue()` 的格式值规则固定如下：

- `url` 使用 WHATWG `URL` 解析；配置 `schemes` 时取 `url.protocol` 去掉末尾冒号并转 ASCII 小写，与同样小写化的白名单比较
- `email` 使用“无空白、恰好一个 `@` 且域名含 `.`”的保守规则
- `phone` 使用“可选 `+`，其余仅数字、空格、括号和连字符，长度 3～32”的规则
- 数字格式只接受有限 `number`；先校验 `min/max`，再以 `base = min ?? 0` 校验 step。令 `q = (value - base) / step`，当 `abs(q - round(q)) <= Number.EPSILON * max(1, abs(q)) * 8` 时视为命中 step
- `rating` 要求 `min < max`，且 `(max - min) / step` 按同一容差为整数，保证两个端点都可选
- `percentage` 的固有值域由 `scale` 决定：`0..1` 对应 `[0, 1]`，`0..100` 对应 `[0, 100]`；声明的 `min/max` 必须落在固有值域内，实际校验取二者交集
- `enum` 成员校验只看字段是否声明了非空 `enum`，**与 `format` 无关**（D2）：`EnumProperty` 校验值本身，`StringArrayProperty` 先按 `stringArray` 规则确认是字符串数组、再逐项查成员资格，两者同用 `rule: 'enum'`，message 列出全部非法项；`options.disabled` 不参与合法性判定

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

/**
 * 关系字段。键的取舍沿用与属性字段**同一条规则**「接口支持才输出」，不是关系特例：
 * - `searchable` / `primary` / `enum` / `options` / `keyValueSchema`：四种 kind 都无处声明，一律省略
 * - `sortable`：四种 kind 都 extends `ISortable`（[metadata-options.interface.ts:368](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L368)），一律输出
 * - `nullable` / `required` / `unique` / `encrypted`：**只有 1:1 / m:1 有**（它们 extends `IEntityObject`，
 *   见 [L435](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L435) /
 *   [L509](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L509)）；1:m / m:n 只 extends
 *   `EntityRelationMetadataBase`，给它们输出 `false` 等于伪造一个作者根本写不出的声明。故按 kind 拆两个子类型
 * - `readonly`：D9.1 的唯一常量字段，四种 kind 恒为 `true`
 */
type EntityRelationFieldDescriptorBase = Omit<
  EntityFieldDescriptorBase,
  | 'format'
  | 'valueType'
  | 'readonly'
  | 'nullable'
  | 'unique'
  | 'encrypted'
  | 'required'
  | 'searchable'
  | 'primary'
  | 'enum'
  | 'options'
  | 'keyValueSchema'
> & {
  source: 'relation';
  readonly: true; // D9.1：常量，不读元数据
  format?: never;
  searchable?: never;
  primary?: never;
  enum?: never;
  options?: never;
  keyValueSchema?: never;
  sortable: boolean; // 四种 kind 都 extends ISortable，故恒输出
  valueType: `${PropertyType.uuid | PropertyType.string | PropertyType.integer | PropertyType.bigint}`;
  relation: {
    kind: `${RelationKind}`;
    entity: string;
    namespace: string;
    mutation: 'set-remove' | 'add-remove';
    writeField?: string;
  };
};

/** 1:1 / m:1 —— extends `IEntityObject`，四个通用布尔标志都可声明；有逻辑外键可写 */
export type EntityToOneRelationFieldDescriptor = EntityRelationFieldDescriptorBase & {
  cardinality: 'single'; // 顶层判别，见下方「为什么关系子类型要收窄 cardinality」
  nullable: boolean;
  required: boolean;
  unique: boolean;
  encrypted: boolean;
  relation: {
    kind: `${RelationKind.ONE_TO_ONE | RelationKind.MANY_TO_ONE}`;
    mutation: 'set-remove';
    writeField: string;
  };
};

/** 1:m / m:n —— 只 extends `EntityRelationMetadataBase`，这四个概念在类型层就不存在 */
export type EntityToManyRelationFieldDescriptor = EntityRelationFieldDescriptorBase & {
  cardinality: 'multiple'; // 顶层判别
  nullable?: never;
  required?: never;
  unique?: never;
  encrypted?: never;
  relation: {
    kind: `${RelationKind.ONE_TO_MANY | RelationKind.MANY_TO_MANY}`;
    mutation: 'add-remove';
    writeField?: never;
  };
};

export type EntityRelationFieldDescriptor = EntityToOneRelationFieldDescriptor | EntityToManyRelationFieldDescriptor;

export type EntityFieldDescriptor =
  EntityPropertyFieldDescriptor | EntityComputedFieldDescriptor | EntityRelationFieldDescriptor;

export function describeEntityFields(
  metadata: EntityMetadata,
  resolve: EntityMetadataResolver // D7，必填；无关系实体也要传，不做可选特例
): EntityFieldsDescriptor;

export function parseEntityFieldsDescriptor(value: unknown): EntityFieldsDescriptor;
```

#### 为什么关系子类型要收窄 `cardinality`

`relation.kind` 是**嵌套**判别字段。实测（TypeScript 6.0.3，`--strict`）：

- `d.relation.writeField` 可用 —— 检查 `d.relation.kind === '1:1'` 收窄的是 `d.relation` 这个引用，没问题
- `d.nullable` **不可用** —— 检查 `d.relation.mutation === 'set-remove'` **不会**把 `d` 本身收窄成 `EntityToOneRelationFieldDescriptor`，
  `d.nullable` 仍是 `boolean | undefined`，消费方只能写类型断言，正是这份契约要消灭的东西

因此两个关系子类型各自把继承自 `EntityFieldDescriptorBase` 的 `cardinality` 收窄成字面量：ToOne → `'single'`，
ToMany → `'multiple'`。它同时是**顶层可用的判别字段**，并把 D1 的推导从文档约定变成编译期事实（`m:n` 不可能是 `single`）。
`sortable` 用同一手法从 `sortable?: boolean` 交叉成必填——两处都刻意用交叉而不是 `Omit` 后重声明，
保证子类型在结构上永远是 `EntityFieldDescriptorBase` 的子集。

约束：

- 覆盖 `propertyMap`、`computedPropertyMap`、`relationMap`（含 `1:m` / `m:n`）与系统字段；系统字段以 `source: 'system'` 输出，不再像 `extractSystemFields` 那样单独成表
- 关系字段的 `field` 取关系名，外键列不单独成字段；1:1 / m:1 必须带逻辑 `relation.writeField`，1:m / m:n 必须带 `mutation: 'add-remove'`（D9）
- 计算属性必须输出其真实 `valueType` 且 `readonly: true`，不得塌缩成 `'computed'`
- `displayName` 是**规范化**而非兜底：取 `displayName ?? field`（与既有 `propertyToField()` 的 `prop.displayName ?? key` 一致）。它是"名字的两级来源"，不是"缺失时猜一个值"——`field` 永远存在，结果永远确定，因此不违反无 fallback 铁律
- **布尔标志只在元数据真能声明它时才出现**，任何一个键都不许凭空造 `false`：
  - 属性 / 计算属性：`readonly` / `nullable` / `required` / `unique` / `encrypted` 来自 `IEntityObject`，五个键始终输出 `true` 或 `false`；`sortable` / `searchable` / `primary` 只有对应属性接口支持时才输出（支持但关闭 → `false`，接口不支持 → 省略键）
  - 关系：`EntityRelationMetadataBase` 只 `extends ISortable, ICascadeOptions`，所以四种 kind 一律输出 `sortable`（未声明 → `false`）；`searchable` / `primary` / `enum` / `options` / `keyValueSchema` 四种 kind 都无处声明，**一律省略键**；`nullable` / `required` / `unique` / `encrypted` **只有 1:1 / m:1 输出**（[L435](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L435) / [L509](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L509) 额外 `extends IEntityObject`，作者可以合法声明），1:m / m:n 省略。`readonly` 是常量 `true`（D9.1）
  - 这条是 `EntityRelationFieldDescriptor` 拆成 `ToOne` / `ToMany` 两个子类型的全部理由：类型系统必须让"给 1:m 造一个假 `unique: false`"编译不过，而不是靠约定
- `keyValueSchema` 有意复用既有的 `KeyValueSchemaEntry`（[entity-field.utils.ts:17](../../../packages/rxdb/src/entity/entity-field.utils.ts#L17)）而不是新定义一份同形状类型：它本来就是 JSON-safe 的纯数据形状，复用可以让新旧两条路径描述同一件事。这也是 D5 表里它被冻结却不加 `@deprecated` 的原因
- 不得包含 `Map`、函数、实体实例、`Date`、`Uint8Array`、`columnName`（D8）或框架组件引用
- `default` 一律不进入 DTO，工厂函数和常量都不输出（D10）
- 键存在时，`encrypted` 与 `sortable` 按元数据声明**忠实输出**，DTO 不代替加密 adapter 做裁剪（D13）
- `fields` 顺序严格遵守 INV-6；`enum` 顺序原样保留；`options` 只复制 JSON-safe 的展示元数据
- `parseEntityFieldsDescriptor()` 必须校验 `dtoVersion`、字段判别联合、关系主键类型、布尔字段和 JSON-safe 约束；未知版本显式失败。关系字段的键存在性是**已知键契约**而非未知键：`source: 'relation'` 且 `relation.kind ∈ {1:m, m:n}` 时出现 `nullable` / `required` / `unique` / `encrypted`，按 D6.1 第三档「违反联合」显式失败，不走「未知键丢弃」

### 值校验扩展

`FieldValidationError` 与 `JsonValue` 的完整定义见 D12。它们按纯 additive 方式扩展，既有 `{ field, message }` 形状不变；新函数只为新增错误补充 `rule` 和规范化后的 `value`。

新增 `validateFieldValue(descriptor: EntityFieldDescriptor, value)`（D11），实现旧函数全部基础规则、`stringArray` / `numberArray` 分支、format 相关校验（`url` 的 `schemes`、`email` / `phone`、`number` 系的 `min/max/step`、`percentage` 值域）以及与 format 无关的 `enum` 成员校验（D2）。旧 `validateEntityFieldValue(field: EntityFieldConfig, value)` 行为不变。

> 两者都是**纯函数**，返回错误对象而不抛出；当前都不在写路径上，本故事也不把它们接进写路径（见 Out of Scope）。
