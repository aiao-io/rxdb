# RxDBRestoreOptions

Defined in: [packages/rxdb/src/backup/backup.interface.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L146)

Restore options.

## Extended by

- [`PGliteRestoreOptions`](../../rxdb-adapter-pglite/interfaces/PGliteRestoreOptions.md)
- [`SqliteRestoreOptions`](../../rxdb-adapter-sqlite-core/interfaces/SqliteRestoreOptions.md)

## Properties

### signal? \{#signal\}

```ts
readonly signal?: AbortSignal;
```

Defined in: [packages/rxdb/src/backup/backup.interface.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/backup/backup.interface.ts#L148)

Cancels before the successful-commit boundary.
