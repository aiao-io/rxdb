# SQLite 适配器

`@aiao/rxdb-adapter-wa-sqlite` 提供了在浏览器中运行 SQLite 数据库的能力，基于 [wa-sqlite](https://github.com/rhashimoto/wa-sqlite) 实现，支持多种虚拟文件系统 (VFS) 和运行模式。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite
```

## 核心概念

### 虚拟文件系统 (VFS)

SQLite 适配器支持多种 VFS，根据浏览器能力选择：

- **OPFSCoopSyncVFS**: 使用 Origin Private File System (OPFS)，性能最佳，需要 SharedArrayBuffer 支持
- **IDBBatchAtomicVFS**: 使用 IndexedDB，兼容性最好，适用于不支持 OPFS 的环境

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

#### sqlite.worker.ts

```typescript
import { SqliteWorker } from '@aiao/rxdb-adapter-wa-sqlite';

const worker = new SqliteWorker();
worker.listen();
```

#### sqlite-shared.worker.ts

```typescript
import { SqliteSharedWorker } from '@aiao/rxdb-adapter-wa-sqlite';

const worker = new SqliteSharedWorker();
worker.listen();
```

## 配置选项

### WaSqliteOptions 接口

```typescript
interface WaSqliteOptions {
  // 虚拟文件系统类型
  vfs: 'OPFSCoopSyncVFS' | 'IDBBatchAtomicVFS';

  // Web Worker 配置 (用于 OPFS)
  worker?: boolean;
  workerInstance?: Worker;

  // Shared Worker 配置 (用于 IDB)
  sharedWorker?: boolean;
  sharedWorkerInstance?: SharedWorker;

  // WASM 文件路径
  wasmPath: string;

  // 数据库文件名（可选，默认使用 dbName）
  filename?: string;

  // SQLite 配置选项
  sqliteOptions?: {
    // 页面大小（字节）
    pageSize?: number;
    // 缓存大小（页数）
    cacheSize?: number;
    // 日志模式
    journalMode?: 'DELETE' | 'TRUNCATE' | 'PERSIST' | 'MEMORY' | 'WAL' | 'OFF';
    // 同步模式
    synchronous?: 'OFF' | 'NORMAL' | 'FULL' | 'EXTRA';
  };
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

最佳性能，需要 OPFS 和 SharedArrayBuffer 支持。

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

- ⚠️ 会阻塞主线程
- ⚠️ 性能最差
- ❌ 不推荐生产使用

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

### 1. 使用 WAL 模式

对于 OPFS，启用 WAL (Write-Ahead Logging) 可以提升并发性能：

```typescript
sqliteOptions: {
  journalMode: 'WAL',
  synchronous: 'NORMAL'
}
```

### 2. 调整缓存大小

增加缓存可以提升查询性能：

```typescript
sqliteOptions: {
  cacheSize: 10000; // 10000 页，约 40MB（页面大小 4KB）
}
```

### 3. 批量操作

使用事务批量执行操作：

```typescript
await rxdb.transaction(async executor => {
  const todoRepo = executor.getRepository(Todo);
  for (const item of items) {
    await todoRepo.create({ title: item.title });
  }
});
```

> 事务回调签名自 C2 起由 `(client)` 收紧为 `(executor: TransactionExecutor)`。零参回调仍兼容 —— TypeScript 允许形参更少。

### 4. 索引优化

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
- 支持 SharedArrayBuffer
- 正确配置 HTTP 头

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

### SharedArrayBuffer 不可用

如果遇到 "SharedArrayBuffer is not defined" 错误：

1. 检查 HTTP 响应头：

```text
Cross-Origin-Opener-Policy: same-origin
Cross-Origin-Embedder-Policy: require-corp
```

1. 如果无法配置 HTTP 头，使用 IDB 模式替代：

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

```typescript
// 1. 检测浏览器支持
const available = await checkOPFSAvailable();

if (available) {
  // 2. 导出现有数据
  const data = await rxdb.exportDatabase();

  // 3. 切换到 OPFS 适配器
  await rxdb.disconnect();

  rxdb.adapter('wa-sqlite', async db => {
    return new RxDBAdapterWaSqlite(db, {
      vfs: 'OPFSCoopSyncVFS',
      worker: true
      // ... OPFS 配置
    });
  });

  await rxdb.connect('wa-sqlite');

  // 4. 导入数据
  await rxdb.importDatabase(data);
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
        sqliteOptions: {
          journalMode: 'WAL',
          synchronous: 'NORMAL',
          cacheSize: 10000
        }
      };
    } else {
      options = {
        vfs: 'IDBBatchAtomicVFS',
        sharedWorker: true,
        sharedWorkerInstance: new SharedWorker(new URL('./sqlite-shared.worker', import.meta.url), {
          type: 'module',
          name: 'rxdb-shared-worker'
        }),
        wasmPath: '/wa-sqlite/wa-sqlite-async.wasm',
        sqliteOptions: {
          journalMode: 'DELETE',
          synchronous: 'NORMAL'
        }
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
