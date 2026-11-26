# PGliteRestoreTarget

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L47)

The restore target: an RxDB instance that is **not yet connected**, plus the adapter options it will use when connecting later.

## Remarks

Compatibility (structure fingerprint, extensions, encryption authentication domain) is decided against the target's own configuration, so this must be the same options object later passed to `new RxDBAdapterPGlite(rxdb, options)`.

## Properties

### options \{#options\}

```ts
readonly options: PGliteClientOptions;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L49)

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/restore-pglite-database.ts#L48)
