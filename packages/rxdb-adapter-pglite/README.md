# @aiao/rxdb-adapter-pglite

RxDB 适配器，使用 PGlite 在浏览器中运行 PostgreSQL。

## 功能特性

- **本地优先**: 在浏览器中通过 WebAssembly 运行完整 PostgreSQL
- **零服务器**: 无需后端服务器，数据存储在本地
- **PostgreSQL 兼容**: 支持标准 PostgreSQL 语法和功能
- **响应式**: 数据变化自动触发更新

## 何时使用

- 需要 PostgreSQL 特性（如 JSONB、tsvector 全文搜索、高级索引）
- 计划未来迁移到 PostgreSQL 后端
- 需要更强的 SQL 标准兼容性
- 应用需要复杂查询和事务支持

## 与其他适配器对比

| 特性       | PGlite                      | wa-sqlite | sqlite-wasm |
| ---------- | --------------------------- | --------- | ----------- |
| 数据库引擎 | PostgreSQL                  | SQLite    | SQLite      |
| 运行资产   | 约 50.9 MB（未压缩 Worker） | ~500KB    | ~800KB      |
| 全文搜索   | tsvector                    | FTS5      | FTS5        |
| JSON 支持  | JSONB                       | JSON1     | JSON1       |
| 生态兼容   | PostgreSQL                  | SQLite    | SQLite      |

体积按当前构建产物口径记录：浏览器 Worker 未压缩约 50.9 MB，npm tarball 压缩后约 16.9 MB。实际首次传输量取决于部署端压缩，后续加载取决于浏览器缓存策略。

## 安装

```bash
npm install @aiao/rxdb-adapter-pglite
# 或
pnpm add @aiao/rxdb-adapter-pglite
```

## 使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [],
  sync: {
    type: SyncType.None,
    local: { adapter: 'pglite' }
  }
});

rxdb.adapter('pglite', database => new RxDBAdapterPGlite(database, { store: 'memory' }));
await rxdb.connect('pglite');

// 应用退出时释放 Worker 和数据库资源
await rxdb.disconnect('pglite');
```

## 事务 API（C2 已落地第二步）

PGlite 适配器同 `rxdb-adapter-sqlite-core` 一致 —— `transaction()` / `runInTransaction()` 的回调收到 `PGliteTransactionExecutor`：

```typescript
await adapter.transaction(async executor => {
  const repo = executor.getRepository(Post);
  await repo.create({ title: 'inside tx' });
  await executor.mergeChanges(actions, localChanges, /* disableTriggers */ false);
});
```

> `PGliteTransactionExecutor` 不直接导出 —— 它是 `RxDBAdapterPGlite` 的内部产物；状态**自持**，绝不从驱动的 `tx.closed` 派生（该标志在失败路径上不翻转，逃逸出去的 tx 会以 autocommit 继续写）。外部代码通过 `@aiao/rxdb` 的 `TransactionExecutor` 接口与之交互。

## 备份与恢复

`backup()` 把整个数据库写成一个 `.rxdb-backup` 归档流；`restorePGliteDatabase()` 把归档恢复到一个**空的、未连接的**目标。两端都逐块流式处理，不会先把整个库读进内存。

> **外部文件不在备份范围内。** 归档只包含数据库本身（`scope: { database: 'included', externalFiles: 'excluded' }`）。`rxdb-plugin-storage` 等插件存放在数据库之外的文件需要另行备份。

```typescript
import { restorePGliteDatabase, cleanupIncompletePGliteRestore } from '@aiao/rxdb-adapter-pglite';

// 备份：写入任意 WritableStream（例如 File System Access 的文件句柄）
const handle = await showSaveFilePicker({ suggestedName: 'demo.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
console.log(result.sha256, result.bytes);

// 恢复到 IndexedDB：目标 RxDB 实例已注册 adapter，但尚未 connect
const file = await (await showOpenFilePicker())[0].getFile();
await restorePGliteDatabase(file.stream(), { rxdb: target, options: { store: 'idb' } });
await target.connect('pglite');
```

恢复到内存目标时，结果里的 `database` 句柄要交给 adapter 的 `restoredDatabase` 选项领取（只能领取一次）：

```typescript
const { database } = await restorePGliteDatabase(stream, { rxdb: target, options: { store: 'memory' } });
target.adapter('pglite', db => new RxDBAdapterPGlite(db, { store: 'memory', restoredDatabase: database }));
await target.connect('pglite');
```

| 存储                                | 备份                         | 恢复                         |
| ----------------------------------- | ---------------------------- | ---------------------------- |
| `memory`                            | ✅                           | ✅                           |
| `idb`                               | ✅                           | ✅                           |
| 其他（`opfs-ahp://`、`file://` 等） | ❌ `unsupported_combination` | ❌ `unsupported_combination` |

要点：

- **一致性**：备份落在一个已提交事务边界上，备份期间的写入排在其后；锁等待上限由 `lockTimeoutMs`（默认 30s）控制，超时抛 `lock_timeout`。
- **先校验后写入**：manifest 在第一块里读出，引擎版本、schema 指纹、扩展、加密认证域不兼容时在写入目标之前拒绝（`incompatible_archive` / `auth_domain_mismatch`）；完整性（SHA-256）读到末尾才能确认，失败时已写的数据会被丢弃（`corrupt_archive` / `truncated_archive`）。
- **加密库**：归档里只有密文和 keyring 元数据，不含口令与密钥；恢复后的库保持锁定，用原口令 `unlock()`。
- **中断**：IndexedDB 目标在校验通过前不写 IndexedDB，并用持久标记记录「恢复进行中」。进程在恢复中途被杀后，连接与再次恢复都会报 `restore_incomplete`，调用 `cleanupIncompletePGliteRestore(target)` 清理后即可重新恢复；清理失败时报 `cleanup_pending`。
- **独占**：同一目标上并发的恢复只有一个能赢（`target_busy`），恢复期间的连接尝试报 `restore_in_progress`。

所有错误都是 `RxDBBackupError`，按 `error.code` 分支处理（`isRxDBBackupError()` 可做类型收窄）。

## 完整示例

参考 [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular) 中的集成示例。
