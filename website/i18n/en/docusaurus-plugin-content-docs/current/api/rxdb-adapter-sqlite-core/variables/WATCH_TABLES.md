# WATCH_TABLES

```ts
const WATCH_TABLES: Set<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L78)

Set of system tables that trigger entity event dispatch.
Only update_hook events for these three tables are surfaced as RxDBChange / RxDBBranch / RxDBMigration events.
