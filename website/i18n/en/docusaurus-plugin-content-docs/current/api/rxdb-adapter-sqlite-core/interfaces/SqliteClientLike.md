# SqliteClientLike

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L12)

Minimal client interface for the SQLite adapter. Both wa-sqlite's SqliteClient and sqliteai's SqliteaiClient satisfy this contract.

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(
   type, 
   handler, 
   owner?
): void | Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L23)

Registers a change listener. Comlink remote clients return a Promise; the registrant must await it, otherwise writes may begin before the listener takes effect.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | [`SQLiteChangeType`](../enumerations/SQLiteChangeType.md) | Change type |
| `handler` | (`event`) => `void` | The listener |
| `owner?` | `string` | The owner registering it (see [SqliteClientLike.release](#release)); clients that do not recognize owners ignore this |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

***

### beginSystemMigrationTransactionSql()? \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql?(): string | Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L62)

Gets the strongest lock the backend supports when upgrading the system schema.

#### Returns

`string` \| `Promise`&lt;`string`&gt;

***

### beginTransactionSql()? \{#begintransactionsql\}

```ts
beginTransactionSql?(): string | Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L60)

The SQL used to begin a transaction; defaults to `'BEGIN;'`.

#### Returns

`string` \| `Promise`&lt;`string`&gt;

#### Remarks

A backend may override this to prepend its own lock-strategy statements — for example, wa-sqlite's `IDBBatchAtomicVFS`/`OPFSAdaptiveVFS` with the `shared+hint` lock strategy must first issue `PRAGMA write_hint;` during the shared-lock phase to avoid `SQLITE_BUSY` when upgrading SHARED→RESERVED (see wa-sqlite's `WebLocksMixin`).

Comlink remote clients return a Promise even when the implementation is synchronous; the registrant must await.

***

### describeBlankDatabase()? \{#describeblankdatabase\}

```ts
describeBlankDatabase?(): Promise<SqliteBlankDatabase>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L82)

Describes what a newly created empty database on the same engine looks like.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](SqliteBlankDatabase.md)&gt;

#### Remarks

Some engines (for example sqliteai's built-in extensions) automatically create tables and write initial rows on every new connection; such a database is still "empty". The implementation opens a temporary `:memory:` connection on the same loaded module, describes it with `describeSqliteDatabase()`, and closes it. Restore only treats a target exactly equal to this description as an empty database. Clients that do not implement this method do not support restore.

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L14)

#### Returns

`Promise`&lt;`void`&gt;

***

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L13)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](SqliteSuccessResult.md)&gt;

***

### release()? \{#release\}

```ts
release?(owner): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L40)

An owner exits the shared client: removes the listeners it registered with its `owner`, and returns the share it took at `init` time; the database is closed only when the last share is returned, and after closing it can be `init`-ed again (US-314 B2.3b).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `owner` | `string` | The owner key given at `init` and `addEventListener` time; one that never held a share or already returned it is a no-op |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

In a SharedWorker there is only one client, and every connected tab gets that same one: a tab disconnecting can only return its own share, and cannot close the connection other tabs are still using, the way [SqliteClientLike.disconnect](#disconnect) would. Listeners must be removed per owner: each time Comlink passes a listener it creates a new proxy in the worker, so removal by reference is impossible. Clients that do not implement this method cannot be shared through a SharedWorker.

***

### rollbackOrphanTransaction()? \{#rollbackorphantransaction\}

```ts
rollbackOrphanTransaction?(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L48)

If there is an unfinished transaction on the connection, rolls it back and reports whether a rollback happened (US-314 B2.3b).

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

If a tab sharing a connection dies mid-transaction, its transaction stays open forever: the statements were already sent to the connection, and `COMMIT` / `ROLLBACK` will never come. Cross-tab locks are released together with the tab, so the next holder of the lock calls this first. Only call while holding the cross-tab lock, otherwise it would roll back a transaction someone else is running.

***

### setChangeEventsMuted()? \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted?(muted): void | Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L73)

Pauses / resumes change event collection.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `muted` | `boolean` |

#### Returns

`void` \| `Promise`&lt;`void`&gt;

#### Remarks

Muted during a whole-database restore: system-table rows restored from backup are not new changes and must not be dispatched to listeners as events afterwards. Clients that do not implement this method do not support restore. Comlink remote clients return a Promise; the caller must await.

Muting applies to the whole client, not per owner. A client shared over a SharedWorker is never muted: SharedWorker transport does not support backup and restore (`unsupported_combination`, with `field` set to `transport`).

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.types.ts#L15)

#### Returns

`Promise`&lt;`string`&gt;
