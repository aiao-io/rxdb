# 安装与初始化

本页提供完整依赖清单、两种适配器的初始化示例，以及 WASM、可选 Worker 与 Vite 配置。首次接入请先完成[快速开始](./README.md)。

## 核心依赖

```bash npm2yarn
npm install @aiao/rxdb rxjs
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

  rxdb.adapter(
    'wa-sqlite',
    db =>
      new RxDBAdapterWaSqlite(db, {
        vfs: 'IDBBatchAtomicVFS',
        async: true,
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
      })
  );

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

主线程示例无需 Worker。选择 Worker / SharedWorker 时，文件需要**自己编写**：用 comlink 的 `expose` 把适配器客户端暴露给主线程。Worker 文件会直接 `import` comlink，请把它显式装进项目依赖（包管理器不会替你把传递依赖暴露给源码引用）：

```bash npm2yarn
npm install comlink
```

### SQLite Worker 文件

#### sqlite.worker.ts（用于 OPFS）

```typescript
/// <reference lib="webworker" />

import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

const client = new WaSqliteClient();

expose(client);
```

#### sqlite-shared.worker.ts（用于 IDB）

```typescript
import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

declare let self: SharedWorkerGlobalScope;

const client = new WaSqliteClient();

self.onconnect = (event: MessageEvent) => {
  const port = event.ports[0];
  expose(client, port);
};
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

WASM 必须来自适配器实际依赖的同一份 `wa-sqlite` 构建，不能混用上游最新 release。仓库把依赖固定到提交 `2bf1c59d89eb6497535a4217bc62fec68a0bb994`；消费方从安装后的依赖复制 `dist/wa-sqlite-async.wasm`，显式选择同步 OPFS 组合时再复制 `dist/wa-sqlite.wasm`。使用 pnpm 时可从 `node_modules/@aiao/rxdb-adapter-wa-sqlite/node_modules/wa-sqlite/dist/` 取文件；仓库示例从根 `node_modules/wa-sqlite/dist/` 复制。

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  worker: {
    format: 'es'
  },
  publicDir: 'public',

  // 选择依赖 SharedArrayBuffer 的运行模式时启用跨源隔离
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

### HTTP 头与浏览器能力

跨源隔离是 `SharedArrayBuffer` 的前提，是否需要由所选 VFS 决定。最小 IDB 示例和 wa-sqlite 的 `OPFSCoopSyncVFS` 都不要求它；需要时配置：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

不要仅凭浏览器版本判断可用性。IDB 持久化要求 WebAssembly 与 IndexedDB；跨标签页事务协调依赖 Web Locks；选择 SharedWorker 或 OPFS 时还要确认相应 API、Worker 上下文和部署响应头。浏览器隐私模式、存储配额与嵌入策略也会影响结果。适配器差异见[版本兼容矩阵](../compatibility.md)。

## 示例项目

完整配置可参考仓库内的三个演示：

- `apps/dev-rxdb-angular`
- `apps/dev-rxdb-react`
- `apps/dev-rxdb-vue`

## 下一步

- [模型定义](../model-definition/) — 实体、字段、关系与索引
- [模型查询](../model-query/README.md) — 查询能力与实时订阅
- [SQLite 适配器](../adapters/sqlite.md) / [PGlite 适配器](../adapters/pglite.md) — 进阶配置
