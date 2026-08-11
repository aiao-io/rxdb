# PGlite 适配器

`@aiao/rxdb-adapter-pglite` 提供了在浏览器中运行 PostgreSQL 数据库的能力，基于 [PGlite](https://github.com/electric-sql/pglite) 实现，让你在浏览器中使用完整的 PostgreSQL 功能。

## 安装

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

## 核心概念

### PGlite 简介

PGlite 是一个轻量级的 PostgreSQL 实现，编译为 WebAssembly，可以在浏览器中运行。它提供：

- 完整的 PostgreSQL SQL 语法支持
- ACID 事务
- 复杂查询和连接
- JSON/JSONB 支持
- 全文搜索
- 扩展支持

### 存储方式

PGlite 支持多种存储方式：

- **IndexedDB**: 持久化存储，刷新页面后数据保留
- **Memory**: 内存存储，仅用于临时数据或测试
- **OPFS**: Origin Private File System，更好的性能（实验性）

## 基础使用

```typescript
import { firstValueFrom } from 'rxjs';
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

const rxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: { local: { adapter: 'pglite' }, type: SyncType.None }
});

rxdb.adapter('pglite', async db => {
  const pg = await PGlite.create({ dataDir: `idb://rxdb-${db.dbName}` });
  return new RxDBAdapterPGlite(db, pg);
});

await rxdb.connect('pglite');
```

### 内存模式

```typescript
const pg = await PGlite.create(); // 不指定 dataDir
```

### OPFS 模式（实验性）

```typescript
const pg = await PGlite.create({ dataDir: `opfs://rxdb-${db.dbName}` });
```

## 配置

```typescript
interface PGliteOptions {
  dataDir?: string; // 'idb://xxx' | 'opfs://xxx' | 留空（内存）
  debug?: boolean;
  extensions?: any[];
}
```

## PostgreSQL 特性

### 1. 完整的 SQL 支持

PGlite 支持标准 PostgreSQL SQL 语法：

```typescript
@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'createdAt', type: PropertyType.date }
  ],
  indexes: [{ properties: ['title'] }, { properties: ['completed', 'createdAt'] }]
})
export class Todo extends EntityBase {}
```

### 2. JSON/JSONB 支持

存储和查询 JSON 数据：

```typescript
@Entity({
  name: 'Settings',
  properties: [
    {
      name: 'config',
      type: PropertyType.json,
      default: () => ({ theme: 'light', language: 'zh-CN', notifications: true })
    }
  ]
})
export class Settings extends EntityBase {}

// 查询 JSON 字段
const settings = await firstValueFrom(
  Settings.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'config->theme', operator: '=', value: 'dark' }]
    }
  })
);
```

### 3. 全文搜索

PGlite 原生支持 PostgreSQL 的 `tsvector` / GIN 索引；当前 aiao 元数据 API 暂未直接暴露这些扩展字段，需要通过 raw SQL 自行创建索引。结构化字段的全文搜索请优先使用 [`@aiao/rxdb-plugin-search`](../plugins/rxdb-plugin-search/README.md)（基于 SQLite FTS5，仅兼容 sqlite-wasm 适配器）。

### 4. 数组类型

```typescript
@Entity({
  name: 'Post',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'tags', type: PropertyType.stringArray, default: () => [] }
  ]
})
export class Post extends EntityBase {}

// 查询包含特定标签的文章
const posts = await firstValueFrom(
  Post.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'tags', operator: '@>', value: ['typescript'] }]
    }
  })
);
```

## 高级功能

### 事务支持

PGlite 支持完整的 ACID 事务：

```typescript
await rxdb.transaction(async executor => {
  // 持有 executor 才算「在本事务内」
  const todoRepo = executor.getRepository(Todo);
  await todoRepo.create({ title: '任务 1' });
  await todoRepo.create({ title: '任务 2' });

  // await new Todo().save(); // ❌ 落回适配器队列并永久挂起
});
```

> 事务回调签名自 C2 起由 `(client)` 收紧为 `(executor: TransactionExecutor)`。零参回调仍兼容 —— TypeScript 允许形参更少。

### 触发器

PGlite 支持数据库触发器（通过 RxDB 的钩子机制）：

```typescript
@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'updatedAt', type: PropertyType.date }
  ]
})
export class Todo extends EntityBase {
  // 保存前自动更新时间戳
  beforeSave() {
    this.updatedAt = new Date();
  }
}
```

### 视图支持

创建数据库视图：

```typescript
// 在适配器初始化后执行
await rxdb.connect('pglite');

// 创建视图
await rxdb.execute(`
  CREATE VIEW active_todos AS
  SELECT * FROM todos
  WHERE completed = false
`);
```

## 性能优化

### 1. 索引优化

合理使用索引提升查询性能：

```typescript
@Entity({
  indexes: [
    // 单列索引
    { properties: ['createdAt'] },
    // 复合索引
    { properties: ['completed', 'createdAt'] }
  ]
})
export class Todo extends EntityBase {
  // ...
}
```

> 需要 GIN / partial / expression 等 PostgreSQL 专有索引时，目前请通过 raw SQL 在迁移阶段自行创建。

### 2. 查询优化

使用 EXPLAIN 分析查询：

```typescript
const result = await rxdb.execute(`
  EXPLAIN ANALYZE
  SELECT * FROM todos
  WHERE completed = false
  ORDER BY created_at DESC
  LIMIT 20
`);

console.log('查询计划:', result);
```

### 3. 批量操作

使用事务批量执行操作：

```typescript
await rxdb.transaction(async executor => {
  const todoRepo = executor.getRepository(Todo);
  for (const item of largeDataSet) {
    await todoRepo.create({ title: item.title });
  }
});
```

### 4. 连接池

PGlite 在浏览器中运行，不需要传统的连接池，但可以复用实例：

```typescript
// 单例模式
let pgliteInstance: PGlite;

rxdb.adapter('pglite', async db => {
  if (!pgliteInstance) {
    pgliteInstance = await PGlite.create({
      dataDir: `idb://rxdb-${db.dbName}`
    });
  }
  return new RxDBAdapterPGlite(db, pgliteInstance);
});
```

## 浏览器兼容性

### IndexedDB 模式

| 浏览器  | 版本 | 支持 |
| ------- | ---- | ---- |
| Chrome  | 90+  | ✅   |
| Edge    | 90+  | ✅   |
| Safari  | 14+  | ✅   |
| Firefox | 88+  | ✅   |

### OPFS 模式（实验性）兼容性

## 对比 SQLite

### PGlite 优势

- ✅ 完整的 PostgreSQL SQL 语法
- ✅ 原生 JSON/JSONB 支持
- ✅ 数组类型支持
- ✅ 全文搜索功能更强大
- ✅ 更多的数据类型
- ✅ 更好的扩展性

### PGlite 劣势

- ⚠️ 文件大小较大（~3-4MB）
- ⚠️ 初始化时间稍长
- ⚠️ 浏览器兼容性测试不如 SQLite 成熟

### 选择建议

**选择 PGlite 如果：**

- 需要完整的 PostgreSQL 功能
- 使用 JSON/JSONB 数据
- 需要全文搜索
- 后端也使用 PostgreSQL（保持一致性）

**选择 SQLite 如果：**

- 追求最小体积
- 需要最佳兼容性
- 不需要高级 PostgreSQL 特性

## 故障排查

### 数据库初始化失败

确保正确等待 PGlite 初始化：

```typescript
// ✅ 正确：等待创建完成
const pg = await PGlite.create({ dataDir: 'idb://mydb' });

// ❌ 错误：没有等待
const pg = PGlite.create({ dataDir: 'idb://mydb' });
```

### 存储空间不足

IndexedDB 有配额限制，可以请求更多空间：

```typescript
if ('storage' in navigator && 'persist' in navigator.storage) {
  const isPersisted = await navigator.storage.persist();
  console.log(`持久化存储: ${isPersisted}`);
}
```

### 查询性能问题

1. 检查是否创建了合适的索引
2. 使用 EXPLAIN 分析查询计划
3. 考虑添加复合索引

## 迁移指南

### 从 SQLite 迁移到 PGlite

```typescript
// 1. 导出 SQLite 数据
const sqliteRxdb = /* 现有的 SQLite RxDB 实例 */;
const data = await sqliteRxdb.exportDatabase();

// 2. 创建 PGlite 实例
const pgliteRxdb = new RxDB({
  dbName: 'myapp',
  entities: [Todo],
  sync: {
    local: { adapter: 'pglite' },
    type: SyncType.None
  }
});

pgliteRxdb.adapter('pglite', async db => {
  const pg = await PGlite.create({
    dataDir: `idb://rxdb-${db.dbName}`
  });
  return new RxDBAdapterPGlite(db, pg);
});

await pgliteRxdb.connect('pglite');

// 3. 导入数据
await pgliteRxdb.importDatabase(data);
```

## 完整示例

```typescript
import { RxDB, Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

// 定义实体
@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false },
    { name: 'tags', type: PropertyType.stringArray, default: () => [] },
    {
      name: 'metadata',
      type: PropertyType.json,
      default: () => ({ priority: 0, category: 'default' })
    }
  ],
  indexes: [{ properties: ['createdAt'] }, { properties: ['completed', 'createdAt'] }]
})
export class Todo extends EntityBase {}

// 初始化数据库
async function initDatabase() {
  const rxdb = new RxDB({
    dbName: 'todo-app',
    entities: [Todo],
    sync: {
      local: { adapter: 'pglite' },
      type: SyncType.None
    }
  });

  // 注册 PGlite 适配器
  rxdb.adapter('pglite', async db => {
    const pg = await PGlite.create({
      dataDir: `idb://rxdb-${db.dbName}`,
      debug: process.env.NODE_ENV === 'development'
    });

    return new RxDBAdapterPGlite(db, pg);
  });

  // 连接数据库
  await rxdb.connect('pglite');

  return rxdb;
}

// 使用数据库
async function main() {
  const rxdb = await initDatabase();

  // 创建待办
  const todo = new Todo();
  todo.title = '学习 PostgreSQL';
  todo.tags = ['database', 'postgresql'];
  todo.metadata = { priority: 1, category: 'learning' };
  await todo.save();

  // 查询包含特定标签的待办
  const todos = await firstValueFrom(
    Todo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'tags', operator: '@>', value: ['database'] }]
      },
      orderBy: [{ field: 'createdAt', sort: 'desc' }]
    })
  );

  console.log('包含 database 标签的待办:', todos);

  // JSON 查询
  const highPriority = await firstValueFrom(
    Todo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'metadata->priority', operator: '=', value: 1 }]
      }
    })
  );

  console.log('高优先级待办:', highPriority);
}

main();
```

## 参考

- [PGlite](https://github.com/electric-sql/pglite)
- [PostgreSQL 文档](https://www.postgresql.org/docs/)
- [模型定义](../model-definition/)
- [安装指南](../getting-started/install.md)
