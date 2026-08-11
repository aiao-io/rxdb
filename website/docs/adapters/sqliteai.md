# SQLiteAI 适配器

`@aiao/rxdb-adapter-sqliteai` 基于 [@sqliteai/sqlite-wasm](https://www.npmjs.com/package/@sqliteai/sqlite-wasm) 提供带 AI 扩展的 SQLite 支持，在标准 SQLite 能力之上内置向量存储与相似度搜索，适合需要本地 AI 推理或语义检索的场景。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-sqliteai
```

## 基础使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqliteai } from '@aiao/rxdb-adapter-sqliteai';

const rxdb = new RxDB({
  dbName: 'demo',
  entities: [Article],
  sync: { local: { adapter: 'sqliteai' }, type: SyncType.None }
});

rxdb.adapter(
  'sqliteai',
  async db =>
    new RxDBAdapterSqliteai(db, {
      wasmPath: '/sqliteai/sqliteai.wasm',
      opfs: true // 使用 OPFS 持久化
    })
);

await rxdb.connect('sqliteai');
```

## 配置选项

```typescript
interface SqliteaiOptions {
  // WASM 文件路径
  wasmPath?: string;
  locateFile?: (name: string) => string;

  // OPFS 持久化
  opfs?: boolean;
  opfsProxyPath?: string;
  opfsFallback?: 'memory' | 'throw'; // OPFS 不可用时的回退策略，默认 'throw'

  // Worker 配置
  worker?: boolean;
  workerInstance?: Worker;
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;

  // 性能调优
  cacheSizeKb?: number; // 默认 51200（50MB）
  batchTimeout?: number; // 默认 16ms（BALANCED）

  // 调试
  print?: (msg: string) => void;
  printErr?: (msg: string) => void;
}
```

## OPFS 持久化

```typescript
rxdb.adapter(
  'sqliteai',
  async db =>
    new RxDBAdapterSqliteai(db, {
      opfs: true,
      // OPFS 不可用时回退到内存库（数据不持久）；默认 'throw' 直接失败
      opfsFallback: 'memory',
      wasmPath: '/sqliteai/sqliteai.wasm'
    })
);
```

## Worker 模式

```typescript
// sqliteai.worker.ts
import { SqliteaiClient } from '@aiao/rxdb-adapter-sqliteai';
import { expose } from 'comlink';

expose(new SqliteaiClient());
```

```typescript
rxdb.adapter(
  'sqliteai',
  async db =>
    new RxDBAdapterSqliteai(db, {
      worker: true,
      workerInstance: new Worker(new URL('./sqliteai.worker', import.meta.url), { type: 'module' }),
      wasmPath: '/sqliteai/sqliteai.wasm'
    })
);
```

## 与加密适配器配合

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterSqliteai } from '@aiao/rxdb-adapter-sqliteai';

const rxdb = new RxDB({
  dbName: 'app',
  entities: [Document],
  sync: { local: { adapter: 'sqliteai' }, type: SyncType.None }
});

rxdb.adapter('sqliteai', async db => new RxDBAdapterSqliteai(db, { opfs: true }));
rxdb.init();

const adapter = await rxdb.connect('sqliteai');
await adapter.encryption.unlock({ passphrase: 'my-passphrase' });
```

## 参考

- [SQLite 适配器（wa-sqlite）](./sqlite.md)
- [SQLite WASM 适配器](./sqlite-wasm.md)
- [字段加密](./encrypted.md)
