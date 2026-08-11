# 安装与初始化

本页提供完整依赖清单、两种适配器的初始化示例，以及 Worker、WASM 与 Vite 配置。首次接入请先完成[快速开始](./README.md)。

## 核心依赖

```bash npm2yarn
npm install @aiao/rxdb @aiao/utils
```

## 数据库适配器

可选择一种适配器，也可在不同场景中组合使用。

### SQLite 适配器（推荐）

提供 SQLite 的事务、索引与查询能力，适合多数浏览器端结构化数据场景：

```bash npm2yarn
npm install @aiao/rxdb-adapter-wa-sqlite
```

### PGlite 适配器

在浏览器内运行 PostgreSQL，适合复杂查询与扩展需求：

```bash npm2yarn
npm install @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

能力对比与选型建议见 [SQLite 适配器](../adapters/sqlite.md) 与 [PGlite 适配器](../adapters/pglite.md)。

## 框架集成（按需）

```bash npm2yarn
# React
npm install @aiao/rxdb-react

# Vue 3
npm install @aiao/rxdb-vue

# Angular
npm install @aiao/rxdb-angular
```

验证最小链路时，无需安装测试包或示例实体包。

## 快速初始化

### SQLite 适配器

```typescript
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class Todo extends EntityBase {}

export async function createRxdb() {
  const rxdb = new RxDB({
    dbName: 'demo',
    entities: [Todo],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });

  rxdb.adapter('wa-sqlite', async db => {
    const available = await checkOPFSAvailable();

    return new RxDBAdapterWaSqlite(db, {
      vfs: available ? 'OPFSCoopSyncVFS' : 'IDBBatchAtomicVFS',
      worker: available,
      workerInstance:
        available ? new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' }) : undefined,
      sharedWorker: !available,
      sharedWorkerInstance:
        !available ?
          new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' })
        : undefined,
      wasmPath: available ? '/wa-sqlite/wa-sqlite.wasm' : '/wa-sqlite/wa-sqlite-async.wasm'
    });
  });

  await rxdb.connect('wa-sqlite');
  return rxdb;
}
```

### PGlite 适配器

```typescript
import { Entity, EntityBase, PropertyType, RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
class Todo extends EntityBase {}

export async function createRxdb() {
  const rxdb = new RxDB({
    dbName: 'demo',
    entities: [Todo],
    sync: { local: { adapter: 'pglite' }, type: SyncType.None }
  });

  rxdb.adapter('pglite', async db => {
    const pg = await PGlite.create({ dataDir: `idb://rxdb-${db.dbName}` });
    return new RxDBAdapterPGlite(db, pg);
  });

  await rxdb.connect('pglite');
  return rxdb;
}
```

## Worker 文件配置

### SQLite Worker 文件

#### sqlite.worker.ts（用于 OPFS）

```typescript
import { SqliteWorker } from '@aiao/rxdb-adapter-wa-sqlite';

const worker = new SqliteWorker();
worker.listen();
```

#### sqlite-shared.worker.ts（用于 IDB）

```typescript
import { SqliteSharedWorker } from '@aiao/rxdb-adapter-wa-sqlite';

const worker = new SqliteSharedWorker();
worker.listen();
```

## 静态资源配置

### WASM 文件

将 wa-sqlite 的 WASM 文件放入项目的 `public` 目录：

```text
public/
  wa-sqlite/
    wa-sqlite.wasm           # 用于 OPFS
    wa-sqlite-async.wasm     # 用于 IDB
```

最新版本可从 [wa-sqlite releases](https://github.com/rhashimoto/wa-sqlite/releases) 下载。

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es'
  },
  publicDir: 'public',

  // 启用 OPFS 需要这组 HTTP 头，否则 SharedArrayBuffer 不可用
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  optimizeDeps: {
    exclude: ['@aiao/rxdb-adapter-wa-sqlite', '@aiao/rxdb-adapter-pglite']
  }
});
```

## 注意事项

### Worker 与 WASM 路径

- Worker 文件须用 `new URL('./worker.ts', import.meta.url)` 形式引用
- WASM 路径要和 `public` 目录下的实际路径对齐
- 构建工具（Vite、Webpack 等）需要识别这些资源引用

### HTTP 头

使用 OPFS 时必须配置以下响应头，否则 `SharedArrayBuffer` 不可用：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

### 浏览器支持

| 级别     | 版本要求                                                         |
| -------- | ---------------------------------------------------------------- |
| 最低要求 | Chrome 90+ · Edge 90+ · Safari 14+ · Firefox 88+                 |
| 推荐     | Chrome 102+ · Edge 102+ · Safari 15.2+ · Firefox 111+（支持 OPFS） |

## 示例项目

完整配置可参考仓库内的三个演示：

- `apps/dev-rxdb-angular`
- `apps/dev-rxdb-react`
- `apps/dev-rxdb-vue`

## 下一步

- [模型定义](../model-definition/) — 实体、字段、关系与索引
- [模型查询](../model-query/README.md) — 查询能力与实时订阅
- [SQLite 适配器](../adapters/sqlite.md) / [PGlite 适配器](../adapters/pglite.md) — 进阶配置
