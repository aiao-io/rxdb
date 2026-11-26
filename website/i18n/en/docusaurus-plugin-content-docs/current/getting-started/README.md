# Getting Started

This guide takes you through the smallest local RxDB data path.

Start with **model definition → local database → query → write → UI binding**. Once that path matches your application, continue with synchronization, branches, and collaboration.

## What you will verify

- A relational database running in the browser
- Reactive query and write flows
- A type-safe entity model
- Equivalent Angular, React, and Vue integration styles

## Run an example

The repository includes runnable applications for all three frameworks.

```bash
pnpm nx serve dev-rxdb-angular
pnpm nx serve dev-rxdb-react
pnpm nx serve dev-rxdb-vue
```

See [capabilities and examples](/getting-started/capabilities.md) for the complete local entry points.

## Install the core packages

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-wa-sqlite rxjs
```

Add a framework binding when needed.

```bash npm2yarn
# React
npm install @aiao/rxdb-react

# Vue 3
npm install @aiao/rxdb-vue

# Angular
npm install @aiao/rxdb-angular
```

The full WASM and Vite setup is documented in [installation and initialization](/getting-started/install.md).

## Define an entity

```typescript
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'completed', type: PropertyType.boolean, default: false }
  ]
})
export class Todo extends EntityBase {
  declare title: string;
  declare completed: boolean;
}
```

Queries, writes, and type inference use this model as their shared boundary.

## Initialize a database

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'myapp',
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
```

The example uses the supported `IDBBatchAtomicVFS` with IndexedDB persistence. Follow [installation and initialization](/getting-started/install.md) to place the matching WASM file.

## Read and write data

```typescript
import { firstValueFrom } from 'rxjs';

const todo = new Todo();
todo.title = 'Finish the RxDB guide';
await todo.save();

const todos = await firstValueFrom(
  Todo.find({
    where: {
      combinator: 'and',
      rules: [{ field: 'completed', operator: '=', value: false }]
    },
    orderBy: [{ field: 'createdAt', sort: 'desc' }]
  })
);
console.log(todos.map(row => row.title));

todo.completed = true;
await todo.save();
await todo.remove();
```

The browser console should list `Finish the RxDB guide`. The final two writes mark the Todo complete and remove it. `Todo.find()` returns a reactive `Observable` that can also deliver later changes. [Reactive queries](/model-query/query-realtime.md)
