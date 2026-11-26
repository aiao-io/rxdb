# Plugin upgrades and enabling

Plugins are registered with `rxdb.use(pluginFactory, options)` — pass the factory itself, do not call it. Enabling a new plugin usually has three steps: install the package, register the plugin, and mark entity metadata as the plugin requires.

## Enabling the full-text search plugin

Take `@aiao/rxdb-plugin-search` as an example (`sqlite-wasm` / `sqlite` / `sqliteai` use the SQLite FTS5 backend, `pglite` uses the `pg-tsvector` backend; all are approved):

```typescript
// 1. Install
// pnpm add @aiao/rxdb-plugin-search @aiao/rxdb-adapter-sqlite-wasm

// 2. Register the plugin in the database configuration
import { rxDBPluginSearch } from '@aiao/rxdb-plugin-search';

const db = new RxDB({
  dbName: 'myapp',
  entities: [Article]
});

// Register — pass the plugin factory itself, options as the second argument
db.use(rxDBPluginSearch, {
  debounce: 300, // default 300ms; 0 disables it
  pageSize: 50
});
```

```typescript
// 3. Mark searchable fields on the entity; only then is an FTS5 table created
@Entity({
  name: 'article',
  properties: [
    { name: 'title', type: PropertyType.string, searchable: true },
    { name: 'body', type: PropertyType.string, searchable: true }
  ]
})
export class Article extends EntityBase {
  title!: string;
  body!: string;
}
```

An entity must mark at least one `searchable` field to get search mounted; otherwise no FTS5 table is created for that collection.

## Framework bindings

The search plugin's framework layers are feature-symmetric:

| Framework | Package                            | Entry         |
| :-------- | :--------------------------------- | :------------ |
| Angular   | `@aiao/rxdb-plugin-search-angular` | `useSearch()` |
| React     | `@aiao/rxdb-plugin-search-react`   | `useSearch()` |
| Vue       | `@aiao/rxdb-plugin-search-vue`     | `useSearch()` |

## Enabling the working tree plugin

The working tree and commit history (`@aiao/rxdb-plugin-working-tree`) take a different path from the search plugin: it declares system contributions, so **`use()` must come before `connect()`**, and after connecting you must `enable()` once:

```typescript
// 1. Install
// pnpm add @aiao/rxdb-plugin-working-tree

// 2. Register — must be before connect(), otherwise core throws while creating tables
import { rxDBPluginWorkingTree } from '@aiao/rxdb-plugin-working-tree';

const db = new RxDB({ dbName: 'myapp', entities: [Todo] });
db.use(rxDBPluginWorkingTree);
await db.connect('sqlite-wasm');

// 3. Enable the capability (idempotent): on an existing database it flips the capability bit and adds branch root nodes; on a new database it is a one-time confirmation
await db.workingTree.enable();
```

After `enable()`, the database carries a capability watermark row; **a client without this plugin that later opens the database is refused connection** and told which package to install. Databases that never enabled the working tree cost nothing without the package. The full flow is in [Working tree split](/migration/working-tree-split.md), and the API is in [Working tree and commit history plugin](/plugins/rxdb-plugin-working-tree/README.md).

## Upgrading an enabled plugin

1. All `@aiao/*` packages share version numbers; when upgrading, **keep the plugin at the same version as core**.
2. After upgrading, check the plugin options for breaking changes (see the [v1 upgrade notes](/migration/v1.md) for the corresponding version).
3. If a plugin touches underlying table structure (such as FTS5), the first connect with the new version rebuilds it as needed; no manual intervention.

## Notes

1. The search plugin throws `SearchUnsupportedAdapterError` fail-fast on adapters that are not approved (`wa-sqlite` / `wa-sqlite-miniprogram` are not yet tested and approved) — check the [compatibility matrix](/compatibility.md) before enabling.
2. Plugin option changes do not affect persisted business data; they only affect runtime behavior.

## See also

- Full search plugin usage is in the "Plugins › Full-text search" section
- [Framework binding migration](/migration/frameworks.md)
