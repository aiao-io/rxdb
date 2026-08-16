# US-012 字段语义元数据评审

## 评审信息

| 项目     | 内容                                       |
| -------- | ------------------------------------------ |
| 评审对象 | `1b09d39f49912d0557cb2a8a182995ee45d74cdc` |
| 对比基线 | `5044dad20cfe7e23342393ac924a3d2d70e77ac7` |
| 提交主题 | `feat(rxdb): US-012 字段语义元数据 (#20)`  |
| 评审日期 | 2026-08-17                                 |
| 评审结论 | 不建议合并                                 |

本次评审覆盖该提交涉及的实体字段描述 DTO、元数据注册校验、字段值校验、关系主键解析、客户端生成器、公共契约 fixture 及三框架契约测试。

## 结论摘要

实现补齐了 `format`、`enum`、`options`、关系字段 DTO 和三框架契约，但未受信输入边界仍有多个崩溃或静默错误路径。当前发现 8 个问题：4 个高优先级，4 个中优先级。

在修复高优先级问题前，不建议合并。

## 问题清单

### P1-1：特殊 `format.kind` 会绕过 unknownFormat 并抛 TypeError

位置：[metadata-validate.ts:253](../../packages/rxdb/src/entity/metadata-validate.ts#L253)

`detectFormatViolation()` 使用外部字符串直接索引普通对象。`kind` 为 `__proto__`、`constructor`、`toString` 等原型链名称时，取到的不是配置数组，后续 `.includes()` 会抛 `TypeError`。这违反了“畸形输入转成聚合违规，不自身崩溃”的契约，也会让 `EntityManager.init()` 无法继续聚合其他实体错误。

最小复现：

```ts
format: {
  kind: 'toString';
}
```

建议在读取 `FIELD_FORMAT_CONFIG_KEYS` 和 `FIELD_FORMAT_CARRIERS` 前使用 `Object.hasOwn()`，或将规则表改成无原型对象。

### P1-2：DTO 解析器接受非法 format 字面量，产生类型谎言

位置：[entity-field.utils.ts:680](../../packages/rxdb/src/entity/entity-field.utils.ts#L680)、[entity-field.utils.ts:704](../../packages/rxdb/src/entity/entity-field.utils.ts#L704)

解析器只校验配置键的基础线类型，没有校验 `scale`、`contentType`、`unit`、`colorSpace`、`display` 等字面量联合。例如：

```ts
format: { kind: 'percentage', scale: 'bogus' }
```

该输入会被解析成 `FieldFormat`。随后 [entity-value.utils.ts:475](../../packages/rxdb/src/entity/entity-value.utils.ts#L475) 查找百分比值域时会因 `undefined` 解构而抛 `TypeError`。解析器应复用各配置键的合法字面量规则，在返回 `FieldFormat` 前拒绝越界值。

### P1-3：循环引用导致 DTO 解析和值校验栈溢出

位置：[entity-field.utils.ts:620](../../packages/rxdb/src/entity/entity-field.utils.ts#L620)、[entity-value.utils.ts:326](../../packages/rxdb/src/entity/entity-value.utils.ts#L326)、[entity-value.utils.ts:344](../../packages/rxdb/src/entity/entity-value.utils.ts#L344)

`assertJsonSafe()`、`isStrictJsonValue()` 和 `normalizeJsonValue()` 都递归遍历对象，但没有访问栈或循环集合。传入循环对象时：

- `parseEntityFieldsDescriptor()` 抛 `RangeError: Maximum call stack size exceeded`，而不是 `RxDBError`；
- `validateFieldValue()` 无法返回错误对象，直接栈溢出；
- `json` 字段的严格 JSON 校验也会走同一问题路径。

建议抽出共享的循环检测实现，并确保循环值按协议返回结构化错误或省略错误对象中的 `value`。

### P1-4：关系目标存在多个主键时静默选择第一个

位置：[entity-field.utils.ts:479](../../packages/rxdb/src/entity/entity-field.utils.ts#L479)

`resolveRelationValueType()` 使用 `.find()` 取得第一个 `primary: true` 属性，没有验证目标实体必须“恰好一个”主键。目标实体同时存在 `string` 和 `uuid` 主键时，关系 `valueType` 由 Map 插入顺序决定，可能生成错误的外键类型并导致后续值校验错误。

建议先收集所有主键；数量不是 1 时立即失败，并补充多主键测试。错误规则需要与 `RelationResolutionRule` 联合保持一致。

### P2-1：生成器丢失 `__proto__` option 键

位置：[RxDBClientGenerator.utils.ts:301](../../packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts#L301)

`FieldOptions` 的业务键是任意字符串，但生成器把 `__proto__` 识别为合法标识符并输出为对象字面量键：

```ts
options: {
  __proto__: {
    label: '...';
  }
}
```

JavaScript 会把它解释为原型设置，而不是普通自有属性，因此从 JSON 元数据生成客户端时该选项会丢失。应对 `__proto__` 强制使用字符串键，或使用安全的计算属性/无原型对象生成策略。

### P2-2：`isPlainObject` 接受 Map、Date 和类实例

位置：[metadata-validate.ts:152](../../packages/rxdb/src/entity/metadata-validate.ts#L152)

当前实现只排除数组和 `null`：

```ts
typeof value === 'object' && value !== null && !Array.isArray(value);
```

因此 `options: new Map()`、`options: new Date()` 或类实例可能通过注册校验，最终进入本应 JSON-safe 的 DTO。仓库已有 [json-safe.ts](../../packages/rxdb/src/entity/json-safe.ts) 中的 `isPlainRecord()`，应统一复用。

### P2-3：运行时没有限制 enum/options 的合法载体

位置：[metadata-validate.ts:334](../../packages/rxdb/src/entity/metadata-validate.ts#L334)

`validateEnumAndOptions()` 对所有属性无条件校验 `enum` 和 `options`，没有限制只能出现在 `EnumProperty` 或 `StringArrayProperty`。绕过 TypeScript 后，`number` 属性携带这些键会通过注册校验，描述器也会输出它们；值校验进一步会对数字执行 enum 成员判断，违反字段类型与 enum 语义边界。

建议在运行时增加载体检查，并将非法组合归入既有的 `invalidEnumConfig` / `invalidOptionsConfig` 规则。

### P2-4：错误值规范化会被 `__proto__` 键破坏

位置：[entity-value.utils.ts:344](../../packages/rxdb/src/entity/entity-value.utils.ts#L344)

`normalizeJsonRecord()` 使用 `result[key] = normalized` 构造返回对象。对于 JSON 中合法的自有 `__proto__` 键，该赋值会改写结果对象原型并丢失该键，导致 `FieldValidationError.value` 无法 JSON 往返，违反 D12 的 JSON-safe 契约。

建议使用 `Object.fromEntries()`、`Object.defineProperty()` 或 `Object.create(null)` 构造记录，并增加 `__proto__`、`constructor` 等业务键测试。

## 验证结果

已执行或核对以下验证：

- `rxdb`、`rxdb-client-generator`、Angular、React、Vue typecheck：通过；
- 对应 lint：通过；
- 核心新增测试：198 tests passed；
- client generator 语义测试：11 tests passed；
- Angular / Vue 契约测试：各 64 tests passed；
- React 串行复跑：176 tests passed；
- `git diff --check`：通过。

验证限制：当前 Node 为 `22.14.0`，仓库要求 `>=26`；默认 browser 测试受沙箱监听 `::1` 的 `EPERM` 限制。禁用 browser 后，旧的显式 `vitest/browser` 测试仍有 2 个环境失败。因此不能把本次验证视为完整 CI 通过。

## 合并建议

先修复全部 P1 问题，再补齐对应的畸形输入测试，至少覆盖：原型链 format 名、非法 format 字面量、循环 DTO/字段值、多个目标主键。P2 问题应在同一功能发布前处理，否则生成结果和错误对象仍存在静默数据损坏路径。
