# 备份与恢复

本地数据库适配器提供**一致性备份与恢复**：在数据库运行期间生成一份带版本、带完整性校验的快照归档，并把它恢复到一台全新的空目标上。备份与一次已提交事务的边界一致——不会出现半个事务，也不会丢已提交数据；恢复要么得到完整、已验证、可连接的库，要么目标保持原样。

目前支持 SQLite 系（wa-sqlite / sqlite-wasm / sqlite / sqliteai，以及 Electron / Tauri 桌面 host）与 PGlite（浏览器与 Electron）两类本地适配器。远端适配器（[HTTP](./http.md) / [Supabase](./supabase.md)）不在范围内。

## 支持范围

支持矩阵逐项声明 adapter、源 / 目标存储与运行环境；**只有矩阵内的同一 adapter 组合被承诺**。未列出的组合会明确报 `unsupported_combination`，绝不回退成直接复制活动数据库文件。

| adapter 标识      | 源 / 目标存储                                        | 运行环境                             | 说明                                                                        |
| ----------------- | ---------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------- |
| `pglite`          | `memory` 与 `idb://` 互为源 / 目标                   | 浏览器主线程客户端                   | Worker / OPFS-AHP / 桌面代理客户端报 `unsupported_combination`              |
| `wa-sqlite`       | `MemoryVFS` / `MemoryAsyncVFS` / `IDBBatchAtomicVFS` | 浏览器                               | 仅主线程连接；配置 `worker` / `sharedWorker` 时报 `unsupported_combination` |
| `sqlite-wasm`     | `memory` / `idb`                                     | 浏览器                               | 同上                                                                        |
| `sqlite`          | 内存库与 `opfs: true`                                | 浏览器（官方 sqlite-wasm）           | `worker: true` 实测支持                                                     |
| `sqliteai`        | 内存库与 `opfs: true`                                | 浏览器                               | 同上                                                                        |
| `sqlite-electron` | 应用数据目录下的库文件                               | Electron 主进程 `node:sqlite`（WAL） | 虚表库报 `unsupported_combination`（host 开启 defensive）                   |
| `sqlite-tauri`    | 应用数据目录下的库文件                               | Tauri 2 Rust host（WAL，FTS5）       |                                                                             |
| `pglite-electron` | 应用数据目录下的 PGlite 目录                         | Electron 主进程 PGlite               | host 需显式开启 `backup` 才支持                                             |

同一 adapter 的内存与持久化存储互为源 / 目标。桌面三套组合（`sqlite-electron` / `sqlite-tauri` / `pglite-electron`）的归档已验证 Linux / macOS / Windows 两两互通；浏览器组合不承诺跨 OS 恢复。

:::warning 引擎版本要求

SQLite 系的备份用 `octet_length()` 做分页探测，要求 SQLite ≥ 3.43；更低的引擎备份直接以 `io_error` 失败，不产出归档。桌面 host 自带满足要求的引擎（Electron 内置 3.53+、Tauri rusqlite 内置 3.46+）。

:::

## 核心概念

### 备份目标

「目标」指恢复的落点，必须同时满足：

- **空**：不存在，或不含任何数据库内容。已初始化过的引擎目录、系统表或元数据——即使没有业务记录——也不算空目标（如 sqliteai 每条连接自建的 `_sqliteai_vector` 表），恢复前报 `target_not_empty`。
- **未连接**：目标 RxDB 实例不能已经 `connect()`；已连接或正在恢复时报 `target_busy`。
- **可独占**：必须先取得目标的独占使用权、再检查空状态，并保持独占直到恢复完成或失败处理结束；期间其他连接与恢复请求都被拒绝。

内存目标只承诺当前实例内可用：恢复出的库只活在本实例里，实例结束后必须从归档重新恢复。

### 归档

归档是 `@aiao/rxdb` 核心定义的流式容器（`backup-archive`），两种 adapter 共用：

- 8 字节魔数 `RXDBBAK\x01`，其后是 `类型(1 字节) + 长度(4 字节大端) + 载荷` 的帧序列：manifest → 每个条目一个条目头帧加若干数据帧 → 结束标记。
- 数据帧不超过 `RXDB_BACKUP_CHUNK_SIZE`（64 KiB），JSON 帧不超过 64 KiB；读取方拒绝超限帧——这是两端内存上界的来源：编解码层同时持有的数据不超过一帧加上输入流自身的一个 chunk。
- 结束标记记录条目数、文件字节数，以及结束标记之前**全部归档字节**的 SHA-256。摘要只有读到结尾才知道，因此恢复时必须先把数据写进可丢弃的暂存区，`end` 之后才能提交。
- 输入在结束标记之前耗尽报 `truncated_archive`；结束标记之后还有字节报 `corrupt_archive`。

两种 adapter 的归档布局不同：

| adapter 系 | 归档内容                                                                                                                                                                                                                                                                                                       |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SQLite 系  | 逻辑转储：`sqlite/schema.json`（全部建表 / 索引 / 视图 / 触发器 / 虚表语句、`user_version`、`application_id`、`sqlite_sequence`）、按表分段的 `sqlite/rows/<表>/<序号>`（`quote()` 行字面量，约 1 MiB 落一个条目，单行上限 32 MiB）、`sqlite/summary.json`（每张表的行数）。虚表只记建表语句，数据随影子表转储 |
| PGlite     | 数据目录逐文件快照；运行态文件 `postmaster.pid` / `postmaster.opts` / `pg_internal.init`（`PGLITE_EXCLUDED_FILES`）不入档                                                                                                                                                                                      |

### manifest

归档最前面是 manifest（`RxDBBackupManifest`），恢复时在写入目标**之前**完成兼容性校验。字段与比较规则：

| 字段                                                   | 内容                                                                        | 恢复时                            |
| ------------------------------------------------------ | --------------------------------------------------------------------------- | --------------------------------- |
| `format` / `formatVersion`                             | `rxdb-backup` / `1`                                                         | 必须逐字相等                      |
| `scope`                                                | 数据库与外置文件的包含声明                                                  | 校验                              |
| `adapter.name`                                         | adapter 标识，如 `pglite`                                                   | 相等                              |
| `adapter.engine` / `adapter.engineCompatibility`       | 引擎与数据兼容键（`sqlite` / `sqlite-3`，`postgres` / `postgres-<大版本>`） | 相等                              |
| `adapter.extensions`                                   | 源库加载的扩展                                                              | 目标须提供归档用到的全部          |
| `adapter.engineVersion` / `adapter.storage`            | 引擎完整版本、源存储后端                                                    | 仅记录                            |
| `rxdb.version`                                         | 源 RxDB 版本                                                                | 仅记录                            |
| `rxdb.systemSchemaVersion` / `rxdb.changeCodecVersion` | 内部版本                                                                    | 相等                              |
| `schemaFingerprint`                                    | 实体结构指纹                                                                | 相等                              |
| `encryption.authDomain`                                | 加密认证域（无加密为 `null`）                                               | 相等，否则 `auth_domain_mismatch` |

### schema 指纹

`computeRxDBSchemaFingerprint(entities)` 把用户实体的 `namespace` / `name` / `tableName` / `extends` / 属性 / 计算属性 / 关系 / 索引 / 外键 / 特性等存储相关字段，经规范化 JSON（键按码点排序、丢弃 `displayName` / `description` 等展示文案、bigint / 日期 / 二进制带类型标签）后 SHA-256。与实体声明顺序无关；系统实体不参与（系统表结构由 `rxdb.systemSchemaVersion` 单独把关）。

备份与恢复两端都自动计算指纹并比较，**正常流程不需要调用它**。它从 `@aiao/rxdb` 导出，供工具链或测试使用：

```typescript
import { computeRxDBSchemaFingerprint } from '@aiao/rxdb';

const fingerprint = computeRxDBSchemaFingerprint([Todo, Tag]);
```

加密认证域（`getRxDBBackupAuthDomain`）同理：有实体声明加密列时为库名，否则 `null`。两端用核心包里的同一份算法，保证可比。

### 锁

恢复与正常连接之间需要跨上下文互斥，由两层结构保证：

- **Web Locks**（`tryAcquireRxDBBackupLock`）：恢复拿 `exclusive` 锁、正常连接拿 `shared` 锁，锁名 `rxdb-sqlite-storage:<storageKey>`（SQLite）或 `rxdb-pglite-storage:<storageKey>`（PGlite）。拿不到就**立即**报 `target_busy`，不排队——排队意味着恢复要等一个可能永远不断开的连接。环境不提供 Web Locks 时报 `unsupported_combination`。
- **库内标记**：SQLite 持久化目标先单独提交标记表 `rxdb$restore_in_progress`，写完并核对后再删；PGlite IndexedDB 目标先落 `rxdb-pglite-restore` 标记，验证与持久化完成后删除。标记存在时，普通连接与恢复都报 `restore_incomplete`，必须先清理。

备份等待一致性锁的上限由 `lockTimeoutMs` 控制，默认 30 秒（`PGLITE_BACKUP_LOCK_TIMEOUT_MS` / `SQLITE_BACKUP_LOCK_TIMEOUT_MS` 均为 `30_000`），超时报 `lock_timeout`。在同一 adapter 的事务回调里调用备份会等待自己，只能靠这个上限脱困。

### 队列

每个 adapter 有自己的串行队列（`AsyncQueueExecutor`），备份任务经 `runRxDBBackupWhenQueued` 入队执行。**只有「还在排队」这一段受超时与取消控制**：任务一旦开始执行就交给它自己的取消逻辑（归档写入器在每次写之前检查信号），否则超时回调会在快照写到一半时把调用方放走，而任务仍占着数据库。

## 安装

备份能力随 adapter 一起提供，无需额外安装：

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

## 备份

备份入口是已连接 adapter 上的 `backup()`：

```typescript
adapter.backup(sink: WritableStream<Uint8Array>, options?: RxDBBackupOptions): Promise<RxDBBackupResult>
```

- 输出流成功时被 `close()`，失败时被 `abort()`；只有输出端 `close()` resolve 之后备份才返回——**close 之后的持久化（写盘、上传）由调用方提供的流负责**。
- 取消（`options.signal`）只承诺到成功提交边界：边界之前的取消终止操作并清理；已完成操作不会因迟到的取消回退。
- 错误按稳定分类抛出（见[错误码](#错误码)）。

### SQLite 适配器

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
await rxdb.connect('wa-sqlite');

const adapter = await rxdb.getAdapter('wa-sqlite');
const handle = await showSaveFilePicker({ suggestedName: 'myapp.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());

console.log(result.entries); // 条目数（文件 + 目录）
console.log(result.bytes); // 文件数据总字节数
console.log(result.sha256); // 归档 SHA-256
console.log(result.manifest); // 归档 manifest
console.log(result.scope); // { database: 'included', externalFiles: 'excluded' }
```

SQLite 的备份是**逻辑转储**：在 adapter 串行队列里开一个读事务，依次写出结构、按表分段的行与摘要——读的是 SQL 层看到的已提交状态，不复制任何数据库文件，因此不存在「主文件与 WAL 不同步」的路径，WAL 里已提交的数据都在其中。

### PGlite

调用方式完全相同：

```typescript
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';

const adapter = await rxdb.getAdapter('pglite');
const handle = await showSaveFilePicker({ suggestedName: 'myapp.rxdb-backup' });
const result = await adapter.backup(await handle.createWritable());
```

PGlite 的快照在同时持有查询锁与事务锁时先 `CHECKPOINT`，再逐文件读数据目录。`idb://` 存储同时被其他连接（同页面另一个实例、其他标签页或 Worker）打开时报 `target_busy`：每个连接各有一份内存视图，本连接的快照看不到它们的提交。

### 选项

```typescript
const controller = new AbortController();

await adapter.backup(sink, {
  signal: controller.signal, // 成功提交边界之前的取消
  lockTimeoutMs: 30_000 // 等待一致性锁的上限，默认 30 秒
});
```

:::warning 备份期间写操作会排队

**整个写出过程都占着数据库**：输出流有背压时（慢速磁盘、网络上传），这段时间内的读写都会排队。把输出接到足够快的目标上；在本 adapter 的事务回调里调用备份会等待自己，直到 `lockTimeoutMs` 后报 `lock_timeout`。

:::

## 恢复

恢复只写入**空**目标，不做合并或覆盖。兼容性（adapter、引擎大版本、虚表模块、系统表 / 变更编码版本、实体结构指纹、加密认证域）在写入第一条语句之前判定；全部核对通过、完成该后端承诺的持久化之后，库才对普通连接可见。

### SQLite 适配器

`restore()` 必须在 `rxdb.connect()` **之前**调用，目标实例本身不能已经连接：

```typescript
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

// 目标实例：只注册 adapter，不 connect
const target = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});
target.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db, { vfs: 'IDBBatchAtomicVFS' }));
const adapter = await target.getAdapter('wa-sqlite');

const [handle] = await showOpenFilePicker();
const file = await handle.getFile();
await adapter.restore(file.stream());

await target.connect('wa-sqlite'); // 持久化目标：恢复完成后正常连接
```

- **持久化存储**：恢复完成后正常 `connect()` 即可；恢复中途页面被关，之后的连接报 `restore_incomplete`，须先清理（见下）。
- **内存存储**：恢复出的库只活在本实例里，由下一次 `connect()` 接管；不连接时 `disconnect()` 释放它。

恢复期间变更事件是静音的：恢复出来的行不是新变更，不产生业务变更历史。加密库保持锁定。

### PGlite

PGlite 的恢复是**自由函数**（目标还没连接、没有 adapter 可调）。目标实例会被 `init()`（计算实体集合），但不会被连接；`options` 必须和之后 `new RxDBAdapterPGlite(rxdb, options)` 传入的是**同一份选项**：

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite, restorePGliteDatabase } from '@aiao/rxdb-adapter-pglite';

const options = { store: 'idb' };
const target = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

await restorePGliteDatabase(archiveStream, { rxdb: target, options });

target.adapter('pglite', db => new RxDBAdapterPGlite(db, options));
await target.connect('pglite');
```

IndexedDB 目标：验证通过之前不落盘，提交点是一次性刷入 IndexedDB 的完整落盘；独占 Web Lock 与持久标记保护整个过程。

**内存目标**：内存库没有「之后再打开同一个位置」这回事，恢复结果经 `PGliteRestoredDatabase` 句柄交给 adapter 领取。句柄只能被领取一次，且只能被恢复时校验过的那个 RxDB 实例、以同一组扩展领取：

```typescript
import { RxDBAdapterPGlite, restorePGliteDatabase } from '@aiao/rxdb-adapter-pglite';

const options = { store: 'memory' };
const target = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

const { database } = await restorePGliteDatabase(archiveStream, { rxdb: target, options });

target.adapter('pglite', db => new RxDBAdapterPGlite(db, { ...options, restoredDatabase: database }));
await target.connect('pglite');
```

### 清理未完成的恢复

页面在恢复中途关闭、或恢复失败后清理本身也失败时，目标留有未完成标记，之后的连接报 `restore_incomplete`。清理必须先于连接调用；没有标记时什么都不做，内存存储没有残留可言：

```typescript
import { isRxDBBackupError } from '@aiao/rxdb';
import { cleanupIncompletePGliteRestore } from '@aiao/rxdb-adapter-pglite';

try {
  await restorePGliteDatabase(archiveStream, { rxdb: target, options });
} catch (error) {
  if (isRxDBBackupError(error, 'restore_incomplete')) {
    await cleanupIncompletePGliteRestore({ rxdb: target, options });
    // 清理后可以重新恢复
  }
  throw error;
}
```

SQLite 系的对应入口是 adapter 方法：

```typescript
await adapter.cleanupIncompleteRestore(); // 返回 true 表示确实清理了残留
```

:::tip 普通失败不需要手工清理

恢复失败时目标会被自动清理、退回「从未恢复过」的状态，可直接重试。只有报 `restore_incomplete`（上次没做完）或 `cleanup_pending`（失败后连清理也没做完）时才需要调用清理函数。

:::

### 阶段回调与取消

`restore()` 接受阶段回调（会被 `await`，可用于进度展示）与取消信号：

```typescript
await adapter.restore(archiveStream, {
  signal: controller.signal,
  onStage: stage => console.log(stage)
  // SQLite 持久化目标：marker-written → rows-written → verified → persisted
  // PGlite IndexedDB 目标：marker-written → files-written → verified → persisted
  // 内存目标只触发 rows/files-written 与 verified
});
```

## 底层函数

以下是 adapter 之上的自由函数与常量，供 adapter 实现者与高级场景使用；应用代码优先用上面的 adapter 方法。

来自 `@aiao/rxdb-adapter-sqlite-core`：

| 导出                                 | 签名                                                                                                                              |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `writeSqliteBackup`                  | `(input: SqliteBackupInput, sink: WritableStream<Uint8Array>, options: RxDBBackupOptions) => Promise<RxDBBackupResult>`           |
| `restoreSqliteDatabase`              | `(source: ReadableStream<Uint8Array>, input: SqliteRestoreInput, options: SqliteRestoreOptions) => Promise<SqliteRestoreOutcome>` |
| `cleanupIncompleteSqliteRestore`     | `(input: SqliteRestoreInput) => Promise<boolean>`                                                                                 |
| `describeSqliteDatabase`             | `(executor: SqliteBackupExecutor) => Promise<SqliteBlankDatabase>`                                                                |
| `sqliteStorageLockName`              | `(storageKey: string) => string`                                                                                                  |
| `SQLITE_BACKUP_ENGINE`               | `'sqlite'`                                                                                                                        |
| `SQLITE_BACKUP_ENGINE_COMPATIBILITY` | `'sqlite-3'`                                                                                                                      |
| `SQLITE_BACKUP_LOCK_TIMEOUT_MS`      | `30_000`                                                                                                                          |

其中 `describeSqliteDatabase` 描述一个库的对象清单、结构与全部行，恢复用它判定目标是否「恰好等于引擎新建的空库」（先比对象清单与每表行数，一致才读行，引擎表里攒了大量行的目标不会被整库读进内存）。`SqliteRestoreOutcome.client` 只在内存目标恢复时非空，由 adapter 接管。

来自 `@aiao/rxdb-adapter-pglite`：

| 导出                             | 签名                                                                                                                                |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `restorePGliteDatabase`          | `(source: ReadableStream<Uint8Array>, target: PGliteRestoreTarget, options?: PGliteRestoreOptions) => Promise<PGliteRestoreResult>` |
| `cleanupIncompletePGliteRestore` | `(target: PGliteRestoreTarget) => Promise<boolean>`                                                                                 |
| `verifyPGliteRestored`           | `(db: PGliteQueryable, manifest: RxDBBackupManifest) => Promise<void>`                                                              |
| `PGliteRestoredDatabase`         | 内存目标的一次性句柄（`consumed` / `close()`）                                                                                      |
| `PGLITE_BACKUP_LOCK_TIMEOUT_MS`  | `30_000`                                                                                                                            |
| `PGLITE_EXCLUDED_FILES`          | 不入档的运行态文件集合                                                                                                              |
| `PGLITE_DATA_DIR`                | `'/pglite/data'`                                                                                                                    |

来自 `@aiao/rxdb`（归档容器与错误分类，两端共用）：

| 导出                                                                          | 说明                                                                                    |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `RxDBBackupError` / `isRxDBBackupError(error, code?)` / `RxDBBackupErrorCode` | 稳定错误分类；只按 `code` 分支，`message` 仅供人读                                      |
| `RxDBBackupArchiveWriter` / `RxDBBackupArchiveReader`                         | 流式归档写入 / 读取器；调用顺序 `writeManifest` → `beginEntry` / `writeData` → `finish` |
| `RXDB_BACKUP_CHUNK_SIZE`                                                      | `64 * 1024`                                                                             |
| `parseRxDBBackupManifest` / `assertRxDBBackupCompatible`                      | manifest 校验与兼容性判定                                                               |
| `computeRxDBSchemaFingerprint`                                                | `(entities: readonly EntityType[]) => string`                                           |
| `RXDB_BACKUP_FORMAT` / `RXDB_BACKUP_FORMAT_VERSION` / `RXDB_BACKUP_SCOPE`     | `'rxdb-backup'` / `1` / `{ database: 'included', externalFiles: 'excluded' }`           |

## 边界与承诺

:::warning 只承诺同一 adapter 的组合

归档只能恢复到支持矩阵中**同一 adapter、同一 RxDB 版本线**的目标（system schema / change-codec 版本按相等比较，低版本客户端产出的归档报 `incompatible_archive`）。不同 adapter 之间、不同数据库引擎之间的迁移与格式转换是 Out of Scope。加密归档还要求目标认证域（当前为库名）完全相同。

:::

:::warning 外置文件不在归档内

备份范围是**数据库本身**：用户表、关系、系统表、变更历史、数据库对象与 keyring 的非秘密元数据。`rxdb-plugin-storage` 管理的外置文件本体**不在归档内**——结果与 manifest 以 `scope: { database: 'included', externalFiles: 'excluded' }` 声明这一点。调用方必须另行备份外置文件，不能据此报告「完整应用备份成功」。

:::

- **密钥不入档**：密钥、口令及 key provider secret 不进入归档；keyring 的 salt / kid / KDF 标识 / verifier 等解锁必需的非秘密元数据保留。备份和恢复不要求解锁，恢复库默认保持锁定；缺少或错误的密钥只导致解锁失败，不改变已恢复的密文。
- **失败原子性**：恢复只有在数据库完整、验证通过并完成持久化后才对普通连接可见。失败时不暴露半恢复库、不修改已有数据库；可处理的错误自动清理本次临时资源并允许重试，清理失败时返回 `cleanup_pending` 并拒绝连接。
- **进程中断**：恢复中途进程被强杀后，重新打开目标只能得到完整且已验证的库，或可判别的未完成状态（`restore_incomplete`）；未完成状态支持安全清理后重试，不会被自动初始化掩盖成空库。
- **损坏归档只拒绝**：损坏或不完整的归档一律报 `corrupt_archive` / `truncated_archive`，不做猜测性恢复；损坏数据库的自动修复不在范围内。
- **不做的事**：覆盖或合并非空数据库、选择性恢复实体、JSON / CSV 导入导出、加密认证域更名、密钥轮换、远端适配器（HTTP / Supabase）、整机 / 应用设置备份——均为 Out of Scope。

## 错误码

备份与恢复的失败统一抛 `RxDBBackupError`，按 `code` 分支（`message` 仅供人读）。`details.field` / `expected` / `actual` 给出结构化细节：

| code                      | 含义                                                           |
| ------------------------- | -------------------------------------------------------------- |
| `unsupported_combination` | adapter / 存储组合不在支持矩阵内，或 adapter 未实现该能力      |
| `incompatible_archive`    | 归档元数据缺失或与目标配置不兼容（`details.field` 指出哪一项） |
| `auth_domain_mismatch`    | 加密归档的认证域与目标不同                                     |
| `corrupt_archive`         | 格式损坏、摘要不符或声明与载荷不一致                           |
| `truncated_archive`       | 输入在归档结束标记之前就结束了                                 |
| `target_not_empty`        | 目标已含任何数据库内容（包括仅初始化过的引擎目录）             |
| `target_busy`             | 目标正被其他连接或恢复操作占用；或备份源的存储还被其他连接持有 |
| `restore_in_progress`     | 普通连接撞上正在进行的恢复                                     |
| `restore_incomplete`      | 目标留有未完成恢复的标记，须先清理再恢复                       |
| `cleanup_pending`         | 失败后的清理本身失败；目标保持未完成状态，拒绝连接             |
| `aborted`                 | 调用方在成功提交边界之前取消                                   |
| `io_error`                | 输入 / 输出流或底层存储读写失败                                |
| `storage_full`            | 磁盘空间或存储配额不足                                         |
| `lock_timeout`            | 等待一致性锁超时（例如在事务回调内调用备份）                   |
| `invalid_state`           | adapter 未连接、正在关闭等无法执行操作的状态                   |

## 相关页面

- [适配器总览](./README.md) — 各适配器的选型与分工
- [SQLite](./sqlite.md) / [SQLite WASM](./sqlite-wasm.md) / [SQLiteAI](./sqliteai.md) — SQLite 系适配器
- [PGlite](./pglite.md) — PGlite 适配器
- [字段加密](./encrypted.md) — 加密库的备份 / 恢复语义（密文往返、认证域）
