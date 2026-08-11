# SQLite WASM 适配器

`@aiao/rxdb-adapter-sqlite-wasm` 基于 [@subframe7536/sqlite-wasm](https://github.com/subframe7536/sqlite-wasm) 提供跨平台 SQLite 支持，内置 FTS5 / UPDATE DELETE LIMIT 扩展，并提供类型安全的 VFS 预设。

与 `@aiao/rxdb-adapter-wa-sqlite` 共享 `@aiao/rxdb-adapter-sqlite-core` 核心；差异在于底层 WASM 由 subframe 包提供，VFS 预设更丰富，是 `@aiao/rxdb-plugin-search` 的**必需适配器**。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-sqlite-wasm
```

## VFS 预设

| `vfs` 取值   | 存储后端                       | 运行环境        | 说明                       |
| ------------ | ------------------------------ | --------------- | -------------------------- |
| `memory`     | 纯内存 `MemoryVFS`             | 主线程 / Worker | 测试 / 临时数据            |
| `idb`        | IndexedDB `IDBBatchAtomicVFS`  | 主线程 / Worker | 通用持久化，兼容性最好     |
| `idb-memory` | 内存 + IDB 镜像 `IDBMirrorVFS` | 主线程 / Worker | 读性能高，写异步镜像       |
| `opfs`       | OPFS `OPFSCoopSyncVFS`         | **必须 Worker** | 最佳性能，需 SAB 支持      |
| `fs-handle`  | 本地文件 `OPFSAnyContextVFS`   | 主线程 / Worker | OPFS FileHandle 或本地文件 |

## 基础使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqlite } from '@aiao/rxdb-adapter-sqlite-wasm';

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
      wasmUrl: new URL('@subframe7536/sqlite-wasm/wasm-async', import.meta.url).href
    })
);

await rxdb.connect('sqlite-wasm');
```

## OPFS 模式（高性能）

OPFS 需要在 Worker 中运行，并要求服务器配置 `Cross-Origin-Opener-Policy` 和 `Cross-Origin-Embedder-Policy` 响应头。

```typescript
// sqlite.worker.ts
import { SqliteWorker } from '@aiao/rxdb-adapter-sqlite-wasm';
new SqliteWorker().listen();
```

```typescript
rxdb.adapter(
  'sqlite-wasm',
  async db =>
    new RxDBAdapterSqlite(db, {
      vfs: 'opfs',
      wasmUrl: new URL('@subframe7536/sqlite-wasm/wasm', import.meta.url).href,
      worker: true,
      workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' })
    })
);
```

## 与全文搜索插件配合

`@aiao/rxdb-plugin-search` 依赖 FTS5，**只兼容此适配器**：

```typescript
import { createRxDatabase } from '@aiao/rxdb';
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const db = await createRxDatabase({
  adapter,
  plugins: [rxDBPluginSearch()]
});
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
