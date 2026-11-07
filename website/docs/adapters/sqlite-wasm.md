# SQLite WASM 适配器

`@aiao/rxdb-adapter-sqlite-wasm` 基于 [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm) 提供跨平台 SQLite 支持，内置 FTS5 / UPDATE DELETE LIMIT 扩展，并提供类型安全的 VFS 预设。

与 `@aiao/rxdb-adapter-wa-sqlite` 共享 `@aiao/rxdb-adapter-sqlite-core` 核心；差异在于底层 WASM 由 subframe 包提供，VFS 预设更丰富，是 `@aiao/rxdb-plugin-search` **FTS5 后端的适配器之一**（sqlite / sqliteai 亦兼容，PGlite 走 pg-tsvector 后端）。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm
```

## VFS 预设

| `vfs` 取值   | 存储后端                       | 运行环境        | 说明                           |
| ------------ | ------------------------------ | --------------- | ------------------------------ |
| `memory`     | 纯内存 `MemoryVFS`             | 主线程 / Worker | 测试 / 临时数据                |
| `idb`        | IndexedDB `IDBBatchAtomicVFS`  | 主线程 / Worker | 通用持久化，兼容性最好         |
| `idb-memory` | 内存 + IDB 镜像 `IDBMirrorVFS` | 主线程 / Worker | 读性能高，写异步镜像           |
| `opfs`       | OPFS `OPFSCoopSyncVFS`         | **必须 Worker** | 专用 Worker 中使用同步访问句柄 |
| `fs-handle`  | 本地文件 `OPFSAnyContextVFS`   | 主线程 / Worker | OPFS FileHandle 或本地文件     |

## 基础使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import wasmUrl from '@subframe7536/sqlite-wasm/wasm-async?url';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
});

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'idb',
      wasmUrl
    })
);

await rxdb.connect('sqlite-wasm');
```

## WASM 资源

`wasmUrl` 必须指向本适配器实际安装的 `@subframe7536/sqlite-wasm` 产物。主线程 IDB 示例与看板外壳使用 `dist/wa-sqlite-async.wasm`，OPFS 预设使用 `dist/wa-sqlite.wasm`。Vite 使用上面的 `?url` 导入解析包内资源；也可把对应文件复制到应用的 public 目录，再传入 `/sqlite-wasm/wa-sqlite-async.wasm` 等部署路径。

仓库从 `packages/rxdb-adapter-sqlite-wasm/node_modules/@subframe7536/sqlite-wasm/dist/` 复制资源，确保取到适配器的实际依赖。不要用官方 SQLite WASM 或另一份 wa-sqlite 的同名文件替代。

## OPFS 模式

此处的 `OPFSCoopSyncVFS` 需要在 dedicated Worker 中运行，不要求 SharedArrayBuffer；不能把其它 VFS 的跨源隔离要求套用到这个组合。Worker 文件需要**自己编写**并用 comlink 的 `expose` 暴露客户端（comlink 是可选 peer 依赖，需自行安装）：

```typescript
// sqlite.worker.ts
import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

expose(new SqliteClient());
```

```typescript
import wasmUrl from '@subframe7536/sqlite-wasm/wasm?url';

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'opfs',
      wasmUrl,
      worker: true,
      workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' })
    })
);
```

## 多个标签页共用一条连接（SharedWorker）

SharedWorker 里放一个客户端，每个连上来的标签页都 `expose` 同一个：

```typescript
// sqlite-shared.worker.ts
import { SqliteClient } from '@aiao/rxdb-adapter-sqlite-wasm';
import { expose } from 'comlink';

declare let self: SharedWorkerGlobalScope;

const client = new SqliteClient();

self.onconnect = (event: MessageEvent) => expose(client, event.ports[0]);
```

```typescript
import wasmUrl from '@subframe7536/sqlite-wasm/wasm-async?url';

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'idb',
      wasmUrl,
      sharedWorker: true,
      sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' })
    })
);
```

- 事务按库名在一把跨标签页的 Web Lock 里排队：一个标签页的事务开着时，别的标签页的读写等它结束，不会落进它的事务。
  标签页死在事务中间（关页、崩溃）时，它那笔事务留在连接上，下一个拿到锁的标签页先回滚它。
- 一个标签页断开只交还自己那一份：别的标签页照常读写、照常收到变更事件；最后一个标签页断开时才关库，之后新开的标签页还能连上。
- 只传 `sharedWorkerInstance`、不写 `sharedWorker: true` 也选中 SharedWorker 传输，排队与断开规则完全相同。
- 需要 Web Locks（`navigator.locks`，HTTPS 或 localhost）；没有时 `connect()` 报错。
- 备份与恢复不支持 SharedWorker 传输（`unsupported_combination`）。

## 与全文搜索插件配合

`@aiao/rxdb-plugin-search` 支持 FTS5 与 pg-tsvector 两种后端：SQLite 家族放行 sqlite-wasm / sqlite / sqliteai，PGlite 走 pg-tsvector；wa-sqlite 与小程序适配器尚未放行。本适配器（FTS5 后端）的用法：

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'sqlite-wasm' }, type: SyncType.None }
});

rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'idb',
      wasmUrl
    })
);

rxdb.use(rxDBPluginSearch);
await rxdb.connect('sqlite-wasm');
```

## Vite 配置

```typescript
// vite.config.ts
export default defineConfig({
  worker: { format: 'es' },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  optimizeDeps: {
    exclude: ['@aiao/rxdb-adapter-sqlite-wasm']
  }
});
```

## 与 wa-sqlite 对比

| 维度         | `rxdb-adapter-sqlite-wasm`   | `rxdb-adapter-wa-sqlite` |
| ------------ | ---------------------------- | ------------------------ |
| 底层 WASM    | @subframe7536/sqlite-wasm    | wa-sqlite                |
| FTS5 支持    | ✅ 内置                      | ❌ 不支持                |
| VFS 预设     | 5 种（含 fs-handle）         | 2 种                     |
| 全文搜索插件 | ✅ 兼容                      | ❌ 不兼容                |
| 推荐场景     | 需要全文搜索 / 更多 VFS 选项 | 简单浏览器本地存储       |

## 参考

- [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm)
- [全文搜索插件](../plugins/rxdb-plugin-search/README.md)
- [SQLite 适配器（wa-sqlite）](./sqlite.md)
