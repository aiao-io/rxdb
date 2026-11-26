# PGlite adapter

`@aiao/rxdb-adapter-pglite` lets you run a PostgreSQL database in the browser, based on [PGlite](https://github.com/electric-sql/pglite), giving you full PostgreSQL capabilities in the browser.

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-pglite @electric-sql/pglite
```

## Core concepts

### What PGlite is

PGlite is a lightweight PostgreSQL implementation compiled to WebAssembly that runs in the browser. It provides:

- full PostgreSQL SQL syntax support
- ACID transactions
- complex queries and joins
- JSON/JSONB support
- full-text search
- extension support

### Storage options

PGlite supports several storage options:

- **IndexedDB**: persistent storage, data survives page refreshes
- **Memory**: in-memory storage, for temporary data or tests only
- **OPFS**: Origin Private File System, better performance (experimental)

## Basic usage

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

### In-memory mode

```typescript
const pg = await PGlite.create(); // no dataDir
```

### OPFS mode (experimental)

```typescript
const pg = await PGlite.create({ dataDir: `opfs://rxdb-${db.dbName}` });
```

## Configuration

```typescript
interface PGliteOptions {
  dataDir?: string; // 'idb://xxx' | 'opfs://xxx' | empty (memory)
  debug?: boolean;
  extensions?: any[];
}
```

## PostgreSQL features

### 1. Full SQL support

PGlite supports standard PostgreSQL SQL syntax:

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

### 2. JSON/JSONB support

Store and query JSON data:

```typescript
@Entity({
  name: 'Settings',
  properties: [
    {
      name: 'config',
      type: PropertyType.json,
      default: () => ({ theme: 'light', language: 'en-US', notifications: true })
    }
  ]
})
export class Settings extends EntityBase {}

// Query a JSON field
const settings = await firstValueFrom(
  Settings.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'config->theme', operator: '=', value: 'dark' }]
    }
  })
);
```

### 3. Full-text search

PGlite natively supports PostgreSQL's `tsvector` / GIN indexes; the current rxdb metadata API does not directly expose these extension fields yet, so create the indexes yourself through raw SQL. For full-text search on structured fields, prefer [`@aiao/rxdb-plugin-search`](/plugins/rxdb-plugin-search/README.md): this adapter supports it (pg-tsvector backend); in the SQLite family, sqlite-wasm / sqlite / sqliteai are compatible (FTS5 backend), while wa-sqlite and the mini-program adapter are not yet allowlisted.

### 4. Array types

```typescript
@Entity({
  name: 'Post',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'tags', type: PropertyType.stringArray, default: () => [] }
  ]
})
export class Post extends EntityBase {}

// Query posts containing a specific tag
const posts = await firstValueFrom(
  Post.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'tags', operator: '@>', value: ['typescript'] }]
    }
  })
);
```

## Advanced features

### Transactions

PGlite supports full ACID transactions (the correct entry point is the adapter's `transaction()`, see [Transactions](/model-mutation/transaction.md)):

```typescript
import type { TransactionExecutor } from '@aiao/rxdb';

const adapter = await rxdb.getAdapter('pglite');

await adapter.transaction(async (executor: TransactionExecutor) => {
  // Hold the executor to be "inside the transaction"
  const todoRepo = executor.getRepository(Todo);
  // Repositories accept entity instances only, not plain objects
  await todoRepo.create(rxdb.entityManager.instantiate(Todo, { title: 'Task 1' }));
  await todoRepo.create(rxdb.entityManager.instantiate(Todo, { title: 'Task 2' }));

  // await new Todo().save(); // ❌ falls back to the adapter queue and hangs forever
});
```

> Since C2, the transaction callback signature is tightened from `(client)` to `(executor: TransactionExecutor)`. Zero-parameter callbacks remain compatible — TypeScript allows fewer parameters.

### Triggers

PGlite supports database triggers (through RxDB's hook mechanism):

```typescript
@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string },
    { name: 'updatedAt', type: PropertyType.date }
  ]
})
export class Todo extends EntityBase {
  // Auto-update the timestamp before save
  beforeSave() {
    this.updatedAt = new Date();
  }
}
```

### Views

Create database views (DDL issued through the adapter's exposed `writeQuery()`):

```typescript
// Run after the adapter is initialized
await rxdb.connect('pglite');

const adapter = await rxdb.getAdapter('pglite');

// Create a view
await adapter.writeQuery(`
  CREATE VIEW active_todos AS
  SELECT * FROM todos
  WHERE completed = false
`);
```

## Performance optimization

### 1. Index optimization

Use indexes sensibly to improve query performance:

```typescript
@Entity({
  indexes: [
    // single-column index
    { properties: ['createdAt'] },
    // composite index
    { properties: ['completed', 'createdAt'] }
  ]
})
export class Todo extends EntityBase {
  // ...
}
```

> For PostgreSQL-specific indexes such as GIN / partial / expression indexes, create them yourself through raw SQL during migration for now.

### 2. Query optimization

Analyze queries with EXPLAIN (issued through the adapter's exposed `query()`):

```typescript
const adapter = await rxdb.getAdapter('pglite');

const result = await adapter.query(`
  EXPLAIN ANALYZE
  SELECT * FROM todos
  WHERE completed = false
  ORDER BY created_at DESC
  LIMIT 20
`);

console.log('Query plan:', result);
```

### 3. Batch operations

Use transactions for batch operations:

```typescript
import type { TransactionExecutor } from '@aiao/rxdb';

const adapter = await rxdb.getAdapter('pglite');

await adapter.transaction(async (executor: TransactionExecutor) => {
  const todoRepo = executor.getRepository(Todo);
  for (const item of largeDataSet) {
    await todoRepo.create(rxdb.entityManager.instantiate(Todo, { title: item.title }));
  }
});
```

### 4. Connection reuse

PGlite runs in the browser and needs no traditional connection pool, but the instance can be reused:

```typescript
// Singleton pattern
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

## Browser compatibility

### IndexedDB mode

| browser | version | supported |
| ------- | ------- | --------- |
| Chrome  | 90+     | ✅        |
| Edge    | 90+     | ✅        |
| Safari  | 14+     | ✅        |
| Firefox | 88+     | ✅        |

### OPFS mode (experimental) compatibility

## Comparing SQLite

### PGlite advantages

- ✅ full PostgreSQL SQL syntax
- ✅ native JSON/JSONB support
- ✅ array type support
- ✅ more powerful full-text search
- ✅ more data types
- ✅ better extensibility

### PGlite disadvantages

- ⚠️ larger file size (~3-4MB)
- ⚠️ slightly longer initialization time
- ⚠️ browser compatibility testing less mature than SQLite

### Choosing

**Choose PGlite if:**

- you need full PostgreSQL features
- you use JSON/JSONB data
- you need full-text search
- your backend also uses PostgreSQL (consistency)

**Choose SQLite if:**

- you want the smallest footprint
- you need the best compatibility
- you do not need advanced PostgreSQL features

## Troubleshooting

### Database initialization failure

Make sure to await PGlite initialization properly:

```typescript
// ✅ correct: wait for creation to complete
const pg = await PGlite.create({ dataDir: 'idb://mydb' });

// ❌ wrong: did not wait
const pg = PGlite.create({ dataDir: 'idb://mydb' });
```

### Insufficient storage

IndexedDB has quota limits; request more space:

```typescript
if ('storage' in navigator && 'persist' in navigator.storage) {
  const isPersisted = await navigator.storage.persist();
  console.log(`Persistent storage: ${isPersisted}`);
}
```

### Query performance issues

1. Check whether suitable indexes were created
2. Analyze the query plan with EXPLAIN
3. Consider adding composite indexes

## Migration guide

### From SQLite to PGlite

RxDB has no whole-database export/import API. The data-preserving migration path: keep the old database connected, move the data with the public query/write APIs into a target database with a **new `dbName`**, and disconnect the old one after verifying (see [Adapter switching and data migration](/migration/adapters.md) for the approach).

```typescript
import { firstValueFrom } from 'rxjs';

// 1. Keep the old SQLite connection and read all the data
const sqliteRxdb = /* the existing SQLite RxDB instance */;
const todos = await firstValueFrom(Todo.find({}));

// 2. Create a PGlite instance (new dbName, so the two underlying stores do not overwrite each other)
const pgliteRxdb = new RxDB({
  dbName: 'myapp-pglite',
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

// 3. Write into the target database
for (const todo of todos) {
  const copy = new Todo();
  Object.assign(copy, todo);
  await copy.save();
}

// 4. Disconnect the old database after verifying the counts match
await sqliteRxdb.disconnect('wa-sqlite');
```

## Complete example

```typescript
import { RxDB, Entity, EntityBase, PropertyType, SyncType } from '@aiao/rxdb';
import { RxDBAdapterPGlite } from '@aiao/rxdb-adapter-pglite';
import { PGlite } from '@electric-sql/pglite';

// Define the entity
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

// Initialize the database
async function initDatabase() {
  const rxdb = new RxDB({
    dbName: 'todo-app',
    entities: [Todo],
    sync: {
      local: { adapter: 'pglite' },
      type: SyncType.None
    }
  });

  // Register the PGlite adapter
  rxdb.adapter('pglite', async db => {
    const pg = await PGlite.create({
      dataDir: `idb://rxdb-${db.dbName}`,
      debug: process.env.NODE_ENV === 'development'
    });

    return new RxDBAdapterPGlite(db, pg);
  });

  // Connect the database
  await rxdb.connect('pglite');

  return rxdb;
}

// Use the database
async function main() {
  const rxdb = await initDatabase();

  // Create a todo
  const todo = new Todo();
  todo.title = 'Learn PostgreSQL';
  todo.tags = ['database', 'postgresql'];
  todo.metadata = { priority: 1, category: 'learning' };
  await todo.save();

  // Query todos containing a specific tag
  const todos = await firstValueFrom(
    Todo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'tags', operator: '@>', value: ['database'] }]
      },
      orderBy: [{ field: 'createdAt', sort: 'desc' }]
    })
  );

  console.log('Todos with the database tag:', todos);

  // JSON query
  const highPriority = await firstValueFrom(
    Todo.find({
      where: {
        combinator: 'and',
        rules: [{ field: 'metadata->priority', operator: '=', value: 1 }]
      }
    })
  );

  console.log('High-priority todos:', highPriority);
}

main();
```

## Reference

- [PGlite](https://github.com/electric-sql/pglite)
- [PostgreSQL documentation](https://www.postgresql.org/docs/)
- [Model definition](../model-definition/)
- [Installation guide](/getting-started/install.md)
