# @aiao/rxdb-adapter-sqlite-wasm

RxDB SQLite 适配器，基于 [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm)。

与 `@aiao/rxdb-adapter-wa-sqlite` 共享 `@aiao/rxdb-adapter-sqlite-core` 中的核心能力；差异在于底层 SQLite WASM 由 subframe 包提供（自定义 wa-sqlite，支持 FTS5 / UPDATE DELETE LIMIT，内置 typesafe VFS 预设）。

## 何时使用

- 需要 subframe 提供的增强 SQLite 特性（UPDATE/DELETE LIMIT）
- 需要类型安全的 VFS 预设
- 需要更灵活的 VFS 选择（包括 OPFS FileHandle）

## 与其他 SQLite 适配器对比

| 特性                | sqlite-wasm               | wa-sqlite | sqlite-wasm (官方)      |
| ------------------- | ------------------------- | --------- | ----------------------- |
| 底层库              | @subframe7536/sqlite-wasm | wa-sqlite | @sqlite.org/sqlite-wasm |
| UPDATE/DELETE LIMIT | ✅                        | ❌        | ❌                      |
| VFS 预设            | 类型安全                  | 手动配置  | 手动配置                |
| OPFS FileHandle     | ✅                        | ❌        | ✅                      |
| 包大小              | ~800KB                    | ~500KB    | ~1MB                    |

## 支持的存储（VFS 预设）

| `vfs` 取值   | 说明                                          | 运行环境        |
| ------------ | --------------------------------------------- | --------------- |
| `memory`     | 纯内存，`MemoryVFS`                           | 主线程/Worker   |
| `idb`        | IndexedDB，`IDBBatchAtomicVFS`                | 主线程/Worker   |
| `idb-memory` | 内存 + IndexedDB 镜像，`IDBMirrorVFS`         | 主线程/Worker   |
| `opfs`       | OPFS，`OPFSCoopSyncVFS`                       | **必须 Worker** |
| `fs-handle`  | 本地文件/OPFS FileHandle，`OPFSAnyContextVFS` | 主线程/Worker   |

## 安装

```bash
npm install @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm
# 或
pnpm add @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm
```

走 Worker / SharedWorker（`opfs` 强制要求）时，Worker 文件需要你自己 `import { expose } from 'comlink'`，
因此还要装 comlink —— 它是本包的**可选 peer 依赖**，严格模式的 pnpm 不会把 core 的传递依赖暴露给你：

```bash
npm install comlink
# 或
pnpm add comlink
```

## 用法

```ts
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';

const rxdb = new RxDB({
  dbName: 'my-app',
  entities: [/* 实体类 */],
  sync: {
    local: { adapter: 'sqlite-wasm' },
    type: SyncType.None
  }
});

rxdb.adapter('sqlite-wasm', async db => new RxDBAdapterSqlite(db, { vfs: 'idb' }));

await rxdb.connect('sqlite-wasm');
```

在 Worker 中运行（`opfs` VFS 必须 Worker）：

```ts
// sqlite-wasm.worker.ts
import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

expose(new SqliteClient());
```

```ts
// 主线程：workerInstance 本身即可选择 Worker transport
rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'opfs',
      worker: true,
      workerInstance: new Worker(new URL('./sqlite-wasm.worker', import.meta.url), { type: 'module' }),
      workerOwnership: 'client'
    })
);
```

`workerOwnership` 默认是 `caller`：同一个 Worker 可在 `disconnect` 后建立新连接，
但调用方最终必须执行 `worker.terminate()`。像上例一样在 adapter 工厂内创建 Worker 时，
应使用 `client`，这样断开或初始化失败都会释放 Comlink 端口并终止线程。

直接调用 `createSqliteClient` 时，先 `await client.disconnect()`，再调用包根入口导出的
`releaseComlinkProxy(client)`；`RxDBAdapterSqlite` 已在 `disconnect()` 内自动完成代理释放。

## 完整示例

参考 [dev-rxdb-angular](https://github.com/aiao-io/aiao/tree/main/apps/dev-rxdb-angular) 中的集成示例。
