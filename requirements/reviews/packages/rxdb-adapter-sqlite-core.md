# rxdb-adapter-sqlite-core 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本报告按风险追踪公开入口与关键调用链，未声称逐行覆盖全部源码。

验证口径：区分源码实证、原函数局部执行与真实后端运行。统一 Nx 校验结果见 [包级索引](README.md)；未运行的浏览器、真机或 Rust 宿主测试不计为通过。

## 结论与范围

🟡凑合：合法加密列的写入转换被跳过，正常公开 CRUD 会在解密回填时失败并回滚（SQLC-001，P2）。事务包装阻止了本轮公开入口诊断中的明文提交；参数转换缺陷仍需修复。其他 SQLite 后端共用这一段，按一个根因计数。

| 评审重点               | 已追踪的源码与符号                                                                                                                                                                                                                                                                                                    | 当前判断                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 写入归一化与加密       | [`transformEntityValueToSql` / `encryptedColumnValue`](../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts)、[`generate_entity_insert_sql`](../../../packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts)、[`generate_entity_update_sql`](../../../packages/rxdb-adapter-sqlite-core/src/entity/update_sql.ts) | 发现 SQLC-001                                                       |
| 事务隔离与终态         | [`SqliteTransactionExecutor`](../../../packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts)、[`RxDBAdapterSqliteBase.#run_transaction`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)                                                                           | 外部写入重新排队，executor 终态有守卫；未复报旧的环境态串事务问题   |
| 初始化、关闭与资源归还 | [`RxDBAdapterSqliteBase.disconnect` / `#client` / `#withSharedClientLock`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)、[`wrapWithComlinkEndpoint` / `releaseComlinkProxy`](../../../packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts)                                      | 核对缓存清空、端口租用、持久存储锁与 SharedWorker 的 owner 释放路径 |
| 查询与事件             | [`find_sql`](../../../packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts)、[`generate_sql`](../../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts)、[`dispatch_unlogged_removals`](../../../packages/rxdb-adapter-sqlite-core/src/unlogged-removal-events.ts)                                        | 查询参数化、分页守卫与无日志实体删除事件路径已抽查                  |

## 确定问题

### SQLC-001 · P2 · 无外键实体的加密 Id 后缀列无法正常写入

**证据与根因。** [`transformEntityValueToSql`](../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts) 在查询 `propertyMap` 之前执行：

```ts
if (!hasForeignKeys && key.endsWith('Id')) {
  needSave[key] = toSQLiteCompatibleValue(entity[key], key);
  continue;
}
```

`foreignKeyNames` 由真实关系推导；无关系实体中的普通 `secretId` 加密字符串声明合法。创建/更新归一化后的物理列名为 `secretId` 时，该分支跳过 `encryptedColumnValue()`，原字符串进入绑定参数。属性名含 Id、物理列名不以 Id 结尾的情况不一定命中，必须以归一化后的实际键判断。

**公开调用链与事务防线。** 普通 `entity.save()` 经 [`EntityManager.save/create/update`](../../../packages/rxdb/src/entity/entity-manager.ts)、[`Repository.create/update`](../../../packages/rxdb/src/repository/Repository.ts)，取得 [`RxDBAdapterSqliteBase.getRepository`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts) 的仓库。该方法使用 [`transactionalRepository`](../../../packages/rxdb/src/repository/transactional-repository.ts) 包装，令 SQL 生成、执行、`addQueryCache()` 解密回填都位于同一个 `adapter.runInTransaction()` 内。执行器仓库失败会让外层回滚，不能仅看 `SqliteRepository.create/update` 内部 `writeQuery()` 的局部顺序，断言普通调用已经提交明文。

**触发与影响。** 注册无关系实体 `{ id, secretId }`，`secretId` 声明 `encrypted:true`、默认物理列名；对普通本地主端执行单实体保存。锁定时未在加密前置检查拒绝，而到写后回填才抛 `EncryptedLockedError`；解锁后仍因原字符串不是信封而抛 `EncryptedDecryptError(malformed_envelope)`。预期解锁后可正常往返，实际合法属性不可写。批量 mutations 也复用此转换，写后解码在事务内，错误传播时同样回滚。

**完整公开入口诊断。** 本轮用真实 `RxDB`、Entity 装饰器、`Entity.save()`、`RxDBAdapterSqliteBase` 和当前事务包装/仓储实现；客户端执行交给当前 [`NodeSqliteEngine`](../../../packages/rxdb-adapter-electron/src/node-sqlite-engine.ts) 的 `node:sqlite` 内存连接。只桥接客户端接口，没有替换 ORM、事务或加密判断。无关系 `log:false` 实体两次保存后，以原始 SELECT 检查真实 SQLite 行：

```json
{
  "cases": [
    { "unlocked": false, "error": { "name": "EncryptedLockedError", "code": "locked" }, "rows": [] },
    { "unlocked": true, "error": { "name": "EncryptedDecryptError", "code": "malformed_envelope" }, "rows": [] }
  ]
}
```

该诊断确认正常公开路径失败且回滚；未证明普通公开路径会提交明文，也未执行六后端持久化字节回归。

**低层证据的范围。** 原 `transformEntityValueToSql` 分支执行得到 `encryptedCalls:0, output.secretId:'PLAINTEXT'`；直接把生成器 SQL 交给独立 Node SQLite 执行也能写入原文。这两项仅证明参数转换缺失，独立执行跳过了 ORM 的事务和回填防线，不能作为普通保存后敏感数据已落盘的证据。调用方手动吞掉执行器仓库的解密异常再提交属于额外前提，本报告不据此推导默认路径的泄漏。

**影响范围。** sqlite、sqliteai、sqlite-wasm、wa-sqlite、小程序、Electron SQLite 与 Tauri 共用该转换。PGlite 写侧没有此分支。

**修复建议。** 优先使用已声明属性、物理列名和真实外键元数据，删除按 Id 后缀猜外键的早退；解锁后的合法列必须进入加密器。不要以拒绝所有 Id 后缀属性代替修复。

**回归建议。** 共享加密套件覆盖普通单实体 create/update/save、mutations、锁定/解锁、默认列名及自定义物理列名以 Id 结尾。解锁后必须成功往返且绑定参数为信封；失败时原始行数与原行内容不变。现有 [`sqlite-core.utils.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/sqlite-core.utils.spec.ts) 分开覆盖后缀兼容与普通加密，缺二者交集。

## 已核对的历史边界

自定义主键列的 AAD 现在由 `entity['id'] ?? entity[get_primary_key_column(metadata)]` 解析，不复报 10 月 27 日已修问题。无日志删除通知仍通过核心事务事件队列延后，不把 PGlite 的历史问题重复登记到 SQLite。

## 验证边界与后续计划

优先执行上述共享真实后端回归，再覆盖 system migration / backup 期间的失败注入。`wrapWithComlinkEndpoint` 公开约定同一底层 Worker 客户端不允许并发租用；官方 oo1 两后端没有承诺 SharedWorker 跨标签页多使用方并用，本轮不把违反单活约定造成的错关连接登记为新问题。未单独执行覆盖率验收目标，未运行全部浏览器 VFS 组合，不作“80%+ 已达标”结论。

## 调用链交叉核查

公开仓库包装层已纳入 SQLC-001 的完整链路诊断，执行器仓库回填错误发生在外层事务提交前。`sharedClientLockName` 的非空值同时选择 Web Lock 与 owner release；sqlite-wasm 的实例推断不一致另由 SWM-001 记录。

## 本次 Nx 校验

本次 `rxdb-adapter-sqlite-core:test`：1576 passed | 21 skipped (1597)；目标实际执行。命令及整体边界见[总索引](README.md)。
