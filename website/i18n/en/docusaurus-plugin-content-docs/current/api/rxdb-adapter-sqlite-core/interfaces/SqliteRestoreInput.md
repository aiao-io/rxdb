# SqliteRestoreInput

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L49)

All the context needed for one restore, provided by the adapter.

## Properties

### adapterName \{#adaptername\}

```ts
readonly adapterName: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L52)

***

### createClient \{#createclient\}

```ts
readonly createClient: () => Promise<SqliteClientLike>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L55)

Opens a new connection to the target database with the adapter's current configuration.

#### Returns

`Promise`&lt;[`SqliteClientLike`](SqliteClientLike.md)&gt;

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L51)

The target instance: will be `init()`-ed, but must not be connected yet.

***

### shadowTablesWritable \{#shadowtableswritable\}

```ts
readonly shadowTablesWritable: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L57)

Whether the target can write shadow tables; when it cannot, archives containing shadow tables are rejected before being written to the target.

***

### storage \{#storage\}

```ts
readonly storage: SqliteSupportedBackupStorage;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/restore-sqlite-database.ts#L53)
