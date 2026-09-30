# 跨 realm writer lease 移除

`@aiao/rxdb` 0.0.25 公开导出的一组 writer lease / upgrade guard API 已从 core 删除，**没有替代品**。**这是破坏性变更**：直接引用这些符号的代码会在编译期报错。

只经 `RxDB.connect()` 正常使用、从未直接 import 这些符号的应用不受影响，升级即可——lease 本来就由 core 在连接期内部启动，应用侧没有需要调用的入口。

## 为什么删

lease 想在运行时挡住「先连上、又长时间挂起、之后才恢复」的旧客户端，但它只能约束**已经加载了新代码**的实例；真正危险的离线旧 bundle 根本不会去读 lease 表。这类跨 Tab / Worker / 进程的排他必须由发布系统承担，见 [Schema 迁移 · 发布顺序](./schema.md#发布顺序)。

## 应用开发者

### 1. 删掉对下列符号的引用

| 类别 | 移除的符号                                                                                                                                                                                         |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 常量 | `RXDB_WRITER_PROTOCOL_VERSION` / `RXDB_WRITER_LEASE_TTL_MS` / `RXDB_WRITER_HEARTBEAT_INTERVAL_MS` / `RXDB_UPGRADE_OWNER_TTL_MS` / `RXDB_WRITER_LEASE_TABLE_NAME` / `RXDB_UPGRADE_GUARD_TABLE_NAME` |
| 函数 | `readRxDBUpgradeGuard` / `assertRxDBUpgradeClaimable` / `readRxDBWriterLease` / `resolveRxDBWriterEpoch` / `createRxDBActiveWriterLeaseError`                                                      |
| 类型 | `RxDBUpgradeGuardState` / `RxDBUpgradeGuardSnapshot` / `RxDBWriterLeaseSnapshot` / `RxDBWriterLeaseErrorCode`                                                                                      |
| 错误 | `RxDBWriterLeaseError`                                                                                                                                                                             |

```diff
-import { RxDBWriterLeaseError } from '@aiao/rxdb';
-
-try {
-  await rxdb.connect('pglite');
-} catch (error) {
-  if (error instanceof RxDBWriterLeaseError && error.code === 'writer_fenced') {
-    promptReload();
-  }
-  throw error;
-}
+await rxdb.connect('pglite');
```

`connect()` 不再抛 `RxDBWriterLeaseError`，按 `writer_fenced` / `writer_guard_*` 分支处理的代码整段删掉即可，不要换成别的错误类型去「兜」——新版本没有对应的失败路径。

### 2. PGlite 数据库里残留的两张表

0.0.25 的 PGlite 适配器会在 `rxdb` schema 下建 `rxdb_upgrade_guard` 与 `rxdb_writer_lease` 两张表；新版本不再读写它们。SQLite 系适配器（wa-sqlite / sqlite-wasm）从未建过这两张表。

- **留着不动是安全的**：新版本不查询、不迁移、不依赖它们。
- 想清掉的话，**必须等所有运行实例都升级之后**再删——仍在线的 0.0.25 实例还在往里写心跳：

```sql
DROP TABLE IF EXISTS "rxdb"."rxdb_writer_lease";
DROP TABLE IF EXISTS "rxdb"."rxdb_upgrade_guard";
```

## 适配器作者

`RxDBAdapterLocalBase` 上的 `startWriterLease()` 同期删除，core 在 `connect()` 里也不再调用它。自定义本地适配器若 `override` 了它，删掉该方法与其中的心跳 / 围栏逻辑即可；`migrateSystemSchema()` 保留不变。

`@aiao/rxdb-adapter-sqlite-core/testing` 导出的一致性套件 `rowsAffectedConformanceSuite` 也一并删除——它断言的正是 lease 心跳依赖的 `rowsAffected` 行为。在自己的适配器测试里调用过它的，删掉那一行即可，其余共享套件照旧。

## 相关

- [Schema 迁移](./schema.md)：系统迁移的发布三道门与旧 bundle 门禁
- [版本与 API 稳定性策略](../versioning.md)：破坏性变更流程
