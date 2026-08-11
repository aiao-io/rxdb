---
id: US-011
title: 定义 bigint 与 binary 类型及公共 API 契约
status: Done
priority: High
epic: epic-005-type-system-evolution
created: 2026-07-30
updated: 2026-08-01
tags: [core, model, entity, type-system, client-generator]
---

<!--
INVEST 检查清单:
- [x] Independent: 类型契约和代码生成可以独立验收；Epic 只控制对外发布
- [x] Negotiable: 内部类型别名和生成器组织可以调整
- [x] Valuable: 让模型声明、公共 API 和生成代码对新类型保持一致
- [x] Estimable: 范围限于 core 类型、实体默认值和客户端生成器
- [x] Small: 不包含数据库映射、change codec、加密和 DevTools
- [x] Testable: 编译期契约、生成快照和默认值隔离 AC 明确
-->

# 用户故事：定义 bigint 与 binary 类型及公共 API 契约

## 作为/我想要/以便

**作为** 数据模型开发者
**我想要** 用 `PropertyType.bigint` 和 `PropertyType.binary` 声明字段
**以便** 模型、查询、主键、关系和生成客户端使用同一份类型安全契约

## 领域契约

| PropertyType | TypeScript / 运行时类型 | 值域与语义                                 |
| ------------ | ----------------------- | ------------------------------------------ |
| `bigint`     | `bigint`                | 有符号 64 位整数，范围 `-2^63` 到 `2^63-1` |
| `binary`     | `Uint8Array`            | 当前视图中的字节序列，按长度与逐字节值相等 |

`Buffer` 不是公开契约。Node.js `Buffer` 因继承 `Uint8Array` 可以作为输入，但公开类型、TSDoc 和跨平台测试统一使用 `Uint8Array`。

`Uint8Array` 是可变对象，必须遵守以下规则：

- 直接声明的 binary 默认值按实体复制，两个实体不得共享同一引用
- 工厂默认值每个实体调用一次，实体拥有返回值的独立副本
- `subarray()` 只表示当前视图范围，不得连同视图外的 backing buffer 一起处理
- 原地修改字节不会触发实体 Proxy；需要持久化变更时必须重新赋值

## 范围边界

### In Scope

- `PropertyType` 新增 `bigint` 与 `binary`
- 新增对应属性元数据接口，并纳入 `EntityPropertyMetadataOptions` / `EntityPropertyMetadata`
- 新增公开 `RxDBEntityId = string | number | bigint`，替换实体、Repository、HistoryScope 等公共 API 中重复的 ID 联合
- bigint 支持 `primary`、`unique`、`sortable`、索引和关系外键元数据
- binary 支持 nullable、required、readonly、unique 与索引元数据，不支持 primary 或关系外键
- 新增 bigint 与 binary 查询规则类型；生成客户端不得丢字段或暴露非法 operator
- 客户端生成器支持 bigint ID、RuleGroup、orderBy、`get(1n)` 和关系 ID
- 装饰器同时接受枚举值与字符串字面量
- `extractEntityFields()` 原样暴露新字段类型，不增加针对单个标量的特殊分支
- 默认值类型检查和 binary 默认值隔离
- TSDoc 明确运行时类型、值域、可变性、adapter 支持范围和 Epic 发布门禁

### Out of Scope

- 数据库列映射、绑定、读取、索引与运行时查询（US-206）
- change、系统表迁移、undo / redo、branch 和跨 Tab 编码（US-303）；跨 realm writer lease 与 fencing（US-304）
- 加密字段（US-804）与 DevTools 展示（US-903）
- `bigint[]`、`binary[]` 以及 keyValue / json 内嵌 bigint/binary
- decimal、任意精度整数和大于有符号 64 位的 bigint
- Blob、ArrayBuffer、Stream 与零拷贝 API

## 验收标准

| #   | 前置条件                                       | 操作                           | 预期结果                                                                        | 状态 |
| --- | ---------------------------------------------- | ------------------------------ | ------------------------------------------------------------------------------- | ---- |
| 1   | 使用枚举值或 `'bigint'` / `'binary'`           | 编译并注册实体元数据           | 解析为对应 `PropertyType`，公共联合类型完整                                     | ✅   |
| 2   | bigint 默认值                                  | 传入 bigint 或 `() => bigint`  | 编译通过；number/string 默认值编译失败                                          | ✅   |
| 3   | binary 默认值                                  | 传入 Uint8Array 或工厂         | 编译通过；number[]/string 默认值编译失败                                        | ✅   |
| 4   | 两个实体使用同一个 binary 常量默认值           | 分别创建并修改其中一个         | 两个字段引用不同，另一个实体字节不变                                            | ✅   |
| 5   | binary 工厂默认值                              | 创建两个实体                   | 工厂调用两次，两个实体拥有独立字节副本                                          | ✅   |
| 6   | binary 字段持有 `source.subarray(1, 3)`        | 读取实体字段                   | 只包含视图内两个字节，不扩大到整个 backing buffer                               | ✅   |
| 7   | bigint primary                                 | 编译实体公共 API               | `RxDBEntityId`、派生 `idType`、Repository `get(1n)` 与 HistoryScope 接受 bigint | ✅   |
| 8   | 生成 bigint primary 客户端                     | 运行 generator 并编译输出      | `get`、初始化数据、关系 ID 和查询 value 均为 bigint                             | ✅   |
| 9   | bigint 字段查询                                | 编译 RuleGroup                 | 允许比较、IN、BETWEEN、排序；拒绝 LIKE/contains                                 | ✅   |
| 10  | binary 字段查询                                | 编译 RuleGroup                 | 只允许等值、不等值、IN、NOT IN、null 检查；拒绝范围、LIKE 与排序                | ✅   |
| 11  | bigint 主键被一对多或多对多关系引用            | 生成关系类型                   | 外键与中间表 ID 为 bigint，不退化为 UUID/string                                 | ✅   |
| 12  | binary 声明 primary 或关系外键                 | TypeScript 编译                | 编译失败                                                                        | ✅   |
| 13  | 读取 `propertyMap` / `extractEntityFields()`   | 检查全部元数据                 | 新类型、columnName、nullable、unique、primary、sortable 等信息不丢失            | ✅   |
| 14  | 声明 bigint[]、binary[] 或 keyValue 内嵌新类型 | TypeScript 编译                | 编译失败；json 字段仍遵守既有 JSON-safe 运行时契约                              | ✅   |
| 15  | 现有 PropertyType 与生成客户端 fixture         | 运行 core / generator 回归测试 | 公开类型与生成结果无回归                                                        | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- `EntityFieldType` 已包含整个 `PropertyType`，不得为新类型追加重复联合成员
- `propertyToField()` 对普通标量统一透传，只有携带额外 schema 的类型允许专门分支
- 不为 bigint/binary 在 Proxy setter 增加专用类型分支；持久化边界统一校验运行时值
- binary 原地修改不自动追踪，公开 TSDoc 必须要求重新赋值
- `BigIntRules` 与 `BinaryRules` 可以复用现有规则原语，但生成器映射必须穷尽
- 所有新增公开导出必须更新 API baseline，并按版本策略标注 additive change

## 实现文件

- `packages/rxdb/src/entity/` — PropertyType、RxDBEntityId、元数据与默认值隔离
- `packages/rxdb/src/repository/`、`packages/rxdb/src/version/` — ID 与查询公共类型
- `packages/rxdb-client-generator/src/` — ID、查询规则与关系类型生成
- `packages/rxdb/src/__tests__/contracts/` — 合法与非法公共类型契约
- `packages/rxdb-client-generator/src/__tests__/` — 生成快照与编译 fixture
- `requirements/api-baseline/` — 新增公开导出的表面基线

## References

- [US-206 本地适配器持久化与查询](../adapter/US-206-bigint-binary-adapter.md)
- [US-303 change codec 与系统迁移](../collaboration/US-303-bigint-binary-change-codec.md)
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md)
- [SQLite Datatypes](https://www.sqlite.org/datatype3.html)
- [PostgreSQL Numeric Types](https://www.postgresql.org/docs/current/datatype-numeric.html)
