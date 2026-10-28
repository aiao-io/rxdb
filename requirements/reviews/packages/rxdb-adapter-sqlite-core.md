# rxdb-adapter-sqlite-core 深度评审

评审日期：2026-10-28；源码基线：`7bb16a9014095d4003bd059244722013b36867c1`。本报告按风险追踪公开入口与关键调用链，未声称逐行覆盖全部源码。

验证口径：区分源码实证、原函数局部执行与真实后端运行。统一 Nx 校验结果见 [包级索引](README.md)；未运行的浏览器、真机或 Rust 宿主测试不计为通过。

## 结论与范围

🔴垃圾：加密写入路径存在绕过，必须先处理 SQLC-001。不是 AES-GCM 算法失败，而是合法列根本没有进入加密器。其他 SQLite 后端共用这一段，按一个根因计数。

| 评审重点               | 已追踪的源码与符号                                                                                                                                                                                                                                                                                                    | 当前判断                                                            |
| ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| 写入归一化与加密       | [`transformEntityValueToSql` / `encryptedColumnValue`](../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts)、[`generate_entity_insert_sql`](../../../packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts)、[`update_sql`](../../../packages/rxdb-adapter-sqlite-core/src/entity/update_sql.ts) | 发现 SQLC-001                                                       |
| 事务隔离与终态         | [`SqliteTransactionExecutor`](../../../packages/rxdb-adapter-sqlite-core/src/transaction/SqliteTransactionExecutor.ts)、[`RxDBAdapterSqliteBase.#run_transaction`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)                                                                           | 外部写入重新排队，executor 终态有守卫；未复报旧的环境态串事务问题   |
| 初始化、关闭与资源归还 | [`RxDBAdapterSqliteBase.disconnect` / `#client` / `#withSharedClientLock`](../../../packages/rxdb-adapter-sqlite-core/src/RxDBAdapterSqliteBase.ts)、[`wrapWithComlinkEndpoint` / `releaseComlinkProxy`](../../../packages/rxdb-adapter-sqlite-core/src/create_sqlite_client.ts)                                      | 核对缓存清空、端口租用、持久存储锁与 SharedWorker 的 owner 释放路径 |
| 查询与事件             | [`find_sql`](../../../packages/rxdb-adapter-sqlite-core/src/query/find_sql.ts)、[`generate_sql`](../../../packages/rxdb-adapter-sqlite-core/src/query/query_sql.ts)、[`dispatch_unlogged_removals`](../../../packages/rxdb-adapter-sqlite-core/src/unlogged-removal-events.ts)                                        | 查询参数化、分页守卫与无日志实体删除事件路径已抽查                  |

## 确定问题

### SQLC-001 · P1 · 无外键实体中以 Id 结尾的加密列直接明文写出

**证据与根因。** [`transformEntityValueToSql`](../../../packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts) 在查询 `propertyMap` 之前执行：

```ts
if (!hasForeignKeys && key.endsWith('Id')) {
  needSave[key] = toSQLiteCompatibleValue(entity[key], key);
  continue;
}
```

`hasForeignKeys` 判的是 `foreignKeyNames.length`，正常的无关系实体也是 `false`。声明普通字符串属性 `secretId`、`encrypted: true` 不会让它变成关系外键；[`metadata-transition`](../../../packages/rxdb/src/entity/metadata-transition.ts) 的 `foreignKeyNames` 只从真实关系推导。该列因名字命中旧兼容分支，跳过 `encryptedColumnValue()` 和锁定检查。

**触发步骤。** 注册无关系实体 `{ id, secretId }`，其中 `secretId` 为加密字符串；在普通本地主端对一条无联动实体调用 `entity.save()`。`EntityManager.save()` 的单实体分支直接 create/update，核心 Repository 没有再外包事务；底层 `SqliteRepository.create/update` 在 `writeQuery()` 提交后才经 `addQueryCache()` 解密回填。即使 keyring 未解锁，该列仍被加入 SQL 参数，随后读侧又按加密列解密它。

**影响。** 单实体 create/update 路径可能已经提交明文，调用方却因解密回填失败收到 reject；后续读取仍会按信封契约失败。影响 sqlite、sqliteai、sqlite-wasm、wa-sqlite、小程序、Electron SQLite 与 Tauri；PGlite 写侧没有这一分支。批量 mutations 同样把明文送入 SQL 参数，但其写后解码位于事务内，解密失败通常会回滚，不能据此声称所有批量操作都提交明文。

**交叉复核。** 独立复核沿 [`EntityManager.save()` / `create()` / `update()`](../../../packages/rxdb/src/entity/entity-manager.ts)、[`Repository.create()` / `update()`](../../../packages/rxdb/src/repository/Repository.ts) 和 [`SqliteRepository.create()` / `update()`](../../../packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts) 确认普通单实体入口没有上游事务屏障。另以真实 Entity 装饰器及 `validateEncryptedPropertyMetadata()` 验证 `secretId` 声明合法，将当前 `insert_sql` 生成的 SQL 交给 Node `node:sqlite` 执行，原始 SELECT 读到 `CROSS_CHECK_PLAINTEXT`；读侧 `getEntityObjectFromResult()` 在锁定 keyring 下抛 `EncryptedLockedError`。观测为 `metadataAccepted:true, foreignKeys:[], plaintextInParams:true, storedSecretId:'CROSS_CHECK_PLAINTEXT'`。这是合法元数据到真实 SQLite 执行的组合证据，未声称已运行完整 ORM / 六后端持久化回归。

**验证。** 用 Node `stripTypeScriptTypes` 提取当前文件中完整的 `transformEntityValueToSql` 原函数，仅给模块级依赖注入记录桩。输入 `foreignKeyNames: []`、`encryptedPropertyMap: Map([['secretId', encryptedProperty]])`、`{ secretId: 'PLAINTEXT' }`，输出：

```json
{ "encryptedCalls": 0, "output": { "secretId": "PLAINTEXT" } }
```

这是原函数分支的局部执行证据；真实 SQLite SQL 执行证据另见上面的交叉复核。现有 [`sqlite-core.utils.spec.ts`](../../../packages/rxdb-adapter-sqlite-core/src/__tests__/sqlite-core.utils.spec.ts) 分别覆盖了 Id 兼容分支与 `secret` 加密，没有覆盖二者交集。

**修复建议。** 优先使用已声明的属性、列名和真实关系元数据；删除这个按后缀猜外键的兼容分支。不得通过禁止所有 `*Id` 属性或在每个后端增加特判绕开根因。

**回归建议。** 共享加密套件加入：无关系实体的 `secretId`、自定义物理列名以 `Id` 结尾、keyring 锁定/解锁、create/update/mutations。断言原始参数和落盘字节不含哨兵明文，解锁读取可往返；PGlite 作对照。

## 已核对的历史边界

自定义主键列的 AAD 现在由 `entity['id'] ?? entity[get_primary_key_column(metadata)]` 解析，不复报 10 月 27 日已修问题。无日志删除通知仍通过核心事务事件队列延后，不把 PGlite 的历史问题重复登记到 SQLite。

## 验证边界与后续计划

优先执行上述共享真实后端回归，再覆盖 system migration / backup 期间的失败注入。未单独执行覆盖率验收目标，未运行全部浏览器 VFS 组合，不作“80%+ 已达标”结论。

## 本次 Nx 校验

本次 `rxdb-adapter-sqlite-core:test`：1576 passed | 21 skipped (1597)；目标实际执行。命令及整体边界见[总索引](README.md)。
