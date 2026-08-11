---
id: US-206
title: 本地适配器持久化与查询 bigint/binary
status: Done
priority: High
epic: epic-005-type-system-evolution
created: 2026-07-30
updated: 2026-08-01
tags: [adapter, sqlite, pglite, type-mapping, query]
---

<!--
INVEST 检查清单:
- [ ] Independent: 依赖 US-011 的公共类型契约
- [x] Negotiable: SQL 映射、绑定和内部校验结构可以调整
- [x] Valuable: 保证本地 adapter 的 CRUD、查询、索引和关系不丢值
- [x] Estimable: 五个本地 adapter 共用两套能力测试
- [x] Small: 不包含 change codec、系统迁移、同步、加密和 DevTools
- [x] Testable: 每个数据路径都有 round-trip 或 fail-fast AC
-->

# 用户故事：本地适配器持久化与查询 bigint/binary

## 作为/我想要/以便

**作为** Local-first 应用开发者
**我想要** bigint / binary 字段在 SQLite family 与 PGlite 中原生持久化和查询
**以便** CRUD、索引、分页和关系操作保持原始类型与精确值

## 支持矩阵

| Adapter                    | bigint  | binary | 本 story 要求                           |
| -------------------------- | ------- | ------ | --------------------------------------- |
| `rxdb-adapter-sqlite`      | INTEGER | BLOB   | 必须通过 SQLite 共享套件                |
| `rxdb-adapter-sqlite-wasm` | INTEGER | BLOB   | 必须通过 SQLite 共享套件                |
| `rxdb-adapter-wa-sqlite`   | INTEGER | BLOB   | 必须通过 SQLite 共享套件                |
| `rxdb-adapter-sqliteai`    | INTEGER | BLOB   | 必须通过 SQLite 共享套件                |
| `rxdb-adapter-pglite`      | bigint  | bytea  | 必须通过等价套件                        |
| `rxdb-adapter-supabase`    | 未支持  | 未支持 | 仅对实际绑定远端的实体在 connect 时拒绝 |

## 范围边界

### In Scope

#### 持久化与默认值

- SQLite：bigint 映射为 INTEGER，binary 映射为 BLOB
- PGlite：bigint 映射为 bigint，binary 映射为 bytea
- bigint 仅接受 JS `bigint`，并在执行 SQL 前校验有符号 64 位范围
- binary 仅接受 `Uint8Array`，只绑定当前视图范围
- PGlite 读取保持驱动返回的 JS bigint / Uint8Array，不增加 string fallback
- 所有类型映射穷尽处理；未知 PropertyType 抛错，不回退 TEXT/text
- bigint 常量默认值可以生成等价数据库默认值
- binary 默认值和所有工厂默认值在实体/写入边界解析；DDL 不得调用工厂并固化单次结果

#### 索引、查询与关系

- bigint 支持比较、IN、NOT IN、BETWEEN、排序、游标分页与索引
- binary 支持按字节等值、不等值、IN、NOT IN 与索引
- binary 范围、排序和 LIKE 系列 operator 在执行 SQL 前 fail-fast
- 查询值全部参数化，不拼接二进制或超安全整数 SQL 字面量
- PGlite bigint 索引使用 `int8_ops`，binary 索引使用 `bytea_ops`
- bigint primary 在一对一、一对多、多对一、多对多关系中生成 bigint 外键
- 关系 JOIN、懒加载、中间表、级联删除和主键更新限制保持现有行为

#### Supabase 拒绝策略

- 只有解析后的实体 sync 配置实际使用 Supabase remote 时，bigint/binary 才导致 connect fail-fast
- local-only 实体可以与其他 Supabase 实体共存，不得因含新类型而阻止整个数据库连接
- 若调用方绕过 connect 校验请求不支持的远程 Repository，操作仍必须 fail-fast

### Out of Scope

- change trigger、patch / inversePatch 和系统表迁移（US-303）
- 跨 realm writer lease、迁移排空和 fencing（US-304）
- undo / redo、branch 与跨 Tab（US-303）
- 远程 push / pull；本 Epic 不支持新类型远程同步
- 加密字段（US-804）与 DevTools（US-903）
- Supabase 列创建、RPC、PostgREST、Realtime 和新类型远程同步
- bigint[]、binary[]、内嵌新类型、任意精度 bigint
- Blob、ArrayBuffer、Stream 与大文件分块 API

## 验收标准

### Schema、CRUD 与默认值

| #   | 前置条件                         | 操作                            | 预期结果                                     | 状态 |
| --- | -------------------------------- | ------------------------------- | -------------------------------------------- | ---- |
| 1   | bigint primary                   | SQLite/PGlite 建表              | 分别为 INTEGER/bigint PRIMARY KEY            | ✅   |
| 2   | binary 字段                      | SQLite/PGlite 建表              | 分别为 BLOB/bytea                            | ✅   |
| 3   | `2^63-1`、`-2^63`                | 五个本地 adapter 写入并读取     | 返回值严格等于原 bigint                      | ✅   |
| 4   | 超出 64 位范围                   | 写入                            | 执行 SQL 前抛 TypeError                      | ✅   |
| 5   | Uint8Array 含 `0x00`、`0xff`     | 五个本地 adapter 写入并读取     | 长度和每个字节完全一致                       | ✅   |
| 6   | `source.subarray(1, 3)`          | 写入并读取                      | 只持久化当前视图的两个字节                   | ✅   |
| 7   | bigint 传 number/string          | 写入                            | 抛 TypeError，不隐式转换                     | ✅   |
| 8   | binary 传 number[]/string/object | 写入                            | 抛 TypeError，不隐式转换                     | ✅   |
| 9   | bigint 常量默认值                | 省略字段后创建实体或直接 INSERT | 两条路径结果均为 bigint 且值一致             | ✅   |
| 10  | binary 常量或工厂默认值          | 连续创建两个实体                | 每个实体独立解析；DDL 不固化工厂的第一次结果 | ✅   |
| 11  | 未知 PropertyType                | 生成 schema                     | 抛错，不回退 TEXT/text                       | ✅   |

### 查询、索引与关系

| #   | 前置条件                                | 操作                            | 预期结果                                                | 状态 |
| --- | --------------------------------------- | ------------------------------- | ------------------------------------------------------- | ---- |
| 12  | bigint 数据含超安全整数                 | 执行比较、IN、BETWEEN、排序查询 | SQLite family 与 PGlite 返回一致结果                    | ✅   |
| 13  | bigint 排序字段与 bigint primary        | 执行前后向游标分页              | 无重复、无遗漏，游标值保持 bigint                       | ✅   |
| 14  | 相同字节来自不同 Uint8Array/不同 buffer | 执行等值、IN、NOT IN 查询       | 按长度和逐字节值判断，SQLite/PGlite 结果一致            | ✅   |
| 15  | binary 字段                             | 执行 LIKE、BETWEEN、`>` 或排序  | 执行 SQL 前 fail-fast                                   | ✅   |
| 16  | bigint / binary 字段建索引              | 检查 schema                     | SQLite 使用列索引；PGlite 使用 `int8_ops` / `bytea_ops` | ✅   |
| 17  | bigint / binary 查询                    | 检查生成 SQL 与 params          | 值只存在于 params，不进入 SQL 字面量                    | ✅   |
| 18  | bigint primary 被四种关系引用           | 创建、查询和 eager/lazy load    | 外键值保持 bigint，JOIN 结果正确                        | ✅   |
| 19  | bigint 多对多关系                       | 写入中间表并级联删除            | 中间表两侧类型正确，既有 cascade 规则不变               | ✅   |

### Supabase 与回归

| #   | 前置条件                                       | 操作                  | 预期结果                                          | 状态 |
| --- | ---------------------------------------------- | --------------------- | ------------------------------------------------- | ---- |
| 20  | 新类型实体配置 Supabase remote                 | connect               | 抛明确 unsupported-property-type 错误，无网络请求 | ✅   |
| 21  | 新类型实体 local-only，其他实体使用 Supabase   | connect               | 连接成功，新类型实体继续使用本地 adapter          | ✅   |
| 22  | 绕过 connect 获取不支持的新类型远程 Repository | 发起 CRUD/查询        | 操作前 fail-fast                                  | ✅   |
| 23  | 既有 PropertyType、关系和查询 fixture          | 运行 adapter 回归套件 | 用户可见行为不变                                  | ✅   |

状态符号：⬜ 未开始 / ⚠️ 进行中或有保留 / ✅ 通过

## 技术约束

- SQLite 四个具体 adapter 必须跑共享 round-trip 套件，不能只测 sqlite-core
- SQLite 驱动绑定能力必须分别验证 bigint 边界和 Uint8Array 视图，不能只验证公共类型声明
- binary 查询的相等语义是值相等，不是 JavaScript 引用相等
- PGlite 不得基于过时的“bigint 返回 string”假设增加 fallback
- Supabase 校验读取解析后的 entity sync 配置，不扫描后无条件拒绝全部实体
- 本 story 在 US-011 后可以单独标记 Done，但 Epic 发布前还必须满足 US-303、US-304、US-804、US-903

## 实现范围

- `packages/rxdb-adapter-sqlite-core/src/` — 类型映射、参数绑定、读取、查询与 schema
- `packages/rxdb-adapter-{sqlite,sqlite-wasm,wa-sqlite,sqliteai}/src/` — 驱动差异和共享套件
- `packages/rxdb-adapter-pglite/src/` — 类型映射、查询、索引与关系
- `packages/rxdb-adapter-supabase/src/` — 按实体 sync 配置执行 unsupported type 校验
- `packages/rxdb-test/src/testing/` — 跨 adapter CRUD/query/relationship fixture

## References

- [US-011 类型与公共 API 契约](../core/US-011-property-type-bigint-binary.md)
- [US-303 change codec 与系统迁移](../collaboration/US-303-bigint-binary-change-codec.md)
- [US-304 跨 realm writer lease 与迁移 fencing](../collaboration/US-304-writer-lease-migration-fencing.md)
- [SQLite JSON1](https://www.sqlite.org/json1.html)
- [PostgreSQL Binary Data Types](https://www.postgresql.org/docs/current/datatype-binary.html)
- [PostgreSQL Operator Classes](https://www.postgresql.org/docs/current/indexes-opclass.html)
