# rxdb-adapter-sqlite-core 注释审计报告

> 仅生成诊断报告，**未修改任何文件**。

## 1. 摘要统计

- 源文件总数：**114**
- 受影响文件数：**78**
- 注释问题总数：**219**
- 缺失 TSDoc 的导出 API 数：**41**

### 1.1 注释问题按类型分布

| 类型             | 数量 |
| ---------------- | ---- |
| 英文行内注释     | 100  |
| 冗余/废话注释    | 84   |
| 英文 TSDoc/JSDoc | 32   |
| 空注释           | 2    |
| TODO/FIXME/XXX   | 1    |

### 1.2 受影响文件（按问题数降序）

| 文件路径                                                | 行数 | 注释问题 | 缺 TSDoc 导出 |
| ------------------------------------------------------- | ---- | -------- | ------------- |
| `__tests__/RxDBAdapterSqliteBase.spec.ts`               | 1464 | 24       | 0             |
| `index.ts`                                              | 195  | 20       | 0             |
| `__tests__/query/query_sql.utils.spec.ts`               | 1245 | 16       | 0             |
| `sqlite-backend.interface.ts`                           | 108  | 14       | 0             |
| `__tests__/query/join_sql.spec.ts`                      | 463  | 12       | 0             |
| `__tests__/trigger_sql.spec.ts`                         | 245  | 11       | 0             |
| `__tests__/sqlite-core.utils.spec.ts`                   | 1422 | 7        | 0             |
| `__tests__/table/create_table_sql.spec.ts`              | 349  | 7        | 0             |
| `transaction/SqliteTransactionExecutor.ts`              | 188  | 7        | 0             |
| `__tests__/version/switch_branch.spec.ts`               | 201  | 6        | 0             |
| `query/find_sql.ts`                                     | 58   | 6        | 0             |
| `Oo1ClientBase.ts`                                      | 436  | 5        | 0             |
| `__tests__/adapter-factory.ts`                          | 25   | 3        | 2             |
| `__tests__/fts5/build-fts.spec.ts`                      | 162  | 5        | 0             |
| `__tests__/query/find_sql.spec.ts`                      | 180  | 5        | 0             |
| `sqlite-core.interface.ts`                              | 114  | 5        | 0             |
| `sqlite-oo1-load.utils.ts`                              | 292  | 5        | 0             |
| `RxDBAdapterSqliteBase.ts`                              | 1312 | 4        | 0             |
| `__tests__/Oo1ClientBase.spec.ts`                       | 644  | 4        | 0             |
| `table/trigger_sql.ts`                                  | 229  | 4        | 0             |
| `testing.ts`                                            | 144  | 0        | 4             |
| `version/switch-result.utils.ts`                        | 257  | 0        | 4             |
| `__tests__/version/execute-switch-actions.spec.ts`      | 496  | 3        | 0             |
| `keyring/sqlite-core-keyring-storage.ts`                | 88   | 3        | 0             |
| `oo1-types.ts`                                          | 102  | 0        | 3             |
| `query/join_sql.ts`                                     | 554  | 2        | 1             |
| `query/query_tree_sql.ts`                               | 211  | 3        | 0             |
| `query/sql_alias.utils.ts`                              | 47   | 3        | 0             |
| `sqlite-core.utils.ts`                                  | 804  | 1        | 2             |
| `version/switch_branch.ts`                              | 163  | 3        | 0             |
| `__tests__/entity/insert_sql.spec.ts`                   | 376  | 2        | 0             |
| `__tests__/execute_oo1_helper.spec.ts`                  | 240  | 2        | 0             |
| `__tests__/query/count_sql.spec.ts`                     | 76   | 2        | 0             |
| `__tests__/shared-crud.suite.ts`                        | 3079 | 1        | 1             |
| `__tests__/shared-query-sql.suite.ts`                   | 948  | 1        | 1             |
| `__tests__/transaction_sqlite_result.spec.ts`           | 412  | 2        | 0             |
| `query/count_sql.ts`                                    | 42   | 2        | 0             |
| `sqlite-client.utils.ts`                                | 165  | 2        | 0             |
| `__tests__/fixtures/Todo.ts`                            | 15   | 0        | 1             |
| `__tests__/fts5/cjk-bigram.spec.ts`                     | 125  | 1        | 0             |
| `__tests__/query/query_sql.spec.ts`                     | 293  | 1        | 0             |
| `__tests__/query/query_tree_sql.spec.ts`                | 197  | 1        | 0             |
| `__tests__/repository/SqliteTreeRepository.spec.ts`     | 175  | 1        | 0             |
| `__tests__/rxdb_adapter_mutations.spec.ts`              | 378  | 1        | 0             |
| `__tests__/shared-adapter-construction.suite.ts`        | 30   | 0        | 1             |
| `__tests__/shared-bigint-binary-entity.suite.ts`        | 568  | 0        | 1             |
| `__tests__/shared-bigint-binary.suite.ts`               | 156  | 0        | 1             |
| `__tests__/shared-cascade-mutation.suite.ts`            | 1320 | 0        | 1             |
| `__tests__/shared-create-sqlite-client.suite.ts`        | 16   | 0        | 1             |
| `__tests__/shared-custom-primary-key.suite.ts`          | 269  | 0        | 1             |
| `__tests__/shared-join-sql.suite.ts`                    | 305  | 0        | 1             |
| `__tests__/shared-menu.suite.ts`                        | 2181 | 0        | 1             |
| `__tests__/shared-relations.suite.ts`                   | 628  | 0        | 1             |
| `__tests__/shared-repository.suite.ts`                  | 141  | 0        | 1             |
| `__tests__/shared-rxdb-adapter.suite.ts`                | 149  | 0        | 1             |
| `__tests__/shared-sqlite-client-batch-timeout.suite.ts` | 54   | 0        | 1             |
| `__tests__/shared-sqlite-client.suite.ts`               | 23   | 0        | 1             |
| `__tests__/shared-system-schema-migration.suite.ts`     | 290  | 0        | 1             |
| `__tests__/shared-table-index.suite.ts`                 | 190  | 0        | 1             |
| `__tests__/shared-transaction-result.suite.ts`          | 448  | 0        | 1             |
| `__tests__/shared-tree.suite.ts`                        | 1164 | 0        | 1             |
| `__tests__/shared-undo-redo.suite.ts`                   | 2126 | 0        | 1             |
| `__tests__/shared-version-branch.suite.ts`              | 1873 | 0        | 1             |
| `__tests__/sqlite-client.utils.spec.ts`                 | 104  | 1        | 0             |
| `__tests__/table/create_tables_sql.spec.ts`             | 67   | 1        | 0             |
| `__tests__/test-utils.ts`                               | 80   | 1        | 0             |
| `__tests__/testing-entry.spec.ts`                       | 146  | 1        | 0             |
| `create_sqlite_client.ts`                               | 239  | 0        | 1             |
| `entity/insert_sql.ts`                                  | 72   | 0        | 1             |
| `entity/update_sql.ts`                                  | 86   | 1        | 0             |
| `fts5/build-fts-triggers.ts`                            | 115  | 1        | 0             |
| `handle_rxdb_change.ts`                                 | 278  | 1        | 0             |
| `query/find_by_row_ids_sql.ts`                          | 17   | 1        | 0             |
| `query/query_sql.ts`                                    | 160  | 0        | 1             |
| `query/query_sql.utils.ts`                              | 867  | 1        | 0             |
| `repository/SqliteRepository.ts`                        | 84   | 1        | 0             |
| `repository/SqliteRepositoryBase.ts`                    | 77   | 1        | 0             |
| `rxdb_adapter_mutations.ts`                             | 190  | 1        | 0             |

---

## 2. 文件级详细诊断

### `__tests__/RxDBAdapterSqliteBase.spec.ts` (1464 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号       | 注释原文                                                                                                  | 建议                                                    |
| ---- | ---------------------- | -------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 105  | 冗余/废话注释（line）  | `<module>`     | `// 以错误的理由通过。`                                                                                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 128  | 冗余/废话注释（line）  | `createClient` | `// 序幕不是这些用例的被测对象，让它落进各自的覆盖实现只会制造与主题无关的失败。`                         | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 237  | 英文行内注释（line）   | `<module>`     | `// C2：序幕的分支读经 executor 直发 SQL（不再是 versionManager.getCurrentBranch），`                     | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 240  | 冗余/废话注释（line）  | `<module>`     | `// 而本用例的被测点正是「读不到分支时序幕失败」`                                                         | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 336  | 英文行内注释（line）   | `<module>`     | `// SQLC-020：client.disconnect() 抛错时，其后的 #cached_client/#client_promise 复位`                     | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 337  | 冗余/废话注释（line）  | `<module>`     | `// 全部被跳过 —— 重连会复用那个已经（可能部分）拆掉的死实例。`                                           | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 351  | 冗余/废话注释（line）  | `<module>`     | `// 重连必须走工厂重建，而不是复用那个已失败的实例`                                                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 384  | 英文行内注释（line）   | `<module>`     | `// RxDB.connect() 的顺序是：adapter.connect() → 建表/系统迁移/水位线。就绪门若只看`                      | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 385  | 冗余/废话注释（line）  | `<module>`     | `// 「适配器自己连上了没」，那么这两步之间到达的**外部**写会立刻入队执行，打在还没建出来的表上`           | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 536  | 冗余/废话注释（line）  | `<module>`     | `// 未缓存实体删除为空操作`                                                                               | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 607  | 英文行内注释（line）   | `<module>`     | `// 回调收到的是本次事务的 executor，不再是裸 client（C2：持有 executor 才算在本事务内）。`               | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 608  | 冗余/废话注释（line）  | `<module>`     | `// 断言它的**事务身份**与透传能力，而不是对象同一性。`                                                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 654  | 冗余/废话注释（line）  | `<module>`     | `// 不同事务必须是不同身份，否则并发时又会被并成一个上下文`                                               | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 787  | 冗余/废话注释（line）  | `<module>`     | `// 把无关查询的调度时序锁死在测试里。`                                                                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 807  | 冗余/废话注释（line）  | `<module>`     | `//（在事务体内那样写会挂起，属预期语义，不在此用例范围内）。`                                            | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 864  | 英文行内注释（line）   | `<module>`     | `// COMMIT 成功后才派发 TRANSACTION_COMMIT_EVENT，但 catch 只判断 transactionStarted，`                   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 866  | 冗余/废话注释（line）  | `<module>`     | `// 调用方以为事务失败了，而数据其实已经提交。这是对结果撒谎。`                                           | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 1074 | 英文行内注释（line）   | `<module>`     | `// 本包所有物理表名都由 get_table_name(name, namespace) => `${namespace}$${name}` 生成，`                | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 1076 | TODO/FIXME/XXX（line） | `<module>`     | `// 真机执行必然 `no such table: Todo`；updatedAt 也被硬编码为列名，自定义 columnName 的实体会再次失败。` | 明确归属人与解决路径；或转为正式 TSDoc 任务说明         |
| 1077 | 英文行内注释（line）   | `<module>`     | `// 对照 PGlite 适配器同名方法，它走的是 schemaManager.getEntityMetadata → metadata.tableName。`          | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 1078 | 英文行内注释（line）   | `<module>`     | `// QueryCache 的 upsertMany / deleteByIds 是**真实数据写路径**（QueryCacheRepository 的`                 | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 1079 | 英文行内注释（line）   | `<module>`     | `// create/update/delete/pull 全经此写本地缓存），由 RxJS Observable 驱动、落地时机不可控。`              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 1080 | 英文行内注释（line）   | `<module>`     | `// 它们原先走 internalQuery → 不入队、不看 #transaction_lock，而 #client() 是同一个连接，`               | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 1146 | 空注释（line）         | `<module>`     | `//`                                                                                                      | 删除空注释                                              |

### `index.ts` (195 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                                                      | 建议                                                    |
| ---- | --------------------- | ---------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| 1    | 冗余/废话注释（line） | `<module>` | `// 核心类型`                                                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 13   | 冗余/废话注释（line） | `<module>` | `// 后端接口`                                                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 23   | 英文行内注释（line）  | `<module>` | `// 基础 adapter`                                                             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 32   | 英文行内注释（line）  | `<module>` | `// Keyring 存储`                                                             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 35   | 英文行内注释（line）  | `<module>` | `// 加密 patch walker`                                                        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 38   | 英文行内注释（line）  | `<module>` | `// Worker 助手`                                                              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 47   | 冗余/废话注释（line） | `<module>` | `// 工具函数`                                                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 110  | 冗余/废话注释（line） | `<module>` | `// 仓库基类`                                                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 121  | 冗余/废话注释（line） | `<module>` | `// 版本管理`                                                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 128  | 冗余/废话注释（line） | `<module>` | `// 事务结果处理`                                                             | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 135  | 英文行内注释（line）  | `<module>` | `// RxDB adapter 批量变更`                                                    | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 138  | 冗余/废话注释（line） | `<module>` | `// 变更事件处理`                                                             | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 141  | 冗余/废话注释（line） | `<module>` | `// 共享客户端工具`                                                           | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 152  | 英文行内注释（line）  | `<module>` | `// FTS5 DDL 工具（被 @aiao/rxdb-plugin-search 消费）`                        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 162  | 英文行内注释（line）  | `<module>` | `// oo1 = 上游官方 SQLite WASM 的 Object Oriented API v1（sqlite3.oo1.DB），` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 163  | 英文行内注释（line）  | `<module>` | `// 不是 aiao 自创缩写；走该面的是 sqlite / sqliteai，wa-sqlite 不走这里。`   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 182  | 英文行内注释（line）  | `<module>` | `// 共享 oo1 运行时类型与边界校验（oo1 = 上游 Object Oriented API v1）`       | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 186  | 英文行内注释（line）  | `<module>` | `// 共享 oo1 执行助手（面向 sqlite3.oo1.DB，非 wa-sqlite C API）`             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 189  | 英文行内注释（line）  | `<module>` | `// 共享 oo1 客户端基类（sqlite / sqliteai 继承；wa-sqlite 不走这里）`        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 193  | 空注释（line）        | `<module>` | `//`                                                                          | 删除空注释                                              |

### `__tests__/query/query_sql.utils.spec.ts` (1245 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                                                                          | 建议                                                    |
| ---- | --------------------- | ---------- | ------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 84   | 冗余/废话注释（line） | `<module>` | `// 不得出现未加引号的日期裸文本`                                                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 112  | 英文行内注释（line）  | `<module>` | `// 只返回字面量 —— 拼接由 build_rule 交给 instr/substr 完成。`                                   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 348  | 英文行内注释（line）  | `<module>` | `// 列为 NULL 时 json_each 不产生行 → 裸 NOT EXISTS 恒为真 → 行被保留；`                          | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 349  | 英文行内注释（line）  | `<module>` | `// 而 JS 增量匹配把 notIn 归入 NULL_EXCLUDED_OPERATORS 直接返回 false → 行被排除，`              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 364  | 英文行内注释（line）  | `<module>` | `// buildRuleGroup 对单条规则不补括号（query_sql.ts:120-123），`                                  | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 537  | 冗余/废话注释（line） | `<module>` | `// 不应有连续空格`                                                                               | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 683  | 英文行内注释（line）  | `<module>` | `// SQLC-027：value 为 null 时 operator 与 value 双双被置空，输出退化成裸字段 `_."age"`，`        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 685  | 英文行内注释（line）  | `<module>` | `// 只有 = / != 能与 null 组合（映射成 IS NULL / IS NOT NULL），其余必须 fail-fast。`             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 696  | 英文行内注释（line）  | `<module>` | `// SQLC-007：contains/startsWith/endsWith 的语义是「字面量子串/前缀/后缀」，此前被编译成 LIKE：` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 698  | 英文行内注释（line）  | `<module>` | `// 对 ASCII 又大小写不敏感 —— 与 JS 增量匹配的 String.includes/startsWith/endsWith 结论相反。`   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 740  | 英文行内注释（line）  | `<module>` | `// '𝒳y' 的 UTF-16 length 是 3，码点数是 2；SQLite 的 substr/length 按字符计数，`                 | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 741  | 英文行内注释（line）  | `<module>` | `// 用 String.length 会把切片起点算错一位。`                                                      | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 769  | 冗余/废话注释（line） | `<module>` | `// ---------------------------------------------------------------------------`                  | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 770  | 英文行内注释（line）  | `<module>` | `// handle_exists 各关系类型分支`                                                                 | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 771  | 冗余/废话注释（line） | `<module>` | `// ---------------------------------------------------------------------------`                  | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 1140 | 英文行内注释（line）  | `<module>` | `// MANY_TO_MANY 的 FROM 后面已经有中间表 INNER JOIN，追加的关系 JOIN 必须排在它之后（SQLC-010）` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `sqlite-backend.interface.ts` (108 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号                | 注释原文                                                                                                                                                                                                                                                 | 建议                                                                      |
| ---- | ------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | 英文 TSDoc/JSDoc（jsdoc） | `<module>`              | `/** ⏎  * SqliteBackend —— SQLite WASM 后端实现的抽象接口。 ⏎  * ⏎  * 定义共享 adapter 逻辑（rxdb-adapter-sqlite-core）与具体 SQLite 后端实现 ⏎  * （wa-sqlite、@sqliteai/sqlite-wasm 等）之间的契约。 ⏎  * ⏎  * @module sqlite-backend.interface ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 14   | 冗余/废话注释（jsdoc）    | `SqliteExecResult`      | `/** 结果集数组 */`                                                                                                                                                                                                                                      | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 16   | 冗余/废话注释（jsdoc）    | `SqliteExecResult`      | `/** 受影响的行数 */`                                                                                                                                                                                                                                    | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 20   | 冗余/废话注释（jsdoc）    | `SqliteData`            | `/** 单个结果集，包含列名与行数据 */`                                                                                                                                                                                                                    | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 22   | 冗余/废话注释（jsdoc）    | `SqliteData`            | `/** 列名 */`                                                                                                                                                                                                                                            | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 24   | 冗余/废话注释（jsdoc）    | `SqliteData`            | `/** 行数据数组 */`                                                                                                                                                                                                                                      | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 30   | 英文 TSDoc/JSDoc（jsdoc） | `<module>`              | `/** SQLITE_DELETE (9) */`                                                                                                                                                                                                                               | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 32   | 英文 TSDoc/JSDoc（jsdoc） | `<module>`              | `/** SQLITE_INSERT (18) */`                                                                                                                                                                                                                              | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 34   | 英文 TSDoc/JSDoc（jsdoc） | `<module>`              | `/** SQLITE_UPDATE (23) */`                                                                                                                                                                                                                              | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 38   | 英文 TSDoc/JSDoc（jsdoc） | `UpdateHookCallback`    | `/** SQLite update_hook 通知回调 */`                                                                                                                                                                                                                     | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 43   | 冗余/废话注释（jsdoc）    | `SqliteBackendOptions`  | `/** 虚拟文件系统名（与后端相关） */`                                                                                                                                                                                                                    | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 45   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteBackendOptions`  | `/** 启用 OPFS 持久化（仅 Worker） */`                                                                                                                                                                                                                   | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 55   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteBackend`         | `/** ⏎  * SQLite WASM 后端实现的抽象接口。 ⏎  * ⏎  * 实现： ⏎  * - WaSqliteBackend（packages/rxdb-adapter-wa-sqlite） ⏎  * - SqliteaiBackend（packages/rxdb-adapter-sqliteai） ⏎  */`                                                                    | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 103  | 英文 TSDoc/JSDoc（jsdoc） | `SqliteBackend.changes` | `/** ⏎    * 返回最近一次 INSERT/UPDATE/DELETE 影响的行数。 ⏎    */`                                                                                                                                                                                      | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `__tests__/query/join_sql.spec.ts` (463 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号             | 注释原文                                                                                              | 建议                                                                      |
| ---- | ------------------------- | -------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 36   | 冗余/废话注释（line）     | `JsTree`             | `// --------------------------------------------------------------------------`                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 37   | 冗余/废话注释（line）     | `JsTree`             | `// 测试实体`                                                                                         | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 38   | 冗余/废话注释（line）     | `JsTree`             | `// --------------------------------------------------------------------------`                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 40   | 英文 TSDoc/JSDoc（jsdoc） | `JsTree`             | `/** 自引用树实体（不注册进 RxDB，用于覆盖 findMappedRelation 未命中时的自引用回退分支） */`          | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 67   | 英文 TSDoc/JSDoc（jsdoc） | `JsOrphan`           | `/** 映射实体不存在且非自引用的实体（不注册进 RxDB，用于覆盖 mappedRelation not found） */`           | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 112  | 英文 TSDoc/JSDoc（jsdoc） | `JsAccount`          | `/** 指向 JsProfile 的 MANY_TO_ONE，但 JsProfile 未定义反向关系，findMappedRelation 无法命中 */`      | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 129  | 冗余/废话注释（line）     | `JoinSqlTestAdapter` | `// --------------------------------------------------------------------------`                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 130  | 冗余/废话注释（line）     | `JoinSqlTestAdapter` | `// 测试辅助`                                                                                         | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 131  | 冗余/废话注释（line）     | `JoinSqlTestAdapter` | `// --------------------------------------------------------------------------`                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 387  | 英文行内注释（line）      | `<module>`           | `// 中间表别名按 relationKey 缓存复用，重复查询同一 MANY_TO_MANY 关系应命中去重，`                    | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 449  | 英文行内注释（line）      | `<module>`           | `// findMappedRelation 未命中（JsProfile 未定义反向 ONE_TO_MANY），但 JsProfile 已注册，`             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 450  | 英文行内注释（line）      | `<module>`           | `// 应回退到 getEntityMetadata 解析出真实目标表 js_profile，而不是错误地把本表 js_account 当作目标。` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |

### `__tests__/trigger_sql.spec.ts` (245 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号   | 注释原文                                                                                                                                                                                                                                                                       | 建议                                                                      |
| ---- | ------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 6    | 英文 TSDoc/JSDoc（jsdoc） | `<module>` | `/** ⏎  * 回归测试：确保 generate_table_trigger_sql 对所有来自元数据的字符串片段 ⏎  *   - entity.namespace ⏎  *   - entity.name ⏎  *   - property jsName（JSON 对象键） ⏎  * 都走 get_sql_value()（SQL 字面量转义）， ⏎  * 以防恶意/误写的元数据污染生成的 SQL 触发器。 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 27   | 冗余/废话注释（line）     | `<module>` | `// 原始注入字符串不应原封出现`                                                                                                                                                                                                                                                | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 29   | 冗余/废话注释（line）     | `<module>` | `// 单引号必须被转义为两个单引号`                                                                                                                                                                                                                                              | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 31   | 冗余/废话注释（line）     | `<module>` | `// 不应出现悬空的未闭合字面量破坏语句`                                                                                                                                                                                                                                        | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 65   | 英文行内注释（line）      | `<module>` | `// json_object 的 key 应为转义字面量`                                                                                                                                                                                                                                         | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 67   | 冗余/废话注释（line）     | `<module>` | `// 不应存在未转义的原样拼接`                                                                                                                                                                                                                                                  | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 82   | 英文行内注释（line）      | `<module>` | `// 未引用的 NEW.order 是 SQLite 语法错误（order 为保留字）`                                                                                                                                                                                                                   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 189  | 英文行内注释（line）      | `<module>` | `// SQLC-011：加密列在库里是 TEXT 信封（sqlite-core.utils.ts 的 rxDBColumnTypeToSqliteType 强制 TEXT），`                                                                                                                                                                      | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 218  | 英文行内注释（line）      | `<module>` | `// SQLC-018：`CASE WHEN col = 1 THEN 1 ELSE 0 END` 在 col IS NULL 时，`                                                                                                                                                                                                       | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 220  | 英文行内注释（line）      | `<module>` | `// nullable boolean 的 NULL 会在历史 patch 里被永久改成 false，`                                                                                                                                                                                                              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 221  | 英文行内注释（line）      | `<module>` | `// undo/redo 复原出来的是 false 而不是 null。`                                                                                                                                                                                                                                | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |

### `__tests__/sqlite-core.utils.spec.ts` (1422 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                                                    | 建议                                                    |
| ---- | --------------------- | ---------- | --------------------------------------------------------------------------- | ------------------------------------------------------- |
| 276  | 冗余/废话注释（line） | `<module>` | `// 未定义的属性保持原值`                                                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 311  | 英文行内注释（line）  | `<module>` | `// integer 保持原值`                                                       | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 329  | 英文行内注释（line）  | `<module>` | `// 没有 properties 定义，不进行递归转换`                                   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 331  | 冗余/废话注释（line） | `<module>` | `// 保持原值`                                                               | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 473  | 英文行内注释（line）  | `<module>` | `// SQLC-021：SQLite 索引名是库级全局的，必须带上 namespace，`              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 1020 | 冗余/废话注释（line） | `<module>` | `// 水位是进程内单调的，一旦被「领先墙上时钟」的用例推到未来就再也回不来，` | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 1021 | 冗余/废话注释（line） | `<module>` | `// 因此「应该返回当前时间」这条必须留在最前面。`                           | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |

### `__tests__/table/create_table_sql.spec.ts` (349 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号                 | 注释原文                                                                        | 建议                                                |
| ---- | --------------------- | ------------------------ | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| 16   | 冗余/废话注释（line） | `CtIntParent`            | `// --------------------------------------------------------------------------` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 17   | 冗余/废话注释（line） | `CtIntParent`            | `// 测试实体`                                                                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 18   | 冗余/废话注释（line） | `CtIntParent`            | `// --------------------------------------------------------------------------` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 109  | 冗余/废话注释（line） | `CreateTableTestAdapter` | `// --------------------------------------------------------------------------` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 110  | 冗余/废话注释（line） | `CreateTableTestAdapter` | `// 测试辅助`                                                                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 111  | 冗余/废话注释（line） | `CreateTableTestAdapter` | `// --------------------------------------------------------------------------` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 179  | 冗余/废话注释（line） | `<module>`               | `// 正确写法是把可空性和取值域拆开判断。`                                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

### `transaction/SqliteTransactionExecutor.ts` (188 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号                                  | 注释原文                                                                                 | 建议                                                    |
| ---- | --------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 51   | 冗余/废话注释（line） | `get`                                     | `// 已经在本事务里了：复用，绝不新开也绝不入队。翻转后真实适配器的`                      | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 52   | 英文行内注释（line）  | `get`                                     | `// runInTransaction 一律新开事务 —— 拿着门面的内部 helper（如 execute_switch_actions）` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 53   | 冗余/废话注释（line） | `get`                                     | `// 若走到那条路径，会在自己持槽时再入队，永久挂起。`                                    | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 57   | 英文行内注释（line）  | `get`                                     | `// `this` 必须绑到门面：mergeChanges 把收到的 adapter 一路传给内部 helper，`            | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 112  | 英文行内注释（line）  | `SqliteTransactionExecutor.execute`       | `// 必须是 async：声明返回 Promise 的方法同步抛错，会绕过调用方的 .catch()/rejects`      | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 135  | 冗余/废话注释（line） | `SqliteTransactionExecutor.getRepository` | `// 绑定到门面而非真实适配器：该仓库的每次读写都属于本事务`                              | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 161  | 英文行内注释（line）  | `SqliteTransactionExecutor.mergeChanges`  | `//    「normal 合并中途失败」用例本该 reject 却变成 resolve）。`                        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/version/switch_branch.spec.ts` (201 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号               | 注释原文                                                                        | 建议                                                                      |
| ---- | ------------------------- | ---------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 39   | 英文 TSDoc/JSDoc（jsdoc） | `SwitchAdapterOptions` | `/** 分支切换 UPDATE 语句返回 undefined（覆盖 branchSwitchResult 缺失分支） */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 43   | 英文 TSDoc/JSDoc（jsdoc） | `SwitchAdapterOptions` | `/** 覆盖 config.entities */`                                                   | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 104  | 英文行内注释（line）      | `<module>`             | `// RxDBBranch 等系统表 log: false，不应重建触发器`                             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 134  | 冗余/废话注释（line）     | `<module>`             | `// 分支切换未返回任何行时不应派发事件`                                         | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 155  | 英文行内注释（line）      | `<module>`             | `// recordAt 依次回退：updatedAt → createdAt → 当前时间`                        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 189  | 英文行内注释（line）      | `<module>`             | `// 事件顺序：分支 UPDATE（无行则跳过）→ DELETE → INSERT → UPDATE`              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |

### `query/find_sql.ts` (58 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                                                                               | 建议                                                    |
| ---- | --------------------- | ---------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 32   | 英文行内注释（line）  | `<module>` | `// groupBy / projection 在 FindOptions 上是声明出来的，但 generate_sql 从来不消费它们 ——`             | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 33   | 冗余/废话注释（line） | `<module>` | `// 调用方拿到的是未聚合 / 未投影的整行结果，且没有任何提示。声明了却静默忽略比不支持更糟，`           | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 34   | 英文行内注释（line）  | `<module>` | `// 在实现之前先 fail-fast。`                                                                          | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 35   | 英文行内注释（line）  | `<module>` | `// 必须排在 validateEncryptedQuery **之后**：加密列上的 groupBy/projection 有更精确的`                | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 36   | 英文行内注释（line）  | `<module>` | `// 错误码（group_on_encrypted / projection_on_encrypted），不能被这里的通用错误抢先（SQLC-024）`      | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 43   | 英文行内注释（line）  | `<module>` | `// orderBy 与 where 走同一次 JOIN 规划：共享别名表，关系路径与 keyValue 路径才能拿到别名（SQLC-025）` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `Oo1ClientBase.ts` (436 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号                         | 注释原文                                                                                                                       | 建议                                                                      |
| ---- | ------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 20   | 英文 TSDoc/JSDoc（jsdoc） | `Oo1ClientEvents`                | `/** ⏎  * `Oo1ClientBase` 派发的事件签名表，供 EventDispatcher 类型推断。 ⏎  */`                                               | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 101  | 英文 TSDoc/JSDoc（jsdoc） | `Oo1ClientBase.addEventListener` | `/** ⏎    * 对外覆盖，与 {@link SqliteClientLike} 签名保持一致。 ⏎    * 委托给 {@link EventDispatcher} 中的泛型实现。 ⏎    */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 132  | 英文行内注释（line）      | `Oo1ClientBase.init`             | `// 失败路径由 #cleanup_after_init_failure 复位 #init_promise 与状态，`                                                        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 133  | 冗余/废话注释（line）     | `Oo1ClientBase.init`             | `// 让调用方可以带合法参数重试`                                                                                                | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 158  | 英文行内注释（line）      | `Oo1ClientBase.disconnect`       | `// 异常隔离在 #flush_pending_events 内部逐监听器完成。`                                                                       | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |

### `__tests__/adapter-factory.ts` (25 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号                        | 注释原文                                                | 建议                                                                      |
| ---- | ------------------------- | ------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------- |
| 13   | 英文 TSDoc/JSDoc（jsdoc） | `AdapterFactory`                | `/** 工厂显示名称（例如 'wa-sqlite'、'sqliteai'）。 */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 16   | 冗余/废话注释（jsdoc）    | `AdapterFactory.createAdapter`  | `/** 创建已配置的测试适配器实例。 */`                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 22   | 冗余/废话注释（jsdoc）    | `AdapterFactory.cleanupAdapter` | `/** 释放适配器工厂持有的资源。 */`                     | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称                   | 声明                                      | 建议                                   |
| ---- | --------- | ---------------------- | ----------------------------------------- | -------------------------------------- |
| 8    | interface | `AdapterCleanupTarget` | `export interface AdapterCleanupTarget {` | 补充中文 TSDoc（说明用途/入参/返回值） |
| 12   | interface | `AdapterFactory`       | `export interface AdapterFactory {`       | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/fts5/build-fts.spec.ts` (162 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                                                             | 建议                                                    |
| ---- | --------------------- | ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 95   | 英文行内注释（line）  | `<module>` | `// 仅 searchable 字段变化才同步，避免非 searchable 字段（如 viewCount）触发写放大`  | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 102  | 英文行内注释（line）  | `<module>` | `// INSERT（ai）和 UPDATE（au）必须通过子查询处理 tags。`                            | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 113  | 英文行内注释（line）  | `<module>` | `// NULL 或空数组 → 空字符串。空 json_each 上的 group_concat 返回 NULL → COALESCE。` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 125  | 英文行内注释（line）  | `<module>` | `// SQLC-028：valueWrapper 原样拼进 CREATE TRIGGER 的 VALUES 里，`                   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 156  | 冗余/废话注释（line） | `<module>` | `// 预期抛出`                                                                        | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |

### `__tests__/query/find_sql.spec.ts` (180 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                                  | 建议                                                    |
| ---- | -------------------- | ---------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 68   | 英文行内注释（line） | `<module>` | `// 手工构造无 namespace 的元数据，覆盖 find_sql 的 namespace 回退分支；`                 | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 121  | 英文行内注释（line） | `<module>` | `// 此前 build_order_by 只做 resolve_column_name：关系名不在 propertyMap 里，`            | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 122  | 英文行内注释（line） | `<module>` | `// 点号字符串被原样当成列名拼成 `_."owner.name"`，SQLite 报 no such column。`            | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 135  | 英文行内注释（line） | `<module>` | `// 两侧共享同一个 JoinContext，否则同一张表会被 LEFT JOIN 两次、行数翻倍。`              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 163  | 英文行内注释（line） | `<module>` | `// SQLC-024：`groupBy`/`projection` 在 FindOptions 上有声明，但 generate_sql 从不消费，` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `sqlite-core.interface.ts` (114 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号              | 注释原文                                                                                                                                                 | 建议                                                                      |
| ---- | ------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 1    | 英文 TSDoc/JSDoc（jsdoc） | `<module>`            | `/** ⏎  * SQLite adapter 共享的核心类型。 ⏎  * 与后端无关的类型，wa-sqlite 与 sqliteai adapter 都会用到。 ⏎  * ⏎  * @module sqlite-core.interface ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 20   | 冗余/废话注释（jsdoc）    | `SqliteSuccessResult` | `/** 受影响的行数 */`                                                                                                                                    | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 22   | 冗余/废话注释（jsdoc）    | `SqliteSuccessResult` | `/** 执行耗时（毫秒） */`                                                                                                                                | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 24   | 冗余/废话注释（jsdoc）    | `SqliteSuccessResult` | `/** 结果集 */`                                                                                                                                          | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 28   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteResult`        | `/** SqliteSuccessResult 的别名 */`                                                                                                                      | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `sqlite-oo1-load.utils.ts` (292 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号                    | 注释原文                                                                                      | 建议                                                                      |
| ---- | ------------------------- | --------------------------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 125  | 英文行内注释（line）      | `rewriteOpfsProxyWorkerUrl` | `// sqlite3 内部通过 `?vfs=opfs\|opfs-wl` 告知 proxy worker 自己的 VFS 类型（见`              | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 126  | 英文行内注释（line）      | `rewriteOpfsProxyWorkerUrl` | `// @sqlite.org/sqlite-wasm 的 `new URL('sqlite3-opfs-async-proxy.js', import.meta.url)`）。` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 127  | 英文行内注释（line）      | `rewriteOpfsProxyWorkerUrl` | `// `new URL(opfsProxyPath, originalUrl)` 在 opfsProxyPath 本身不带 query 时会直接丢弃`       | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 128  | 英文行内注释（line）      | `rewriteOpfsProxyWorkerUrl` | `// originalUrl 的 search，导致 proxy worker 收不到 vfs 参数而抛错；这里显式补回缺失字段。`   | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 261  | 英文 TSDoc/JSDoc（jsdoc） | `toOo1LoadFingerprint`      | `/** 从加载选项算出 {@link Oo1LoadFingerprint}。 */`                                          | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `RxDBAdapterSqliteBase.ts` (1312 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号                | 注释原文                                                                                                                       | 建议                                                                      |
| ---- | ------------------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 83   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteClientLike`      | `/** ⏎  * SQLite adapter 的最小客户端接口。 ⏎  * wa-sqlite 的 SqliteClient 与 sqliteai 的 SqliteaiClient 都满足该契约。 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 109  | 英文 TSDoc/JSDoc（jsdoc） | `SqliteBaseOptions`     | `/** ⏎  * SQLite adapter 的基础选项（与后端无关）。 ⏎  */`                                                                     | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 923  | 冗余/废话注释（line）     | `RxDBAdapterSqliteBase` | `// 私有方法`                                                                                                                  | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |
| 938  | 英文行内注释（line）      | `RxDBAdapterSqliteBase` | `// 直发 SQL 而不经仓库：仓库的 addQueryCache 要做实体水合（需要 entityManager），`                                            | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |

### `__tests__/Oo1ClientBase.spec.ts` (644 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                               | 建议                                                    |
| ---- | -------------------- | ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| 283  | 英文行内注释（line） | `<module>` | `// SQLC-034：`#queue` 是 definite assignment，init 之前 execute 会抛` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 337  | 英文行内注释（line） | `<module>` | `// disconnect 后 hook 已替换为 noop，触发它不应再收集事件`            | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 365  | 英文行内注释（line） | `<module>` | `// number 与 bigint rowId 都应被 normalizeRowId 归一化为 bigint`      | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 537  | 英文行内注释（line） | `<module>` | `// SQLC-041：disconnect 从不调用 removeAllEventListeners，`           | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `table/trigger_sql.ts` (229 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号         | 注释原文                                                                           | 建议                                                    |
| ---- | ---------------------- | ---------------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 18   | 冗余/废话注释（jsdoc） | `TriggerOptions` | `/** ⏎  * 触发器选项 ⏎  */`                                                        | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 67   | 英文行内注释（line）   | `<module>`       | `// boolean 的 `CASE WHEN col = 1` 对信封串恒假，patch 里会写成 0（明文 false），` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 78   | 英文行内注释（line）   | `<module>`       | `// 外键：foreignKeyNames 是 JS 属性名，foreignKeyColumnNames 是数据库列名`        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 183  | 冗余/废话注释（jsdoc） | `<module>`       | `/** ⏎    * 更新触发器 ⏎    */`                                                    | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |

### `testing.ts` (144 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称                   | 声明                                                                         | 建议                                   |
| ---- | --------- | ---------------------- | ---------------------------------------------------------------------------- | -------------------------------------- |
| 3    | interface | `AdapterCleanupTarget` | `export interface AdapterCleanupTarget {`                                    | 补充中文 TSDoc（说明用途/入参/返回值） |
| 7    | interface | `AdapterFactory`       | `export interface AdapterFactory {`                                          | 补充中文 TSDoc（说明用途/入参/返回值） |
| 14   | type      | `AdapterSuite`         | `export type AdapterSuite = (factory: AdapterFactory) => void;`              | 补充中文 TSDoc（说明用途/入参/返回值） |
| 76   | function  | `cloneEntityClasses`   | `export function cloneEntityClasses(entities: EntityType[]): EntityType[] {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `version/switch-result.utils.ts` (257 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称                      | 声明                                         | 建议                                   |
| ---- | --------- | ------------------------- | -------------------------------------------- | -------------------------------------- |
| 38   | interface | `SqliteStatement`         | `export interface SqliteStatement {`         | 补充中文 TSDoc（说明用途/入参/返回值） |
| 43   | interface | `SwitchVersionChangeData` | `export interface SwitchVersionChangeData {` | 补充中文 TSDoc（说明用途/入参/返回值） |
| 48   | interface | `SwitchVersionSqlItem`    | `export interface SwitchVersionSqlItem {`    | 补充中文 TSDoc（说明用途/入参/返回值） |
| 61   | interface | `SwitchVersionSqlResult`  | `export interface SwitchVersionSqlResult {`  | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/version/execute-switch-actions.spec.ts` (496 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                                     | 建议                                                    |
| ---- | -------------------- | ---------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 176  | 英文行内注释（line） | `<module>` | `// 必须像 UPDATE 路径一样 forcedUpdate 全量 hydrate（含 origin），否则 UI 继续显示旧数据。` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 189  | 英文行内注释（line） | `<module>` | `// 删除前的缓存快照：标题是旧值，状态已被 remove_entity_ids_from_cache 打成 removed`        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 358  | 英文行内注释（line） | `<module>` | `// 分支探测：activated 命中 feature`                                                        | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `keyring/sqlite-core-keyring-storage.ts` (88 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号                                  | 注释原文                                                                                                                  | 建议                                                                      |
| ---- | ------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 39   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteCoreKeyringStorage`                | `/** ⏎  * 把 keyring 单例行持久化到 adapter 自带的 SQLite 数据库。 ⏎  * wa-sqlite 与 sqliteai 两个继承类都会用到。 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 54   | 英文行内注释（line）      | `SqliteCoreKeyringStorage.readSingleton`  | `// SELECT 列：0=id, 1=createdAt, 2=kdf, 3=salt, 4=kid, 5=verifier`                                                       | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符                   |
| 71   | 冗余/废话注释（line）     | `SqliteCoreKeyringStorage.writeSingleton` | `// 连接已断开一律报成「已存在单例行」会让调用方按错误的方向排查，`                                                       | 删除（信息已通过命名/类型表达）；或保留一句核心意图                       |

### `oo1-types.ts` (102 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称          | 声明                             | 建议                                   |
| ---- | --------- | ------------- | -------------------------------- | -------------------------------------- |
| 27   | interface | `Oo1Database` | `export interface Oo1Database {` | 补充中文 TSDoc（说明用途/入参/返回值） |
| 42   | interface | `Oo1Capi`     | `export interface Oo1Capi {`     | 补充中文 TSDoc（说明用途/入参/返回值） |
| 50   | interface | `Oo1Static`   | `export interface Oo1Static {`   | 补充中文 TSDoc（说明用途/入参/返回值） |

### `query/join_sql.ts` (554 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号   | 注释原文                            | 建议                                                |
| ---- | ---------------------- | ---------- | ----------------------------------- | --------------------------------------------------- |
| 48   | 冗余/废话注释（jsdoc） | `<module>` | `/** ⏎  * 获取或创建关系别名 ⏎  */` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 60   | 冗余/废话注释（jsdoc） | `<module>` | `/** ⏎  * 尝试解析关系路径 ⏎  */`   | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称          | 声明                             | 建议                                   |
| ---- | --------- | ------------- | -------------------------------- | -------------------------------------- |
| 33   | interface | `JoinContext` | `export interface JoinContext {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `query/query_tree_sql.ts` (211 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号      | 注释原文                                            | 建议                                                |
| ---- | ---------------------- | ------------- | --------------------------------------------------- | --------------------------------------------------- |
| 16   | 冗余/废话注释（jsdoc） | `TreeOptions` | `/** ⏎    * 是否是查询数量 ⏎    */`                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 21   | 冗余/废话注释（jsdoc） | `TreeOptions` | `/** ⏎    * 查询子孙节点 ⏎    */`                   | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 26   | 冗余/废话注释（jsdoc） | `TreeOptions` | `/** ⏎    * 是否查询子节点 ⏎    * 计算属性 ⏎    */` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

### `query/sql_alias.utils.ts` (47 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号   | 注释原文                               | 建议                                                |
| ---- | ---------------------- | ---------- | -------------------------------------- | --------------------------------------------------- |
| 14   | 冗余/废话注释（jsdoc） | `<module>` | `/** ⏎  * 主表别名 ⏎  */`              | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 27   | 冗余/废话注释（jsdoc） | `<module>` | `/** ⏎  * 格式化表别名 ⏎  */`          | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 33   | 冗余/废话注释（jsdoc） | `<module>` | `/** ⏎  * 格式化「表别名.列名」 ⏎  */` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

### `sqlite-core.utils.ts` (804 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                          | 建议                                                |
| ---- | --------------------- | ---------- | ------------------------------------------------- | --------------------------------------------------- |
| 638  | 冗余/废话注释（line） | `<module>` | `// 第一遍：构建骨架并收集加密单元格的解密任务。` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称                | 声明                                                                                | 建议                                   |
| ---- | --------- | ------------------- | ----------------------------------------------------------------------------------- | -------------------------------------- |
| 18   | interface | `EncryptionContext` | `export interface EncryptionContext {`                                              | 补充中文 TSDoc（说明用途/入参/返回值） |
| 24   | type      | `SQLiteEntityData`  | `export type SQLiteEntityData = Record<string, SQLiteCompatibleType \| undefined>;` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `version/switch_branch.ts` (163 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                                      | 建议                                                |
| ---- | --------------------- | ---------- | ------------------------------------------------------------- | --------------------------------------------------- |
| 34   | 冗余/废话注释（line） | `<module>` | `// 遍历所有实体，为启用了日志功能的实体重新生成触发器`       | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 39   | 冗余/废话注释（line） | `<module>` | `// 不吞异常：任一实体的触发器生成失败都必须让整个切换回滚。` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
| 51   | 冗余/废话注释（line） | `<module>` | `// 获取分支表的元数据和表名`                                 | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

### `__tests__/entity/insert_sql.spec.ts` (376 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号     | 注释原文              | 建议                                                    |
| ---- | --------------------- | ------------ | --------------------- | ------------------------------------------------------- |
| 12   | 英文行内注释（line）  | `TestEntity` | `// 模拟 Entity 类。` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 372  | 冗余/废话注释（line） | `<module>`   | `// 出现两次`         | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |

### `__tests__/execute_oo1_helper.spec.ts` (240 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号             | 注释原文                                          | 建议                                                    |
| ---- | --------------------- | -------------------- | ------------------------------------------------- | ------------------------------------------------------- |
| 73   | 冗余/废话注释（line） | `FakeHelperDb.close` | `// 无操作。`                                     | 删除（信息已通过命名/类型表达）；或保留一句核心意图     |
| 112  | 英文行内注释（line）  | `<module>`           | `// 当成本次查询的 rowsAffected 返回会误导调用方` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/query/count_sql.spec.ts` (76 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                       | 建议                                                    |
| ---- | -------------------- | ---------- | ------------------------------------------------------------------------------ | ------------------------------------------------------- |
| 67   | 英文行内注释（line） | `<module>` | `// find_sql 在 hasJoin 时已经加 DISTINCT（query_sql.ts），count 必须同口径，` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 68   | 英文行内注释（line） | `<module>` | `// 不然 count 与 find(...).length 会对不上。`                                 | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/shared-crud.suite.ts` (3079 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号       | 注释原文                           | 建议                                                    |
| ---- | -------------------- | -------------- | ---------------------------------- | ------------------------------------------------------- |
| 29   | 英文行内注释（line） | `CnDepartment` | `// -- columnName 测试实体定义 --` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                   | 声明                                                              | 建议                                   |
| ---- | -------- | ---------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| 99   | function | `crudIntegrationSuite` | `export function crudIntegrationSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-query-sql.suite.ts` (948 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号               | 注释原文                         | 建议                                                                      |
| ---- | ------------------------- | ---------------------- | -------------------------------- | ------------------------------------------------------------------------- |
| 98   | 英文 TSDoc/JSDoc（jsdoc） | `SqlcTreeNodeTreeRule` | `/** SqlcTreeNode 树查询规则 */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称            | 声明                                                       | 建议                                   |
| ---- | -------- | --------------- | ---------------------------------------------------------- | -------------------------------------- |
| 124  | function | `querySqlSuite` | `export function querySqlSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/transaction_sqlite_result.spec.ts` (412 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                               | 建议                                                    |
| ---- | -------------------- | ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------- |
| 306  | 英文行内注释（line） | `<module>` | `// SQLC-033：#row_id_map 是强引用 Map，删除只标 removed 不回收映射，` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 342  | 英文行内注释（line） | `<module>` | `// 同一个 entityManager 引用，rowid 映射由 cacheRowIdEntity 重建`     | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `query/count_sql.ts` (42 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                                | 建议                                                    |
| ---- | -------------------- | ---------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 33   | 英文行内注释（line） | `<module>` | `// 裸 COUNT 会把它计 N 次。find_sql 在 hasJoin 时已经加 DISTINCT（见 generate_sql），` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |
| 34   | 英文行内注释（line） | `<module>` | `// count 不同口径就会与 find(...).length 对不上（SQLC-009）`                           | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `sqlite-client.utils.ts` (165 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号            | 注释原文                                                                                                                 | 建议                                                                      |
| ---- | ------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| 4    | 英文 TSDoc/JSDoc（jsdoc） | `ChangeRecordEvent` | `/** ⏎  * SQLite update_hook 派发的单行变更事件载荷。 ⏎  * 由各 backend SqliteClient 收集后批量分发给 RxDB 上层。 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |
| 45   | 英文 TSDoc/JSDoc（jsdoc） | `<module>`          | `/** 默认 SQLite page cache 大小（KB），50 MB。 */`                                                                      | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `__tests__/fixtures/Todo.ts` (15 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别  | 名称   | 声明        | 建议                                   |
| ---- | ----- | ------ | ----------- | -------------------------------------- |
| 3    | class | `Todo` | `@Entity({` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/fts5/cjk-bigram.spec.ts` (125 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                         | 建议                                                    |
| ---- | -------------------- | ---------- | -------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 27   | 英文行内注释（line） | `<module>` | `// 而查询侧 compileCjkToken 编成 `a AND 中 AND b`，三个 token 一个都不在索引里` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/query/query_sql.spec.ts` (293 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号 | 注释原文                                                       | 建议                                                                      |
| ---- | ------------------------- | -------- | -------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 31   | 英文 TSDoc/JSDoc（jsdoc） | `QsDoc`  | `/** 关系上带 keyValue 属性的实体（用于关系 flatmap 分支） */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `__tests__/query/query_tree_sql.spec.ts` (197 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                   | 建议                                                    |
| ---- | -------------------- | ---------- | ---------------------------------------------------------- | ------------------------------------------------------- |
| 110  | 英文行内注释（line） | `<module>` | `// 与 pglite（`c.level < 0`）行为分叉，也与 TSDoc 矛盾。` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/repository/SqliteTreeRepository.spec.ts` (175 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                            | 建议                                                    |
| ---- | -------------------- | ---------- | ------------------------------------------------------------------- | ------------------------------------------------------- |
| 107  | 英文行内注释（line） | `<module>` | `// forcedUpdate：数据库行覆盖内存值，并把 origin 重置为数据库状态` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/rxdb_adapter_mutations.spec.ts` (378 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                             | 建议                                                    |
| ---- | -------------------- | ---------- | -------------------------------------------------------------------- | ------------------------------------------------------- |
| 168  | 英文行内注释（line） | `<module>` | `// 回查结果中未知 id 的行会通过 entityManager 新建实体并缓存 rowid` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/shared-adapter-construction.suite.ts` (30 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                       | 声明                                                                  | 建议                                   |
| ---- | -------- | -------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| 8    | function | `adapterConstructionSuite` | `export function adapterConstructionSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-bigint-binary-entity.suite.ts` (568 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                      | 声明                                                                       | 建议                                   |
| ---- | -------- | ------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| 139  | function | `bigintBinaryEntitySuite` | `export function bigintBinaryEntitySuite(factory: AdapterFactory): void {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-bigint-binary.suite.ts` (156 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                      | 声明                                                                 | 建议                                   |
| ---- | -------- | ------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| 8    | function | `bigintBinaryClientSuite` | `export function bigintBinaryClientSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-cascade-mutation.suite.ts` (1320 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                   | 声明                                                              | 建议                                   |
| ---- | -------- | ---------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| 37   | function | `cascadeMutationSuite` | `export function cascadeMutationSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-create-sqlite-client.suite.ts` (16 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                      | 声明                                                                 | 建议                                   |
| ---- | -------- | ------------------------- | -------------------------------------------------------------------- | -------------------------------------- |
| 4    | function | `createSqliteClientSuite` | `export function createSqliteClientSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-custom-primary-key.suite.ts` (269 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                    | 声明                                                               | 建议                                   |
| ---- | -------- | ----------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| 112  | function | `customPrimaryKeySuite` | `export function customPrimaryKeySuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-join-sql.suite.ts` (305 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称           | 声明                                                      | 建议                                   |
| ---- | -------- | -------------- | --------------------------------------------------------- | -------------------------------------- |
| 97   | function | `joinSqlSuite` | `export function joinSqlSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-menu.suite.ts` (2181 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                   | 声明                                                              | 建议                                   |
| ---- | -------- | ---------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| 8    | function | `menuIntegrationSuite` | `export function menuIntegrationSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-relations.suite.ts` (628 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                       | 声明                                                                  | 建议                                   |
| ---- | -------- | -------------------------- | --------------------------------------------------------------------- | -------------------------------------- |
| 7    | function | `relationIntegrationSuite` | `export function relationIntegrationSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-repository.suite.ts` (141 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                    | 声明                                                               | 建议                                   |
| ---- | -------- | ----------------------- | ------------------------------------------------------------------ | -------------------------------------- |
| 8    | function | `sqliteRepositorySuite` | `export function sqliteRepositorySuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-rxdb-adapter.suite.ts` (149 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称               | 声明                                                          | 建议                                   |
| ---- | -------- | ------------------ | ------------------------------------------------------------- | -------------------------------------- |
| 6    | function | `rxdbAdapterSuite` | `export function rxdbAdapterSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-sqlite-client-batch-timeout.suite.ts` (54 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                            | 声明                                                                       | 建议                                   |
| ---- | -------- | ------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- |
| 11   | function | `sqliteClientBatchTimeoutSuite` | `export function sqliteClientBatchTimeoutSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-sqlite-client.suite.ts` (23 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                | 声明                                                           | 建议                                   |
| ---- | -------- | ------------------- | -------------------------------------------------------------- | -------------------------------------- |
| 5    | function | `sqliteClientSuite` | `export function sqliteClientSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-system-schema-migration.suite.ts` (290 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                         | 声明                                                                          | 建议                                   |
| ---- | -------- | ---------------------------- | ----------------------------------------------------------------------------- | -------------------------------------- |
| 60   | function | `systemSchemaMigrationSuite` | `export function systemSchemaMigrationSuite(factory: AdapterFactory): void {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-table-index.suite.ts` (190 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称              | 声明                                                         | 建议                                   |
| ---- | -------- | ----------------- | ------------------------------------------------------------ | -------------------------------------- |
| 109  | function | `tableIndexSuite` | `export function tableIndexSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-transaction-result.suite.ts` (448 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                           | 声明                                                                      | 建议                                   |
| ---- | -------- | ------------------------------ | ------------------------------------------------------------------------- | -------------------------------------- |
| 12   | function | `transactionSqliteResultSuite` | `export function transactionSqliteResultSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-tree.suite.ts` (1164 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                   | 声明                                                              | 建议                                   |
| ---- | -------- | ---------------------- | ----------------------------------------------------------------- | -------------------------------------- |
| 9    | function | `treeIntegrationSuite` | `export function treeIntegrationSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-undo-redo.suite.ts` (2126 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称            | 声明                                                           | 建议                                   |
| ---- | -------- | --------------- | -------------------------------------------------------------- | -------------------------------------- |
| 20   | function | `undoRedoSuite` | `export function undoRedoSuite(baseFactory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/shared-version-branch.suite.ts` (1873 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                 | 声明                                                            | 建议                                   |
| ---- | -------- | -------------------- | --------------------------------------------------------------- | -------------------------------------- |
| 18   | function | `versionBranchSuite` | `export function versionBranchSuite(factory: AdapterFactory) {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `__tests__/sqlite-client.utils.spec.ts` (104 行)

#### 2.1 注释问题

| 行号 | 类型                  | 所在符号   | 注释原文                                  | 建议                                                |
| ---- | --------------------- | ---------- | ----------------------------------------- | --------------------------------------------------- |
| 38   | 冗余/废话注释（line） | `<module>` | `// 归一化是确定性碰撞，只能在入口拒绝。` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

### `__tests__/table/create_tables_sql.spec.ts` (67 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                  | 建议                                                    |
| ---- | -------------------- | ---------- | ------------------------------------------------------------------------- | ------------------------------------------------------- |
| 31   | 英文行内注释（line） | `<module>` | `// context getter 依赖 rxdb 完整初始化，纯 SQL 生成场景用轻量 mock 即可` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `__tests__/test-utils.ts` (80 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号   | 注释原文                                                                                                                                                                                            | 建议                                                                      |
| ---- | ------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| 11   | 英文 TSDoc/JSDoc（jsdoc） | `<module>` | `/** ⏎  * writer lease 协议表：持久化 across 整个测试文件的 writer epoch，一旦被清空即永久 fenced。 ⏎  * 必须与 {@link RxDBAdapterSqliteBase} 内部的表名拼接规则（`rxdb$${name}`）保持一致。 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `__tests__/testing-entry.spec.ts` (146 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                  | 建议                                                    |
| ---- | -------------------- | ---------- | ----------------------------------------- | ------------------------------------------------------- |
| 141  | 英文行内注释（line） | `<module>` | `// name / length / prototype 不应被覆盖` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `create_sqlite_client.ts` (239 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别     | 名称                              | 声明                                                                                          | 建议                                   |
| ---- | -------- | --------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------- |
| 41   | function | `validateComlinkTransportOptions` | `export function validateComlinkTransportOptions(options: CreateSqliteClientOptions): void {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `entity/insert_sql.ts` (72 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称               | 声明                                                           | 建议                                   |
| ---- | --------- | ------------------ | -------------------------------------------------------------- | -------------------------------------- |
| 13   | interface | `InsertSqlOptions` | `export interface InsertSqlOptions extends IMutationContext {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `entity/update_sql.ts` (86 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                                                    | 建议                                                    |
| ---- | -------------------- | ---------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| 33   | 英文行内注释（line） | `<module>` | `// entityData 的 key 是数据库列名，encryptedPropertyMap 的 key 是 JS 属性名，需反查后比对` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `fts5/build-fts-triggers.ts` (115 行)

#### 2.1 注释问题

| 行号 | 类型                 | 所在符号   | 注释原文                                                           | 建议                                                    |
| ---- | -------------------- | ---------- | ------------------------------------------------------------------ | ------------------------------------------------------- |
| 8    | 英文行内注释（line） | `<module>` | `// StringArrayProperty: 原表存 JSON 数组文本；NULL/空数组 → 空串` | 翻译为中文，保留代码引用 (`#field`/`SQLC-xxx`) 与标识符 |

### `handle_rxdb_change.ts` (278 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号          | 注释原文                                                   | 建议                                                                      |
| ---- | ------------------------- | ----------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------- |
| 25   | 英文 TSDoc/JSDoc（jsdoc） | `DecryptedChange` | `/** 一条变更行，以及解回明文后的 patch / inversePatch */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `query/find_by_row_ids_sql.ts` (17 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号   | 注释原文                                | 建议                                                                      |
| ---- | ------------------------- | ---------- | --------------------------------------- | ------------------------------------------------------------------------- |
| 5    | 英文 TSDoc/JSDoc（jsdoc） | `<module>` | `/** ⏎  * 生成 findByRowIds 查询 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `query/query_sql.ts` (160 行)

#### 2.2 缺失 TSDoc 的导出 API

| 行号 | 类别      | 名称                | 声明                                   | 建议                                   |
| ---- | --------- | ------------------- | -------------------------------------- | -------------------------------------- |
| 24   | interface | `GenerateSqlResult` | `export interface GenerateSqlResult {` | 补充中文 TSDoc（说明用途/入参/返回值） |

### `query/query_sql.utils.ts` (867 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号   | 注释原文                                | 建议                                                |
| ---- | ---------------------- | ---------- | --------------------------------------- | --------------------------------------------------- |
| 110  | 冗余/废话注释（jsdoc） | `<module>` | `/** 解析查询字段对应的属性元数据。 */` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |

### `repository/SqliteRepository.ts` (84 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号           | 注释原文                          | 建议                                                                      |
| ---- | ------------------------- | ------------------ | --------------------------------- | ------------------------------------------------------------------------- |
| 10   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteRepository` | `/** ⏎  * 操作 entity 仓库 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `repository/SqliteRepositoryBase.ts` (77 行)

#### 2.1 注释问题

| 行号 | 类型                      | 所在符号               | 注释原文                          | 建议                                                                      |
| ---- | ------------------------- | ---------------------- | --------------------------------- | ------------------------------------------------------------------------- |
| 15   | 英文 TSDoc/JSDoc（jsdoc） | `SqliteRepositoryBase` | `/** ⏎  * 操作 entity 仓库 ⏎  */` | 改为中文 JSDoc，保留 `@param/@returns/{@link ...}` 等 TSDoc 标签与 API 名 |

### `rxdb_adapter_mutations.ts` (190 行)

#### 2.1 注释问题

| 行号 | 类型                   | 所在符号   | 注释原文                                        | 建议                                                |
| ---- | ---------------------- | ---------- | ----------------------------------------------- | --------------------------------------------------- |
| 19   | 冗余/废话注释（jsdoc） | `<module>` | `/** ⏎  * 批量修改实体（创建/更新/删除） ⏎  */` | 删除（信息已通过命名/类型表达）；或保留一句核心意图 |
