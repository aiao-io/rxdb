# SQLite 适配器

`@aiao/rxdb-adapter-wa-sqlite` 提供了在浏览器中运行 SQLite 数据库的能力，基于 [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) 实现，支持多种虚拟文件系统 (VFS) 和运行模式。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

## 核心概念

### 虚拟文件系统 (VFS)

SQLite 适配器支持多种 VFS，根据浏览器能力选择：

- **OPFSCoopSyncVFS**: 使用 Origin Private File System (OPFS)，性能最佳；仅 dedicated Worker，不要求 SharedArrayBuffer
- **IDBBatchAtomicVFS**: 使用 IndexedDB，生产支持（默认），适用于不支持 OPFS 的环境

### 运行模式

- **Worker**: 在 Web Worker 中运行，推荐用于 OPFS
- **SharedWorker**: 在 Shared Worker 中运行，推荐用于 IDB，可跨标签页共享

## 基础使用

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
});

rxdb.adapter('wa-sqlite', async db => {
  const available = await checkOPFSAvailable();

  return new RxDBAdapterWaSqlite(db, {
    vfs: available ? 'OPFSCoopSyncVFS' : 'IDBBatchAtomicVFS',
    worker: available,
    workerInstance: available ? new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' }) : undefined,
    sharedWorker: !available,
    sharedWorkerInstance:
      !available ? new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' }) : undefined,
    wasmPath: available ? '/wa-sqlite/wa-sqlite.wasm' : '/wa-sqlite/wa-sqlite-async.wasm'
  });
});

await rxdb.connect('wa-sqlite');
```

### Worker 文件

Worker / SharedWorker 文件需要**自己编写**：用 comlink 的 `expose` 把客户端暴露给主线程，comlink 需一并安装（`npm install comlink`）。

#### sqlite.worker.ts

```typescript
/// <reference lib="webworker" />

import { WaSqliteClient } from '@aiao/rxdb-adapter-wa-sqlite';
import { expose } from 'comlink';

const client = new WaSqliteClient();

expose(client);
```

#### sqlite-shared.worker.ts

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

## 配置选项

### WaSqliteOptions 接口

```typescript
interface WaSqliteOptions {
  // 虚拟文件系统类型（9 值联合，缺省为 IDBBatchAtomicVFS）
  vfs?: 'MemoryVFS' | 'MemoryAsyncVFS' | 'IDBBatchAtomicVFS' | 'IDBMirrorVFS' | 'AccessHandlePoolVFS' | 'OPFSAdaptiveVFS' | 'OPFSAnyContextVFS' | 'OPFSCoopSyncVFS' | 'OPFSWriteAheadVFS';

  // 加载哪个 wasm 构建：true = asyncify（wa-sqlite-async.wasm），false = 同步（wa-sqlite.wasm）。
  // 不指定时由所选 VFS 声明的能力决定
  async?: boolean;

  // WASM 文件完整 URL，必须与 async 解析出的构建匹配
  wasmPath?: string;

  // 自定义 wasm 文件定位
  locateFile?: (name: string) => string;

  // Web Worker 配置（用于 OPFS）：worker 必须与 workerInstance 成对提供
  worker?: boolean;
  workerInstance?: Worker;

  // Shared Worker 配置（用于 IDB）：sharedWorker 必须与 sharedWorkerInstance 成对提供，
  // 且不能与 worker 同时启用
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;

  // Worker 生命周期所有权：caller（默认，保留线程供后续连接复用）
  // | client（释放客户端代理或初始化失败时终止 Worker）
  workerOwnership?: 'caller' | 'client';

  // SQLite 页面缓存（KB），默认 51200（见 SQLite PRAGMA cache_size）
  cacheSizeKb?: number;

  // 批量派发超时，默认 16
  batchTimeout?: number;
}
```

## VFS 配置

### OPFS + Worker

```typescript
const adapter = new RxDBAdapterWaSqlite(rxdb, {
  vfs: 'OPFSCoopSyncVFS',
  worker: true,
  workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' }),
  wasmPath: '/wa-sqlite/wa-sqlite.wasm'
});
```

性能最佳；仅 dedicated Worker 运行，不要求 SharedArrayBuffer。

### IDB + SharedWorker

```typescript
const adapter = new RxDBAdapterWaSqlite(rxdb, {
  vfs: 'IDBBatchAtomicVFS',
  sharedWorker: true,
  sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), { type: 'module' }),
  wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
});
```

**特点：**

- ✅ `IDBBatchAtomicVFS` 是本包**默认且唯一生产级** VFS（wa-sqlite 的 OPFS 系列实现均为实验性，需评估后显式选择）
- ✅ SharedWorker 让 SQLite 运行在独立线程，**不阻塞主线程**
- ✅ 跨标签页共享同一连接，规避多标签页同时写库的锁定冲突

## 构建配置

### Vite 配置

```typescript
// vite.config.ts
import { defineConfig } from 'vite';

export default defineConfig({
  // 配置 Worker 支持
  worker: {
    format: 'es'
  },

  // 配置静态资源
  publicDir: 'public',

  // 如果使用 OPFS，需要配置 HTTP 头
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },

  optimizeDeps: {
    exclude: ['@aiao/rxdb-adapter-wa-sqlite']
  }
});
```

### 静态资源配置

将 wa-sqlite WASM 文件放到 `public` 目录：

```text
public/
  wa-sqlite/
    wa-sqlite.wasm           # 用于 OPFS
    wa-sqlite-async.wasm     # 用于 IDB
```

## 性能优化

### 1. 调整缓存大小

`cacheSizeKb` 控制 SQLite 页面缓存（默认 `51200`），增大可提升查询性能：

```typescript
const adapter = new RxDBAdapterWaSqlite(db, {
  vfs: 'OPFSCoopSyncVFS',
  cacheSizeKb: 51200
});
```

### 2. 批量操作

使用事务批量执行操作（正确入口是适配器的 `transaction()`，见[事务](../model-mutation/transaction.md)）：

```typescript
import type { TransactionExecutor } from '@aiao/rxdb';

const adapter = await rxdb.getAdapter('wa-sqlite');

await adapter.transaction(async (executor: TransactionExecutor) => {
  const todoRepo = executor.getRepository(Todo);
  for (const item of items) {
    await todoRepo.create({ title: item.title });
  }
});
```

> 事务回调签名自 C2 起由 `(client)` 收紧为 `(executor: TransactionExecutor)`。零参回调仍兼容 —— TypeScript 允许形参更少。

### 3. 索引优化

为常用查询字段创建索引：

```typescript
@Entity({
  indexes: [{ properties: ['createdAt'] }, { properties: ['completed', 'createdAt'] }]
})
export class Todo extends EntityBase {
  // ...
}
```

## 浏览器兼容性

### OPFS + Worker 模式

| 浏览器  | 版本  | 支持 |
| ------- | ----- | ---- |
| Chrome  | 102+  | ✅   |
| Edge    | 102+  | ✅   |
| Safari  | 15.2+ | ✅   |
| Firefox | 111+  | ✅   |

**要求：**

- 支持 OPFS (File System Access API)
- 在 dedicated Worker 中运行

### IDB + SharedWorker 模式

| 浏览器  | 版本 | 支持 |
| ------- | ---- | ---- |
| Chrome  | 90+  | ✅   |
| Edge    | 90+  | ✅   |
| Safari  | 14+  | ✅   |
| Firefox | 88+  | ✅   |

**要求：**

- 支持 IndexedDB
- 支持 Shared Worker

## 故障排查

### OPFS 不可用

在不支持 OPFS 的浏览器或环境中，改用 IDB 模式替代：

```typescript
const available = await checkOPFSAvailable();
if (!available) {
  // 使用 IDB 模式
}
```

### Worker 加载失败

确保 Worker 文件路径正确：

```typescript
// ✅ 正确：使用 new URL
new Worker(new URL('./sqlite.worker', import.meta.url), {
  type: 'module'
});

// ❌ 错误：直接使用字符串路径
new Worker('./sqlite.worker.ts');
```

### WASM 文件加载失败

检查 WASM 文件是否在正确的路径：

```typescript
// 确保路径与 public 目录中的文件对应
wasmPath: '/wa-sqlite/wa-sqlite.wasm';
```

### 数据库锁定

如果多个标签页同时访问数据库导致锁定：

1. 使用 SharedWorker 模式（IDB）
2. 或实现标签页间的协调机制

## 迁移指南

### 从 IDB 迁移到 OPFS

RxDB 没有整库导出/导入 API。保留数据的迁移方式是：保持旧库连接，用公开的查询/写入 API 把数据搬进一个**新 `dbName`** 的目标库，校验后再断开旧库（口径见[适配器切换与数据迁移](../migration/adapters.md)）。

```typescript
import { firstValueFrom } from 'rxjs';

// 1. 检测浏览器支持
const available = await checkOPFSAvailable();

if (available) {
  // 2. 保持旧库（IDB）连接，读出全部数据
  const todos = await firstValueFrom(Todo.find({}));

  // 3. 以新 dbName 连接 OPFS 目标库，避免与旧库的底层存储互相覆盖
  const target = new RxDB({
    dbName: 'todo-app-opfs',
    entities: [Todo],
    sync: { local: { adapter: 'wa-sqlite' }, type: SyncType.None }
  });

  target.adapter('wa-sqlite', async db => {
    return new RxDBAdapterWaSqlite(db, {
      vfs: 'OPFSCoopSyncVFS',
      worker: true,
      workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), { type: 'module' })
      // ... OPFS 配置
    });
  });

  await target.connect('wa-sqlite');

  // 4. 写入目标库
  for (const todo of todos) {
    const copy = new Todo();
    Object.assign(copy, todo);
    await copy.save();
  }

  // 5. 校验数量一致后，断开旧库
  await rxdb.disconnect('wa-sqlite');
}
```

## 完整示例

```typescript
import { RxDB, Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite, WaSqliteOptions } from '@aiao/rxdb-adapter-wa-sqlite';
import { checkOPFSAvailable } from '@aiao/utils';

// 定义实体
@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {}

// 初始化数据库
async function initDatabase() {
  const rxdb = new RxDB({
    dbName: 'todo-app',
    entities: [Todo],
    sync: {
      local: { adapter: 'wa-sqlite' },
      type: SyncType.None
    }
  });

  // 注册 SQLite 适配器
  rxdb.adapter('wa-sqlite', async db => {
    let options: WaSqliteOptions;
    const available = await checkOPFSAvailable();

    if (available) {
      options = {
        vfs: 'OPFSCoopSyncVFS',
        worker: true,
        workerInstance: new Worker(new URL('./sqlite.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-worker'
        }),
        wasmPath: '/wa-sqlite/wa-sqlite.wasm',
        cacheSizeKb: 51200
      };
    } else {
      options = {
        vfs: 'IDBBatchAtomicVFS',
        sharedWorker: true,
        sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-shared-worker'
        }),
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm'
      };
    }

    return new RxDBAdapterWaSqlite(db, options);
  });

  // 连接数据库
  await rxdb.connect('wa-sqlite');

  return rxdb;
}

// 使用数据库
async function main() {
  const rxdb = await initDatabase();

  // 创建待办
  const todo = new Todo();
  todo.title = '学习 RxDB';
  await todo.save();

  // 查询待办
  const todos = await firstValueFrom(
    Todo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'completed', operator: '=', value: false }]
      }
    })
  );

  console.log('未完成的待办:', todos);
}

main();
```

## 参考

- [wa-sqlite](https://github.com/rhashimoto/wa-sqlite)
- [OPFS](https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API)
- [SharedArrayBuffer](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/SharedArrayBuffer)
- [模型定义](../model-definition/)
- [安装指南](../getting-started/install.md)
