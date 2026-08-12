---
id: US-012a
title: 字段 format 声明与注册期校验
status: Backlog
priority: High
epic: epic-005-type-system-evolution
created: 2026-08-13
updated: 2026-08-13
tags: [core, model, metadata, field-type, validation]
inherited_acs:
  - from: US-012
    ac: 1
    note: 原 AC#1，旧元数据无 format 时的行为不变。
  - from: US-012
    ac: 2
    note: 原 AC#2 与 AC#2b，format 不改变值类型与持久化列类型（INV-2）。
  - from: US-012
    ac: 3
    note: 原 AC#3，richText 缺 contentType 的编译期与运行时双层拦截。
  - from: US-012
    ac: 7
    note: 原 AC#7，cardinalityConflict。
  - from: US-012
    ac: 9
    note: 原 AC#9 与 AC#9b，格式配置校验与跨实体聚合抛错。
  - from: US-012
    ac: 10
    note: 原 AC#10 与 AC#10b，enum / options 规则。
  - from: US-012
    ac: 12
    note: 仅原 AC#12b，关系不接受 format（formatOnRelation）。
  - from: US-012
    ac: 17
    note: 原 AC#17，未知 / 不匹配 / 非法配置的 format。
---

<!--
INVEST 检查清单:
- [x] Independent: 只改 metadata-options 类型与新增一个纯函数校验器，不依赖 DTO 与值校验
- [x] Negotiable: format 接口的可选配置项与规则标识命名可在实现前调整
- [x] Valuable: 作者写错 format 组合时在注册期一次报全，而不是运行到前端才发现
- [x] Estimable: 16 个 format 接口与 12 条规则已在 US-012 的 D2/D3/D4 定死
- [x] Small: 不含 DTO、不含值校验、不含生成器与三框架；产物是类型 + 一个纯函数 + init() 的接线
- [x] Testable: 编译期用例（@ts-expect-error / expectTypeOf）与运行时规则用例一一对应
-->

# 用户故事：字段 format 声明与注册期校验

> 设计契约见 [US-012](./US-012-field-semantic-metadata.md) 的 INV-1～INV-6 与 D2 / D3 / D4。
> 本故事不重述那些决策，只承接落地与验收。

## 作为/我想要/以便

**作为** 定义实体模型的开发者
**我想要** 在属性上声明业务语义 `format`，并在注册实体时一次性拿到全部声明错误
**以便** 错误的 format / enum / 单值多值组合在开发期就被挡住，而不是让前端在运行时按字段名猜

## 范围边界

### In Scope

- 16 个 `FieldFormat` 判别对象接口与 `FieldFormat` 联合，从 `@aiao/rxdb` 导出（见 US-012「字段语义契约 → format」）
- **逐属性接口**的窄类型 `format?`（D4）；`IEntityObject` 与四种关系接口一律不加
- `StringArrayProperty` 新增可选 `enum`，`EnumProperty` / `StringArrayProperty` 新增可选 `options`（D2）
- 新增 `validateEntityMetadata(metadata): readonly EntityMetadataValidationError[]` 纯函数与 `MetadataValidationRule` 联合（D3）
- `EntityManager.init()` 对 `config.entities` 收集全部违规后一次抛出 `RxDBError`；`boundTypes` 回滚逻辑不变（D3）
- 更新 `requirements/api-baseline/rxdb.json` 中本故事新增的类型与导出

### Out of Scope

- `describeEntityFields()` / DTO / 解析器 —— 属 [US-012b](./US-012b-entity-fields-dto.md)
- `validateFieldValue()` 与字段**值**校验 —— 属 [US-012c](./US-012c-field-value-validation-codegen.md)
- 生成器透传与三框架契约回归 —— 属 US-012c
- `missingRelationPrimary` / `unsupportedRelationValueType` 两条规则的**产出**：它们由关系目标解析阶段报告，属 US-012b；本故事只在 `MetadataValidationRule` 联合中预留标识
- 把加密列约束上提到 core（D13）
- `attachment` / `user` format（D4）

## 验收标准

| #   | 原 AC | 前置条件                                                            | 操作                                          | 预期结果                                                                                                                                                | 状态 |
| --- | ----- | ------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ---- |
| 1   | 1     | 现有实体只声明 `PropertyType`                                       | 注册并读取旧元数据                            | 行为与既有公共类型不变；未声明 `format` 的字段在元数据里不出现 `format` 键，不填默认值                                                                  | ⬜   |
| 2   | 2     | `string` 字段声明 `url` / `email` / `phone`                         | 编译并注册实体                                | 类型合法；元数据保留 format 判别对象；生成的物理列类型仍是字符串                                                                                        | ⬜   |
| 3   | 2b    | 同一实体的两份元数据，唯一差异是其中一份字段带 `format`             | 分别生成 schema、写入同一份数据、读回并序列化 | 物理列类型、运行时值类型与序列化结果完全一致（INV-2）                                                                                                   | ⬜   |
| 4   | 3     | `string` 字段声明 `richText`                                        | 未提供 `contentType`                          | 类型测试（`@ts-expect-error` + `expectTypeOf`）确认声明不可编译；绕过类型的运行时配置在 `EntityManager.init()` 抛 `RxDBError`，消息含实体名、字段名与 `missingFormatConfig` | ⬜   |
| 5   | 7     | `enum` 字段声明 `multiSelect`，或 `stringArray` 声明 `singleSelect` | 注册实体                                      | 抛 `cardinalityConflict`；多选必须用带 `enum` 的 `stringArray`（INV-3）                                                                                 | ⬜   |
| 6   | 9     | `number` 字段声明 `currency` / `percentage` / `rating` / `duration` | 注册缺少必需配置或 `min > max` 的元数据       | 抛 `missingFormatConfig` / `invalidRange`；同一实体的多个字段错误在一次异常中全部报出                                                                   | ⬜   |
| 7   | 9b    | `config.entities` 中有两个实体各带违规字段                          | `EntityManager.init()`                        | 一次异常同时报出两个实体的全部违规（D3 跨实体聚合），不在第一个实体处中断；`boundTypes` 全部回滚，无残留注册                                            | ⬜   |
| 8   | 10    | `stringArray` 声明 `multiSelect` 但缺 `enum`；或 `options` 键越界   | 注册实体                                      | 分别抛 `missingEnum` / `enumOptionsMismatch`                                                                                                            | ⬜   |
| 9   | 10b   | `enum` 含重复值                                                     | 注册实体                                      | 抛 `duplicateEnum`，错误指出字段名和重复值                                                                                                              | ⬜   |
| 10  | 12b   | 关系元数据上声明任意 `format`                                       | 类型检查 + 绕过类型后注册实体                 | 四种 kind 的关系接口在类型层均不接受 `format`（`@ts-expect-error`）；运行时注册抛 `formatOnRelation` 并指出关系名（D4）                                 | ⬜   |
| 11  | 17    | 使用未知 `format.kind`、与 `PropertyType` 不匹配的组合或非法配置    | 注册实体                                      | 分别抛 `unknownFormat` / `formatTypeMismatch` / `invalidFormatConfig`（含 scheme、currency、colorSpace、display 等），指出字段名，不静默降级            | ⬜   |
| 12  | 新增  | 同一份违规元数据                                                    | 分别走类型检查与 `validateEntityMetadata()`   | 两层判定结论一致：类型拒绝的组合运行时必然报错，运行时接受的组合类型必然合法；不存在「类型拒绝、运行时放行」或反向的分叉（D4）                          | ⬜   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

> AC#12 是新增的，不在原 US-012 的 24 条里。D4 声称「编译期与运行时必须使用同一组格式定义和取值域」，
> 但原 AC 表把编译期用例（AC#3、AC#12b）与运行时用例（AC#9、AC#10、AC#17）分开验，
> 没有任何一条检查两者是否一致——而这正是双层校验最容易长期漂移的地方。
> 落地方式：规则表与 format 定义共用一份数据源，类型级用例与运行时用例读同一组 fixture。

## 技术笔记

- 校验点是「读到 metadata 之后、注册 manager 之前」，不需要也不应该重跑 `transitionMetadata()`（D3）。
- `validateEntityMetadata()` 必须是纯函数，返回按 `namespace/entity/field/rule` 排序的错误数组，不得在首个错误处抛出。
- `MetadataValidationRule` 联合在本故事一次性定全 12 项，其中 `missingRelationPrimary` / `unsupportedRelationValueType`
  由 US-012b 的关系解析阶段产出；本故事的 `validateEntityMetadata()` 在没有目标实体解析器时不返回这两类错误。
- 覆盖率门禁：`packages/rxdb` ≥ 90%。

## 实现文件

- `packages/rxdb/src/entity/metadata-options.interface.ts` — format 判别联合与逐属性 `format?`；`StringArrayProperty.enum`、`options`
- `packages/rxdb/src/entity/metadata-validate.ts`（新增）— `validateEntityMetadata` 与规则表
- `packages/rxdb/src/entity/entity-manager.ts` — `init()` 跨实体聚合校验
- `packages/rxdb/src/__tests__/entity/field-semantic.types.spec.ts`（新增）— `@ts-expect-error` / `expectTypeOf` 类型级用例
- `packages/rxdb/src/__tests__/entity/` — 运行时规则用例与跨实体聚合用例
- `requirements/api-baseline/rxdb.json`

## References

- [US-012 扩展字段语义与前端通信契约（契约父故事）](./US-012-field-semantic-metadata.md)
- [US-012b 实体字段描述 DTO](./US-012b-entity-fields-dto.md)
- [US-001 定义数据模型](./US-001-model-definition.md)
