# ChangeRecordEvent

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:8](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L8)

Single-row change event payload dispatched by SQLite update_hook. Collected by each backend's SqliteClient and distributed in batches to the RxDB upper layers.

## Properties

### dbName \{#dbname\}

```ts
dbName: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L10)

***

### rowId \{#rowid\}

```ts
rowId: bigint;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L12)

***

### tableName \{#tablename\}

```ts
tableName: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L11)

***

### type \{#type\}

```ts
type: SQLiteChangeType;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L9)
