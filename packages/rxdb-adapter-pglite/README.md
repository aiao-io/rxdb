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

## 完整示例

参考 [dev-rxdb-angular](https://github.com/aiao-io/rxdb/tree/main/apps/dev-rxdb-angular) 中的集成示例。
