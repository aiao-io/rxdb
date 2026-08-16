---
id: US-018
title: 生成器元数据序列化管线与 default 语义
status: Backlog
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-16
updated: 2026-08-16
tags: [core, codegen, generator, default, serialization, bigint, binary]
inherited_acs:
  - from: US-012
    ac: 35
    note: default 语义保留与显式失败；对应 US-012 拆分前阶段 C 的旧 AC#35，US-012 已删除该行并把 38/39 重编为 35/36
  - from: US-012
    ac: 36
    note: 拆除 `transitionMetadata()` 的 JSON 往返；对应 US-012 拆分前的旧 AC#36
  - from: US-012
    ac: 37
    note: '`enumerable: false` 内部键不进生成结果；对应 US-012 拆分前的旧 AC#37'
---

<!--
INVEST 检查清单:
- [x] Independent: 只动 `rxdb-client-generator` 的序列化管线，不依赖 US-012 的 format / DTO
- [x] Negotiable: G2 的值→字面量映射按本文冻结；遍历实现与文件拆分可在 plan 阶段调整
- [x] Valuable: 今天声明的 bigint / Uint8Array / Date / 函数 default 在生成客户端里已经**静默丢失或改写**，是现存数据缺陷
- [x] Estimable: 改动集中在一个文件的一个函数及其渲染链
- [x] Small: 单 PR 可交付；唯一的破坏性变更独立发布、独立回滚
- [x] Testable: 每种 default 值类型都有确定的生成输出或确定的错误标识
-->

# 用户故事：生成器元数据序列化管线与 default 语义

## 作为/我想要/以便

**作为** 使用 `@aiao/rxdb-client-generator` 的开发者
**我想要** 生成的客户端实体保留我声明的 `default` 语义，无法安全生成时在生成期立即失败
**以便** bigint、`Uint8Array`、`Date` 默认值不被静默改写成别的类型，函数工厂不被静默丢弃成"这个字段从来没有默认值"

## 问题现状

[RxDBClientGenerator.utils.ts:306-315](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L306-L315) 的 `transitionMetadata()` 先做 JSON 往返再渲染：

```ts
const serialized = JSON.stringify(metadataOptions);
const plainMetadata: unknown = JSON.parse(serialized);
return renderMetadataValue(plainMetadata, 0, 'metadata');
```

`renderToken()`（[同文件 L261](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L261)）只在 JSON 解析**之后**被调用，它看到的永远是 plain 值。后果逐条如下——这不是"未来可能出问题"，是当前就存在的缺陷：

| 声明的 `default`        | 生成结果                            | 性质                                |
| ----------------------- | ----------------------------------- | ----------------------------------- |
| `7n`（bigint）          | `JSON.stringify` 直接抛 `TypeError` | 生成流程崩在原生错误上              |
| `new Uint8Array([1,2])` | `{"0":1,"1":2}`                     | 塌成普通对象，字节视图丢失          |
| `new Date(...)`         | ISO 字符串                          | 与作者手写的字符串 default 不可区分 |
| `() => uuid()`          | 键被静默丢弃                        | 生成的实体**没有默认值**            |

## 设计决策

### G1 — 序列化源固定为「实体自身声明的三个数组」，不得改用 `propertyMap`

`transitionMetadata()` 的输入是 `omit(metadata, ['propertyMap', 'relationMap', 'indexMap'])`，实际被遍历到的是
`metadata.properties` / `computedProperties` / `relations`。[metadata-transition.ts:257](../../../packages/rxdb/src/entity/metadata-transition.ts#L257)
把这三个数组回填成**仅含本类自声明成员**的规范化克隆，继承自父类的属性不在其中——生成代码靠 `extends EntityBase` 补回。

**这是本故事不炸全仓的唯一前提，必须显式锁住**：[entity-base.ts:38-71](../../../packages/rxdb/src/entity/entity-base.ts#L38-L71) 的
`id` / `createdAt` / `updatedAt` 全是 `() => uuid()` / `() => new Date()`，每个实体都继承。若实现时把遍历源
换成"更直觉"的 `propertyMap`（那才是全部属性的入口），G2 的函数工厂规则会让**每一个实体**生成失败。

同理，`registerAbstractMetadata()`（[RxDBClientGenerator.ts:350](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L350)）
登记的抽象元数据只进 `metadataMap`、不进 `metadataSet`，因此不被序列化。这两条都由 AC#7 显式验证。

### G2 — `default` 值到生成字面量的映射表

| metadata `default`                                              | 生成器行为                                                         |
| --------------------------------------------------------------- | ------------------------------------------------------------------ |
| `string` / `boolean` / 有限 `number` / JSON-safe 数组和普通对象 | 输出等价 JS 字面量                                                 |
| `bigint`                                                        | 输出十进制 bigint 字面量，如 `7n`                                  |
| `Uint8Array`                                                    | 输出 `new Uint8Array([...])`，只取当前视图字节                     |
| 有效 `Date`                                                     | 输出 `new Date('<ISO>')`                                           |
| `'CURRENT_TIMESTAMP'`                                           | 原样输出该字符串字面量                                             |
| 任意函数，包括 `() => new Date()`、`() => uuid()` 和闭包        | 抛 `Error`，message 含实体名、字段名和 `unsupportedDefaultFactory` |
| 其他值、循环引用、非有限数或非法 `Date`                         | 抛 `Error`，message 含实体名、字段名和 `unsupportedDefaultValue`   |

运行时函数对象不携带可靠的闭包与 import 信息，本故事禁止用 `Function#toString()` 猜测源码。若未来需要保留工厂，
必须由独立 story 定义可序列化表达式或基于 AST 的依赖协议。

### G3 — 关系的 `default` 走同一张表

1:1 / m:1 关系可以声明 `default?: RxDBEntityId | (() => RxDBEntityId)`
（[metadata-options.interface.ts:438](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L438) /
[L513](../../../packages/rxdb/src/entity/metadata-options.interface.ts#L513)）。G2 的规则**逐条适用于 `relations` 数组**，
不是只管属性：关系上的函数 default 同样抛 `unsupportedDefaultFactory`。错误 message 用关系名作为字段名。

### G4 — 拆掉 JSON 往返，改运行时类型分派

`transitionMetadata()` 改为直接递归遍历对象，在遍历中按值的运行时类型分派
（`typeof value === 'bigint'`、`value instanceof Uint8Array`、`value instanceof Date`、`typeof value === 'function'`）。
这是一次序列化管线重写，不是加一个 `renderToken` 分支，工作量按此估算。

#### G4.1 — 类型分派必须排在 `isRecord` 分支**之前**（否则重写等于没写）

`renderMetadataValue` 的 `isRecord()` 判据是 `typeof value === 'object' && value !== null && !Array.isArray(value)`
（[RxDBClientGenerator.utils.ts:251-252](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L251-L252)），
`Uint8Array` / `Date` / `Map` **全部命中**。所以去掉 JSON 往返本身**不修复任何一条**问题现状，只是换个地方犯：

| 值                      | 今天（有 JSON 往返） | 只删往返、不加 instanceof 分派 |
| ----------------------- | -------------------- | ------------------------------ |
| `new Uint8Array([1,2])` | `{"0":1,"1":2}`      | `{ "0": 1, "1": 2 }`（同样塌） |
| `new Date(...)`         | ISO 字符串           | `{}`（`Object.entries` 为空）  |
| `Map`                   | `{}`                 | `{}`                           |

`Date` 一项**比现状更差**：从"可识别但有歧义的字符串"退化成"静默的空对象"。
因此 `instanceof` 分派必须先于 `isRecord`，AC#2 / AC#3 断言的正是这个次序。

#### G4.2 — 现有三条 `Error` 全部要重新归位，不得留成死代码

| 现有守卫                                                             | 位置                    | 重写后                                     |
| -------------------------------------------------------------------- | ----------------------- | ------------------------------------------ |
| `Metadata cannot be serialized`（`JSON.stringify` 返回 `undefined`） | `transitionMetadata()`  | 失去触发条件，删除                         |
| `Metadata must serialize to an object`（`JSON.parse` 结果非 record） | `transitionMetadata()`  | 同上，删除                                 |
| `Unsupported metadata value: ${String(value)}`                       | `renderMetadataValue()` | **改写**为 `unsupportedDefaultValue`，见下 |

第三条是重点：它今天**摸不到**（bigint 被 `JSON.stringify` 先行抛错，函数与 `undefined` 被往返丢弃），
删掉往返后它立刻变成 bigint / 函数 / `undefined` 的实际落点——而它的 message 既没有实体名也没有字段名，
且 `String(value)` 对函数会把**整段源码**塞进错误信息。两条硬要求：错误 message 必须带实体名与字段名；
**不得**用 `String(fn)` / `Function#toString()` 输出函数体（与 G2 的禁令同源，这里是它最容易被绕过的入口）。

#### G4.3 — `enumerable: false` 的保护今天不来自 `JSON.stringify`

`transitionMetadata()`（core 侧）一共挂了 **12 个 `enumerable: false` 的派生成员**
（[metadata-transition.ts:250-319](../../../packages/rxdb/src/entity/metadata-transition.ts#L250-L319)）：

| 定义方式                                 | 个数 | 成员                                                                                                                                      |
| ---------------------------------------- | ---- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `setSafeObjectKey`（数据属性）           | 7    | `propertyMap` / `computedPropertyMap` / `relationMap` / `indexMap` / `encryptedPropertyMap` / `columnNameToPropertyName` / `isForeignKey` |
| `setSafeObjectKeyLazyInitOnce`（getter） | 5    | `defaultValueProperties` / `foreignKeyRelations` / `foreignKeyRelationMap` / `foreignKeyNames` / `foreignKeyColumnNames`                  |

真正把它们挡在外面的是 **`omit()` 里的对象展开**
（[omit.ts:14](../../../packages/utils/src/object/omit.ts#L14) 的 `{ ...obj }` 只拷自有可枚举属性）
与 `renderMetadataValue` 里的 `Object.entries`，**不是** `JSON.stringify`
（`enumerable: false` 见 [entity.utils.ts:40](../../../packages/rxdb/src/entity/entity.utils.ts#L40)、
[L103](../../../packages/rxdb/src/entity/entity.utils.ts#L103)）。三条推论：

- `omit(metadata, ['propertyMap', 'relationMap', 'indexMap'])` 的键名清单**今天是空操作**——展开已经把它们连同另外九个一起排除了。
  重写时既不要把它当成载重结构保留，也不要"顺手补全"成 12 个键名；它要么删掉，要么留下并注明是冗余。
- 风险只在遍历方式上：改用 `Reflect.ownKeys` / `Object.getOwnPropertyNames` 会一次性破坏这层保护，
  而且会**触发五个惰性 getter 求值**（其中 `foreignKeyNames` / `foreignKeyColumnNames` 内部还会连带求值
  `foreignKeyRelations`），把一次纯序列化变成带计算的副作用。AC#9 锁的就是这一点。
- `isForeignKey` 是个**函数**值。一旦遍历方式放宽，它会直接撞上 G2 的函数禁令，
  把每个实体的生成都变成 `unsupportedDefaultValue` 抛错——即"改错遍历方式"的失败是全量而非个别的。

### G5 — 这是 `BREAKING CHANGE`，迁移路径必须可执行

从"静默丢弃函数 default"改成"生成期失败"是有意的用户可见行为变化，PR 必须标注 `BREAKING CHANGE`，
不得包装成无行为变化的 patch fix。迁移说明必须给出**具体等价物**，不能只写"改成常量"——
最典型的 `() => uuid()` 恰恰无法用常量表达：

| 原写法                                          | 迁移到                                                                                       |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| 主键 `id: { default: () => uuid() }`            | 删除该声明，改为继承 `EntityBase`：主键默认值由运行时基类提供，本就不经生成器（G1）          |
| `createdAt` / `updatedAt` 的 `() => new Date()` | 同上继承 `EntityBase`；需要库侧生成时用 `default: 'CURRENT_TIMESTAMP'`                       |
| 业务 `date` 字段 `() => new Date()`             | `default: 'CURRENT_TIMESTAMP'`（由 adapter 求值）                                            |
| 业务字段 `() => uuid()` 等每次不同的值          | 移到创建接口显式赋值，或 repository 侧 create 钩子；"每次调用产生新值"在静态元数据里不可表达 |
| 读取外部配置的闭包                              | 移到创建接口；生成期拿不到闭包环境，任何还原都是猜测                                         |

## 范围边界

### In Scope

- 重写 `transitionMetadata()`（生成器侧）的序列化管线：去掉 JSON 往返、改运行时类型分派（G4）
- 按 G2 落地属性与关系 `default` 的确定性输出与显式失败（G2、G3）
- 锁住 G1 的遍历源前提与 `enumerable: false` 内部键不外泄
- 迁移说明与 `BREAKING CHANGE` 标注（G5）

### Out of Scope

- 从运行时函数对象恢复 default 工厂源码、闭包或 import；后续如需支持，必须先定义可序列化表达式或 AST 协议
- 字段语义 `format` / `enum` / `options` 的透传与三框架契约（属 [US-012](./US-012-field-semantic-metadata.md) 阶段 C；
  它们是 JSON-safe 纯数据，现有管线即可透传，不依赖本故事）
- DTO 侧的 `default` 表示：`EntityFieldsDescriptor` 一律不输出 `default`（US-012 D10），两层契约互不影响
- 新增物理 `PropertyType`、adapter 列类型与数据库迁移

## 验收标准

| #   | 前置条件                                                                                                                   | 操作                 | 预期结果                                                                                                                                                                                | 状态 |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 属性 `default` 为 bigint                                                                                                   | 运行生成器           | 输出 `7n` 形式的 bigint 字面量并可编译；不再抛原生 `TypeError: Do not know how to serialize a BigInt`                                                                                   | ⬜   |
| 2   | 属性 `default` 为 `Uint8Array` 视图（含 `subarray` 得到的偏移视图）                                                        | 运行生成器           | 输出 `new Uint8Array([...])`，**只取当前视图字节**；不再塌成 `{"0":1,...}`。断言输出里不出现数字键对象——`isRecord` 对 `Uint8Array` 为真，分派若排在其后会原样复现旧塌陷（G4.1）         | ⬜   |
| 3   | 属性 `default` 为有效 `Date` / `'CURRENT_TIMESTAMP'`                                                                       | 运行生成器           | 分别输出 `new Date('<ISO>')` 与原样字符串字面量；两者在生成代码里可区分。断言 `Date` 不生成 `{}`——分派排在 `isRecord` 之后时它会退化成空对象，**比现状更差**（G4.1）                    | ⬜   |
| 4   | 属性 `default` 为 JSON-safe 常量（字符串、布尔、有限数、数组、普通对象）                                                   | 运行生成器并编译输出 | 输出等价字面量，编译后值语义与声明一致                                                                                                                                                  | ⬜   |
| 5   | 属性 `default` 为函数工厂（`() => new Date()`、`() => uuid()`、闭包）                                                      | 运行生成器           | 抛 `Error`，message 含实体名、字段名与 `unsupportedDefaultFactory`；**不得**静默丢弃；断言 message **不包含函数源码**（禁用 `String(fn)` / `Function#toString()`，G4.2）                | ⬜   |
| 6   | `default` 为循环引用、非有限数、非法 `Date` 或其他不支持值                                                                 | 运行生成器           | 抛 `Error`，message 含实体名、字段名与 `unsupportedDefaultValue`；三条旧守卫按 G4.2 归位：前两条随往返删除，`Unsupported metadata value` 被改写而非保留，代码里无死分支也无裸 message   | ⬜   |
| 7   | 实体继承 `EntityBase`（`id` / `createdAt` / `updatedAt` 均为函数 default），并用 `registerAbstractMetadata()` 登记抽象基类 | 运行生成器           | 生成成功，**不**触发 `unsupportedDefaultFactory`；断言序列化源只含实体自身声明的成员（G1），抽象元数据未被序列化输出                                                                    | ⬜   |
| 8   | 1:1 / m:1 关系分别声明常量 `default` 与函数 `default`                                                                      | 运行生成器           | 常量按 G2 渲染；函数抛 `unsupportedDefaultFactory` 且 message 用关系名（G3）                                                                                                            | ⬜   |
| 9   | 元数据带 `enumerable: false` 的内部键（7 个 `setSafeObjectKey` + 5 个惰性 getter）                                         | 运行生成器           | 生成结果不含这 12 个内部键（逐键断言，含函数值 `isForeignKey`）；并断言五个惰性 getter **未被求值**（spy 或计数器），证明遍历没有改用 `Reflect.ownKeys` / `getOwnPropertyNames`（G4.3） | ⬜   |
| 10  | 既有 `rxdb-client-generator` 测试、三框架与 api-baseline                                                                   | 通过 Nx 执行回归     | 既有生成输出无回归；PR 标注 `BREAKING CHANGE` 并附 G5 迁移表；`packages/rxdb-client-generator` 覆盖率不低于实施前                                                                       | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术笔记

- **仓库里有两个同名的 `transitionMetadata`，本故事只动后者**：`@aiao/rxdb` 的
  [entity/metadata-transition.ts](../../../packages/rxdb/src/entity/metadata-transition.ts) 把 `EntityMetadataOptions`
  合并成 `EntityMetadata`（装饰器求值时跑）；`rxdb-client-generator` 的
  [core/RxDBClientGenerator.utils.ts:306](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L306)
  把 `EntityMetadata` 序列化成**字符串**回填 `Entity(...)`。两者已经在同一个文件里碰面：
  `RxDBClientGenerator.ts` 同时导入两个，靠 [L29](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L29)
  的 `transitionMetadata as transitionMetadataUtil` 别名区分——**本故事要改的是带 `Util` 后缀的那个**
  （调用点 [L485](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L485) /
  [L525](../../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.ts#L525)），
  L295 的 `transitionMetadata(meta_options, options)` 是 core 的那个，不要动。
- 渲染入口 `renderMetadataValue()` 目前假定输入已是 plain 值；改成类型分派后，`renderToken()` 的
  `PropertyType.*` / `RelationKind.*` 还原逻辑必须继续生效，不得因为遍历顺序调整而丢失。
- AC#5 与 AC#1/#2 是**互为前提**的两条路径：往返存在时函数已被 `JSON.stringify` 丢弃，AC#5 的失败分支结构上跑不到。
  验收顺序固定为 1/2 → 9 → 5，AC#1 未通过时 AC#5 判绿一律视为无效。
- 生成器与 DTO 是两层契约：生成器源 metadata 按 G2 保留支持的常量 `default`；US-012 的 DTO 则有意不输出任何 `default`。
  禁止先 `JSON.stringify` 再假装函数从未存在。

## 实现文件

| 文件                                                                   | 内容                                                                           |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts` | 重写 `transitionMetadata()` 序列化管线；`default` 渲染与两类显式失败（G2～G4） |
| `packages/rxdb-client-generator/src/__tests__/`                        | AC#1～#9 的参数化用例与 EntityBase 继承 fixture                                |
| `requirements/api-baseline/`                                           | 生成器输出相关基线（若有变化）                                                 |

## References

- [US-002 客户端代码生成](./US-002-client-generation.md)
- [US-011 定义 bigint 与 binary 类型及公共 API 契约](./US-011-property-type-bigint-binary.md)
- [US-012 扩展字段语义与前端通信契约](./US-012-field-semantic-metadata.md) — 阶段 C 的 format/enum/options 透传不依赖本故事
