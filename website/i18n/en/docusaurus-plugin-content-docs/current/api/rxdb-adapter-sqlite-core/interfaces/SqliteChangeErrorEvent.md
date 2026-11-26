# SqliteChangeErrorEvent

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L77)

Change-handling failure event.

## Remarks

Change handling is an async path triggered by SQLite `update_hook` **outside the call stack**; there is no caller to catch exceptions (SQLC-012). Receiving this event means the entity events for the batch of rows in `rowIds` were **not dispatched**: the local cache and cross-tab state may already be inconsistent with the database, and the recovery strategy (re-query, invalidate, prompt the user) is up to the application layer.

Degrades to `console.error` when there are no listeners, consistent with historical behavior.

## Properties

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L79)

The failure cause, unwrapped

***

### phase \{#phase\}

```ts
readonly phase: SqliteChangeErrorPhase;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L85)

The phase in which the failure occurred

***

### rowIds \{#rowids\}

```ts
readonly rowIds: readonly bigint[];
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L83)

The rows that could not be dispatched

***

### tableName \{#tablename\}

```ts
readonly tableName: string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.interface.ts#L81)

The physical table name where the error occurred (including the `<namespace>$` prefix)
