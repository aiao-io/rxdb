# @aiao/rxdb-adapter-sqlite-core

`@aiao/rxdb` 的 SQLite 适配器共享内核。它把「实体 → SQL」的映射、表名解析、规则组构建、基础 Repository 与变更事件等能力抽象为后端无关的基类，供各具体 SQLite 适配器复用。

> 本包一般不直接安装，而是作为 `@aiao/rxdb-adapter-sqlite`、`@aiao/rxdb-adapter-sqlite-wasm`、`@aiao/rxdb-adapter-sqliteai` 等适配器的依赖被间接引入。

## 提供的能力

- `RxDBAdapterSqliteBase`：SQLite 适配器基类，封装事务、建表与变更钩子
- `SqliteTransactionExecutor`：`TransactionExecutor` 在 SQLite 侧的实现；`transaction()` 回调收到的就是它
- `SqliteRepository`：基于 SQLite 的类型安全 Repository 实现
- `buildRuleGroup`：将查询规则编译为 SQL 条件
- `sqliteGetTableName` / `sqliteGetTableNameByMetadata`：实体 → 表名解析
- 后端契约类型：`SqliteBackend`、`SqliteChangeEvent`、`SQLiteChangeType` 等

具体后端只需实现 `SqliteBackend` 契约即可接入。

## 事务 API（C2 已落地第一步）

`RxDBAdapterSqliteBase.transaction()` / `runInTransaction()` 的回调签名已收紧为接收 `SqliteTransactionExecutor`：

```typescript
import type { TransactionFun } from '@aiao/rxdb-adapter-sqlite-core';

const fun: TransactionFun = async executor => {
  // 持有 executor 才算「在本事务内」
  const repo = executor.getRepository(Todo);
  await repo.create({ title: 'inside tx' });

  // executor.execute(sql, bindings) 透传底层 client.execute，
  // 既有的 `transaction(async tx => tx.execute(sql))` 写法不受影响
  await executor.execute('SELECT 1');

  // 嵌套内层工作
  await executor.run(async inner => inner.getRepository(Todo).count());

  // 合并远端变更
  await executor.mergeChanges(actions, localChanges, /* disableTriggers */ false);
};
```

> 零参回调仍然兼容（TS 允许形参更少）。`SqliteTransactionExecutor` 不直接导出 —— 它是 `RxDBAdapterSqliteBase` 的内部产物，外部代码只通过 `@aiao/rxdb` 的 `TransactionExecutor` 接口与之交互。

## 备份与恢复

四个 SQLite 适配器共用这里的实现：`adapter.backup(sink)` 把整个数据库写成一个 `.rxdb-backup` 归档流，
`adapter.restore(source)` 把归档恢复进该 adapter 配置的**空**存储。两端都逐块流式处理，不会把整个库读进内存。

> **外部文件不在备份范围内。** 归档只包含数据库本身（`scope: { database: 'included', externalFiles: 'excluded' }`）。`rxdb-plugin-storage` 等插件存放在数据库之外的文件需要另行备份。

```typescript
// 备份：写入任意 WritableStream（例如 File System Access 的文件句柄）
const handle = await showSaveFilePicker({ suggestedName: 'notes.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());

// 恢复：目标 RxDB 实例已注册 adapter，但尚未 connect
const target = await rxdb.getAdapter('wa-sqlite');
await target.restore(file.stream());
await rxdb.connect('wa-sqlite');
```

要点：

- **逻辑转储**：归档是全部结构语句（表 / 索引 / 视图 / 触发器 / 虚表、`user_version`、`application_id`、`sqlite_sequence`）
  加上 `quote()` 生成的行字面量，在 adapter 串行队列里的同一个读事务中取得，因此落在一个已提交事务边界上，
  也不存在「只复制主文件、漏掉 WAL」的问题。**写出期间数据库被占用**：输出流有背压时读写都会排队；
  锁等待上限由 `lockTimeoutMs`（默认 30s）控制，超时抛 `lock_timeout`。
- **兼容性**：adapter 名、SQLite 大版本、归档用到的虚表模块（例如 `fts5`）、系统表 / 变更编码版本、实体结构指纹、
  加密认证域全部在写入第一条语句之前判定；不兼容报 `incompatible_archive` / `auth_domain_mismatch`。
  完整性（SHA-256）读到末尾才能确认，失败时已写的内容在同一事务里回滚（`corrupt_archive` / `truncated_archive`）。
- **空目标**：目标只能是引擎新建空库本来的样子。引擎在每条连接上自动建的对象（例如 sqliteai 内置扩展的表）
  由客户端的 `describeBlankDatabase()` 在一条临时 `:memory:` 连接上描述，只有对象清单与内容都与之完全一致才算空；
  已有业务数据、只有 RxDB 系统表、或引擎表里写过数据的目标都报 `target_not_empty`。
- **中断**：持久化目标先提交一张「恢复进行中」标记表，再在一个事务里写入结构与数据。页面在恢复中途被关后，
  连接与再次恢复都会报 `restore_incomplete`，调用 `adapter.cleanupIncompleteRestore()` 清理后即可重新恢复；
  清理失败时报 `cleanup_pending`。内存目标没有残留，恢复出来的库由下一次 `connect()` 接管。
- **独占**：持久化目标由 Web Lock `rxdb-sqlite-storage:<storageKey>` 保护；同一目标上并发的恢复只有一个能赢（`target_busy`），
  恢复期间的连接尝试报 `restore_in_progress`。
- **加密库**：归档里只有密文和 keyring 元数据，不含口令与密钥；恢复后的库保持锁定，用原口令 `unlock()`。
- 恢复写入的行不产生变更历史。

### 能力矩阵

| adapter                          | 内存存储                       | 持久化存储                   | 其余配置                                            | 持久化 `journal_mode` | FTS5 | 引擎自建对象             |
| -------------------------------- | ------------------------------ | ---------------------------- | --------------------------------------------------- | --------------------- | :--: | ------------------------ |
| `@aiao/rxdb-adapter-wa-sqlite`   | `MemoryVFS` / `MemoryAsyncVFS` | `IDBBatchAtomicVFS`（`idb`） | 其余 VFS：`unsupported_combination`（`vfs`）        | `delete`              |  ❌  | 无                       |
| `@aiao/rxdb-adapter-sqlite-wasm` | `vfs: 'memory'`                | `vfs: 'idb'`                 | 其余 VFS：`unsupported_combination`（`vfs`）        | `delete`              |  ✅  | 无                       |
| `@aiao/rxdb-adapter-sqlite`      | 不开 `opfs`                    | `opfs: true`（`opfs`）       | `opfsFallback: 'memory'`：`unsupported_combination` | `delete`              |  ✅  | 无                       |
| `@aiao/rxdb-adapter-sqliteai`    | 不开 `opfs`                    | `opfs: true`（`opfs`）       | `opfsFallback: 'memory'`：`unsupported_combination` | `delete`              |  ✅  | vector / memory 扩展的表 |

- 同一 adapter 的内存与持久化存储互为源 / 目标；跨 adapter 的归档报 `incompatible_archive`。
- **WAL**：连接初始化会请求 WAL，但四个 adapter 的持久化 VFS 都不提供 WAL 需要的共享内存，SQLite 静默保留 `delete`。
  备份本身是 SQL 层的读事务，与日志模式无关；WAL 专属用例（已提交未 checkpoint 的帧进入快照）在当前任何浏览器后端上都跑不到。
- 所有错误都是 `RxDBBackupError`，按 `error.code` 分支处理（`isRxDBBackupError()` 可做类型收窄）。
- 自定义后端要支持恢复，客户端需实现 `setChangeEventsMuted()` 与 `describeBlankDatabase()`（可用本包导出的
  `describeSqliteDatabase()`）；缺少时恢复报 `unsupported_combination`（`details.field` 为 `client.<方法名>`）。

## 文档

- 仓库主页：[https://github.com/aiao-io/rxdb](https://github.com/aiao-io/rxdb)
- 适配器指南见项目文档站

## License

[MIT](https://github.com/aiao-io/rxdb/blob/main/LICENSE)
