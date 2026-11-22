# @aiao/rxdb

The TypeScript database core for local-first applications. `@aiao/rxdb` defines entities from metadata, provides type-safe repositories, and exposes reactive queries over browser, desktop, and remote adapters.

The core stays independent from storage. Add an adapter such as wa-sqlite, SQLite WASM, PGlite, Supabase, or an HTTP QueryCache adapter, then use the same entity model from Angular, React, or Vue.

## Install

```bash
pnpm add @aiao/rxdb rxjs
pnpm add @aiao/rxdb-adapter-wa-sqlite
```

The repository targets Node.js 26+, pnpm 10+, TypeScript 6, and RxJS 7.8+.

## Define an entity

```ts
import { Entity, EntityBase, PropertyType } from '@aiao/rxdb';

@Entity({
  name: 'Todo',
  tableName: 'todo',
  namespace: 'public',
  properties: [
    { name: 'title', type: PropertyType.string, required: true },
    { name: 'done', type: PropertyType.boolean }
  ]
})
export class Todo extends EntityBase {
  title!: string;
  done!: boolean;
}
```

## Connect, write, and query

```ts
import { firstValueFrom } from 'rxjs';
import { RxDB, SyncType } from '@aiao/rxdb';

const database = new RxDB({
  dbName: 'demo',
  entities: [Todo],
  sync: { local: { adapter: 'sqlite' }, type: SyncType.None }
});

database.adapter('sqlite', db => createYourSqliteAdapter(db));
await database.connect('sqlite');

const repository = database.entityManager.getRepository(Todo);
await repository.create(database.entityManager.instantiate(Todo, { title: 'Write docs', done: false }));

const todos = await firstValueFrom(repository.find({ where: { combinator: 'and', rules: [] } }));
```

Queries return RxJS observables. Writes update active query results through the same local-first change pipeline.

## Choose an adapter

- `@aiao/rxdb-adapter-wa-sqlite` for the default browser-local SQLite path.
- `@aiao/rxdb-adapter-sqlite` or `@aiao/rxdb-adapter-sqlite-wasm` for SQLite WASM variants.
- `@aiao/rxdb-adapter-pglite` for PostgreSQL semantics in the browser.
- `@aiao/rxdb-adapter-supabase` and `@aiao/rxdb-adapter-http` for remote synchronization and QueryCache.
- `@aiao/rxdb-adapter-electron` or `@aiao/rxdb-adapter-tauri` for desktop storage.

## Public contracts

The package exports entity metadata, repositories, queries, transactions, migrations, sync contracts, structured errors, and adapter interfaces. Stable machine-readable error codes are available on the core error classes through `error.code`.

Use `@aiao/rxdb/testing` for test helpers. Run the core package tests with:

```bash
pnpm nx test rxdb --run
```

Read the [English entity model and adapter documentation](https://rxdb.aiao.io/en/docs/getting-started/) for the complete setup path. Chinese readers can use [README.zh-CN.md](README.zh-CN.md).
