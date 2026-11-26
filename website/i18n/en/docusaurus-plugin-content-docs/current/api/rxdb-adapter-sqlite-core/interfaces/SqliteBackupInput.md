# SqliteBackupInput

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L54)

All the context needed for one backup.

## Properties

### adapterName \{#adaptername\}

```ts
readonly adapterName: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L56)

***

### client \{#client\}

```ts
readonly client: SqliteBackupExecutor;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L57)

***

### queue \{#queue\}

```ts
readonly queue: AsyncQueueExecutor;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L59)

***

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L55)

***

### shadowTablesWritable \{#shadowtableswritable\}

```ts
readonly shadowTablesWritable: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L61)

Whether the same adapter can write shadow tables on restore; when it cannot, databases containing shadow tables are rejected before any byte is written out.

***

### storage \{#storage\}

```ts
readonly storage: SqliteSupportedBackupStorage;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/backup/sqlite-backup.ts#L58)
