---
id: US-012c
title: 字段值校验、生成器透传与三框架契约
status: Backlog
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-13
updated: 2026-08-13
tags: [core, model, metadata, validation, generator, angular, react, vue]
inherited_acs:
  - from: US-012
    ac: 5
    note: 原 AC#5，urlScheme 与 JSON-safe 规范化值。
  - from: US-012
    ac: 8
    note: 原 AC#8，multiSelect 非法选项值。
  - from: US-012
    ac: 13
    note: 仅原 AC#13c 的尾句，加密字段的校验错误省略 value（D12）；DTO 侧忠实输出由 US-012b 承接。
  - from: US-012
    ac: 15
    note: 原 AC#15，生成器透传与 default 语义保留；已拆成透传与失败路径两条。
  - from: US-012
    ac: 18
    note: 原 AC#18，既有回归、三框架复用同一组 fixture 与覆盖率门禁。
---

<!--
INVEST 检查清单:
- [x] Independent: 依赖 US-012a 的 format 与 US-012b 的 descriptor，但校验规则、生成器与三框架回归自成一条交付线
- [x] Negotiable: 规则覆盖矩阵的用例组织方式与 fixture 目录位置可在实现前调整
- [x] Valuable: 前端拿到的 format 能真正参与写入前校验，且三端行为一致
- [x] Estimable: 规则集在 D11 / D12 已完全列举（16 条 FieldValidationRule），生成器改动面限于两个透传点
- [x] Small: 一个纯函数 + 生成器透传 + 三端 fixture 回归；不含 UI、不接入 repository 写路径
- [x] Testable: 每条规则有通过/失败用例，生成器输出可编译判定，三端跑同一组 fixture
-->

# 用户故事：字段值校验、生成器透传与三框架契约

> 设计契约见 [US-012](./US-012-field-semantic-metadata.md) 的 INV-1～INV-6 与 D5、D9～D12。
> 本故事不重述那些决策，只承接落地与验收。

## 前置依赖

`validateFieldValue()` 的入参是 US-012b 的 `EntityFieldDescriptor`，其 `format` 类型来自 US-012a。
两者都未落地时本故事不可开工——这是三个子故事里唯一的硬顺序约束。

## 作为/我想要/以便

**作为** 使用实体字段描述的应用开发者
**我想要** 用同一份字段描述在写入前校验值，并且生成的客户端代码与三框架绑定表现一致
**以便** format 不只是展示提示，而是真正参与数据正确性判断，且换框架不改校验逻辑

## 范围边界

### In Scope

- `validateFieldValue(descriptor, value): FieldValidationError | null` 纯函数（D11），覆盖 `FieldValidationRule` 全部 16 条
- `FieldValidationError` / `FieldValidationRule` / `JsonValue` 的 additive 扩展与 `value` 规范化（D12）
- 旧 `validateEntityFieldValue(field, value)` 冻结 + `@deprecated`（D5）
- `rxdb-client-generator` 对 `format` / `enum` / `options` 的透传，以及 `default` 语义保留与无法安全生成时的显式失败（D10）
- Angular / React / Vue 三端复用同一组 core DTO fixture 的契约回归
- 更新 `requirements/api-baseline/rxdb.json` 中本故事新增的导出

### Out of Scope

- 把 `validateFieldValue()` 接进 repository 写路径或 API 层（D11：本故事只交付纯函数）
- `format` 接口定义与注册期校验 —— 属 [US-012a](./US-012a-field-format-declaration.md)
- DTO 派生与解析器 —— 属 [US-012b](./US-012b-entity-fields-dto.md)
- 富文本净化（只保证 `contentType` 无损传递）
- 把字段展示元数据硬编码进任一框架的专属组件

## 验收标准

| #   | 原 AC   | 前置条件                                                                   | 操作                                                            | 预期结果                                                                                                                                                                | 状态 |
| --- | ------- | -------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 5       | URL 字段声明 `schemes: ['https']`                                          | 对 `http://` 与非 URL 文本调用 `validateFieldValue()`           | 返回 `rule: 'urlScheme'` 且 `value` 是 JSON-safe 规范化字符串；合法 `https://` 返回 `null`，不回显不可安全序列化的原始对象                                                  | ⬜   |
| 2   | 8       | `stringArray` + `enum` + `multiSelect`                                     | 对含非法选项值的数组调用 `validateFieldValue()`                 | 返回带字段名、`rule: 'multiSelect'` 和非法值的结构化错误；合法数组返回 `null`                                                                                              | ⬜   |
| 3   | 新增    | `FieldValidationRule` 的 16 条规则                                         | 参数化用例逐条走通过与失败两条路径                              | 每条规则至少各有一组用例；失败路径返回的 `rule` 与规则名一一对应，不出现 `rule` 缺失或串味；无任何规则只有 happy path                                                       | ⬜   |
| 4   | 新增    | 值分别为 `Date`、`bigint`、`Uint8Array`、函数、`Map`、实体实例             | 触发校验失败并读取返回的 `value`                                | 按 D12 规范化：ISO 8601 字符串 / 十进制字符串 / 小写 hex；后三类省略 `value`；`JSON.stringify(error)` 不抛且往返无损                                                        | ⬜   |
| 5   | 13c(尾) | 字段声明 `encrypted: true`                                                 | 用任意非法值触发校验失败                                        | 错误对象**始终**省略 `value`（D12），无论该值本身是否 JSON-safe；`field`、`message`、`rule` 正常返回                                                                        | ⬜   |
| 6   | 新增    | 四种关系的 `EntityFieldDescriptor`                                         | 对合法与非法 ID 值调用 `validateFieldValue()`                   | 只按 `relation.mutation` 校验 ID 形状（单值 vs 数组）与 `valueType`；不发起任何 repository / adapter 调用（用 spy 断言零调用），不校验目标记录是否存在                     | ⬜   |
| 7   | 14      | 同一份元数据与同一组值                                                     | 调用旧 `validateEntityFieldValue()`                             | 与实施前的输入/输出对表逐项一致（含返回 `null` 的分支）；`@deprecated` 注释不改变运行时行为                                                                                | ⬜   |
| 8   | 15      | 实体元数据含 `format`、`enum`、`options`                                   | 运行生成器并编译输出                                            | 三者完整透传到生成代码且可编译；Angular / React / Vue 的类型表现一致                                                                                                      | ⬜   |
| 9   | 15      | 实体元数据含常量 `default`、工厂 `default`、`'CURRENT_TIMESTAMP'` 字面量   | 运行生成器                                                      | 可表达的常量/工厂语义保留；无法安全生成时**显式失败**并指出实体名与字段名；禁止 `JSON.stringify` 静默丢弃函数型 `default`                                                  | ⬜   |
| 10  | 18      | 现有 core、`rxdb-client-generator` 及三框架契约测试                        | 执行回归                                                        | 既有字段、关系、计算属性与生成代码无回归；`packages/rxdb` 覆盖率 ≥ 90%                                                                                                     | ⬜   |
| 11  | 18      | 三框架均已接入字段描述                                                     | 检查三端源码与 api-baseline                                     | Angular / React / Vue 直接复用 core 的 parser 与同一组 JSON fixture；任一端都不新增专属语义 API；三端 api-baseline 中与字段语义相关的导出为空集                            | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#3～AC#6 是新增的，不在原 24 条里。原 AC 只验了 `urlScheme` 与 `multiSelect` 两条规则，
> 但 D11 要求新函数实现全部 16 条、D12 定义了一整套 `value` 规范化契约、D9 规定关系只校验 ID 形状——
> 这三块此前没有任何 AC 覆盖，等于把最容易实现走样的部分留给了实现者自由发挥。
>
> AC#7 是原 AC#14 拆出来的第三个函数。US-012b 用快照锁 `extractEntityFields()` / `extractSystemFields()` 的结构，
> 但 `validateEntityFieldValue()` 返回的是 `null` 或错误对象，分支比结构重要，快照锁不住；
> 改用参数化输入/输出对表，与 AC#3 的矩阵共用同一组 fixture。
>
> AC#8 / AC#9 是原 AC#15 拆开的：透传成功和「无法安全生成时失败」是两条相反的路径，
> 合在一行里只要透传通过就容易被整行判绿。

## 技术笔记

- `validateFieldValue()` 必须是纯函数：不读全局状态、不访问 repository、不做 I/O。AC#6 用 spy 断言这一点。
- 新函数复用旧函数的 required、基础类型、日期、enum、JSON 规则，再叠加 `stringArray` / `numberArray` 与 format 校验（D11）。
  复用方式是提取共享内部函数，**不是**让新函数调用已冻结的旧函数——否则旧函数的行为改动会经由新函数外溢。
- 生成器侧要区分两个同名 `transitionMetadata`：本故事只改 `rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts:306` 那个把
  `EntityMetadata` 序列化回 `Entity(...)` 的透传点，不碰 `@aiao/rxdb` 的元数据合并（见父故事技术笔记）。
- 生成器与 DTO 是两层契约：生成器必须保留 `default`，DTO 按 D10 有意不输出 `default`。两者不冲突，测试时不要互相套用。
- 三端 fixture 放 core 侧单一目录，三个框架包各自 import，不复制。复制即视为违反 AC#11。
- 覆盖率门禁：`packages/rxdb` ≥ 90%。

## 实现文件

- `packages/rxdb/src/entity/entity-value.utils.ts` — `validateFieldValue()`、`FieldValidationRule` / `JsonValue` 扩展、`value` 规范化；旧 `validateEntityFieldValue` 冻结 + `@deprecated`
- `packages/rxdb/src/index.ts` — 导出新函数与类型
- `packages/rxdb/src/__tests__/entity/` — 16 条规则的参数化矩阵、关系 ID 形状、加密字段省略 `value`
- `packages/rxdb/src/__tests__/fixtures/` — 三框架共享的 DTO JSON fixture（新增）
- `packages/rxdb-client-generator/src/core/RxDBClientGenerator.utils.ts` — `format` / `enum` / `options` 透传与 `default` 显式失败
- `packages/rxdb-angular/` `packages/rxdb-react/` `packages/rxdb-vue/` — 复用 core fixture 的契约回归
- `requirements/api-baseline/rxdb.json`

## References

- [US-012 扩展字段语义与前端通信契约（契约父故事）](./US-012-field-semantic-metadata.md)
- [US-012a 字段 format 声明与注册期校验](./US-012a-field-format-declaration.md)
- [US-012b 实体字段描述 DTO](./US-012b-entity-fields-dto.md)
