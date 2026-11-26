# PGliteClient

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:385](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L385)

PGlite client: wraps a `@electric-sql/pglite` instance and provides:

- a unified query/exec/transaction API (aligned with [IPGliteClient](../interfaces/IPGliteClient.md))
- NOTIFY listening on system tables (rxdb_change/rxdb_branch/rxdb_migration) with batched dispatch
  (16ms trailing debounce, plus max-wait and capacity ceilings as safeguards, see [PGliteNotificationBatcher](PGliteNotificationBatcher.md))
- safe disconnect (`syncToFs` first, then `close`, to avoid callbacks throwing after IDBFS closes)
- LiveQuery support (depends on the `live` extension injected at init)

Subscribe to change events via `addEventListener(PGliteChangeType.INSERT, fn)`;
types are inferred from [PGliteClientEvents](../interfaces/PGliteClientEvents.md).

## Extends

- [`EventDispatcher`](../../utils/classes/EventDispatcher.md)&lt;[`PGliteClientEvents`](../interfaces/PGliteClientEvents.md)&gt;

## Implements

- [`IPGliteClient`](../interfaces/IPGliteClient.md)

## Constructors

### Constructor

```ts
new PGliteClient(serverExtensions?): PGliteClient;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:423](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L423)

#### Parameters

| Parameter           | Type                                                                                      | Default value                 | Description                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `serverExtensions?` | [`PGliteServerExtensionRequirements`](../interfaces/PGliteServerExtensionRequirements.md) | `NO_PGLITE_SERVER_EXTENSIONS` | Server extensions the adapter loads based on entity metadata (`btree_gist` required by range exclusions); loads no extensions by default |

#### Returns

`PGliteClient`

#### Overrides

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`constructor`](../../utils/classes/EventDispatcher.md#constructor)

## Accessors

### pendingNotificationCount \{#pendingnotificationcount\}

#### Get Signature

```ts
get pendingNotificationCount(): number;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:415](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L415)

Number of NOTIFY row events not yet dispatched.

##### Returns

`number`

Number of NOTIFY row events not yet dispatched.

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`pendingNotificationCount`](../interfaces/IPGliteClient.md#pendingnotificationcount)

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(type, listener): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:32

Registers a listener. Registering the same `listener` repeatedly keeps only one entry (set semantics).

#### Type Parameters

| Type Parameter                                                                                                |
| ------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ keyof [`PGliteClientEvents`](../interfaces/PGliteClientEvents.md) |

#### Parameters

| Parameter  | Type                                                                                                                                   | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                                                                    | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`PGliteClientEvents`](../interfaces/PGliteClientEvents.md)\[`T`\]&gt; | Listener    |

#### Returns

`void`

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`addEventListener`](../../utils/classes/EventDispatcher.md#addeventlistener)

---

### describeQuery() \{#describequery\}

```ts
describeQuery(query, options?): Promise<DescribeQueryResult>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:463](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L463)

Describes a query

#### Parameters

| Parameter  | Type           | Description           |
| ---------- | -------------- | --------------------- |
| `query`    | `string`       | The query to describe |
| `options?` | `QueryOptions` | -                     |

#### Returns

`Promise`&lt;`DescribeQueryResult`&gt;

Description of the query result type

#### Remarks

Optional: `DescribeQueryResult` carries parser functions that cannot survive structured clone, so the US-208 desktop proxy client cannot provide it. The adapter itself never calls it anywhere; declaring it required would only turn "cannot implement locally" into "must fake one".

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`describeQuery`](../interfaces/IPGliteClient.md#describequery)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:560](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L560)

Safely disconnects the PGlite connection: cancels subscriptions, clears pending events, `syncToFs` then close.

Under `relaxedDurability` + IDBFS backend, `syncToFs` must run first to write the cursor back, otherwise residual Emscripten callbacks throw `InvalidStateError` after close. When the durability flush fails, all resources are still released, then `DURABILITY_LOST` is thrown.

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`disconnect`](../interfaces/IPGliteClient.md#disconnect)

---

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:60

Dispatches an event synchronously.

Iterates over a snapshot rather than the live set: a listener calling `addEventListener` during processing does not feed the current iteration (otherwise a single synchronous dispatch could be extended indefinitely by third-party listeners, UTL-011).

#### Type Parameters

| Type Parameter                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ keyof [`PGliteClientEvents`](../interfaces/PGliteClientEvents.md) |

#### Parameters

| Parameter | Type                                                               | Description |
| --------- | ------------------------------------------------------------------ | ----------- |
| `type`    | `T`                                                                | Event name  |
| `data`    | [`PGliteClientEvents`](../interfaces/PGliteClientEvents.md)\[`T`\] | Event data  |

#### Returns

`void`

#### Throws

Any exception thrown by a listener bubbles up unchanged; subsequent listeners are not executed

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`dispatchEvent`](../../utils/classes/EventDispatcher.md#dispatchevent)

---

### exec() \{#exec\}

```ts
exec(query, options?): Promise<Results[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:455](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L455)

Executes an SQL query, which may contain multiple statements
Uses PostgreSQL's "simple query" protocol message

#### Parameters

| Parameter  | Type           | Description          |
| ---------- | -------------- | -------------------- |
| `query`    | `string`       | The query to execute |
| `options?` | `QueryOptions` | -                    |

#### Returns

`Promise`&lt;`Results`[]&gt;

The query results

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`exec`](../interfaces/IPGliteClient.md#exec)

---

### flushPendingNotifications() \{#flushpendingnotifications\}

```ts
flushPendingNotifications(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:542](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L542)

Flushes unsent NOTIFY events immediately, bypassing the 16ms debounce.

Used for test assertions of "events have been dispatched", or on critical paths (after a transaction commit) where changes must be perceived immediately.

#### Returns

`Promise`&lt;`boolean`&gt;

Whether pending events existed at call time

---

### forceClose() \{#forceclose\}

```ts
forceClose(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:568](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L568)

Skips the durability flush, cancels subscriptions and closes the runtime directly. The caller must explicitly accept that not-yet-persisted data may be lost.

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`forceClose`](../interfaces/IPGliteClient.md#forceclose)

---

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: packages/utils/dist/tools/event.d.ts:40

Checks whether a listener is registered. No set is created for unknown event names.

#### Type Parameters

| Type Parameter                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ keyof [`PGliteClientEvents`](../interfaces/PGliteClientEvents.md) |

#### Parameters

| Parameter  | Type                                                                                                                                   | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                                                                    | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`PGliteClientEvents`](../interfaces/PGliteClientEvents.md)\[`T`\]&gt; | Listener    |

#### Returns

`boolean`

Whether it is registered

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`hasEventListener`](../../utils/classes/EventDispatcher.md#haseventlistener)

---

### hasStoragePeer() \{#hasstoragepeer\}

```ts
hasStoragePeer(): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:476](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L476)

Determines whether another live client currently holds the same persistent storage.

#### Returns

`boolean`

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`hasStoragePeer`](../interfaces/IPGliteClient.md#hasstoragepeer)

---

### init() \{#init\}

```ts
init(dbName, options): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:437](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L437)

Initializes the PGlite runtime and subscribes to system-table NOTIFY channels.

Must be called before any query/exec. Repeated calls fully close the old runtime first; concurrent calls share one initialization task.

#### Parameters

| Parameter | Type                                                          | Description                                                       |
| --------- | ------------------------------------------------------------- | ----------------------------------------------------------------- |
| `dbName`  | `string`                                                      | Database name (used for IndexedDB persistence and Worker naming)  |
| `options` | [`PGliteClientOptions`](../interfaces/PGliteClientOptions.md) | PGlite options; `store: 'memory'` for tests, other values persist |

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`init`](../interfaces/IPGliteClient.md#init)

---

### liveQuery() \{#livequery\}

```ts
liveQuery<T>(
   query,
   params?,
   callback?
): Promise<LiveQuery<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:527](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L527)

Creates a live query via the @electric-sql/pglite/live plugin. Depends on the `live` extension loaded at init().

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter   | Type                  |
| ----------- | --------------------- |
| `query`     | `string`              |
| `params?`   | `unknown`[] \| `null` |
| `callback?` | (`results`) => `void` |

#### Returns

`Promise`&lt;`LiveQuery`&lt;`T`&gt;&gt;

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`liveQuery`](../interfaces/IPGliteClient.md#livequery)

---

### query() \{#query\}

```ts
query<T>(
   query,
   params?,
   options?
): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:459](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L459)

Executes a single SQL statement
Uses PostgreSQL's "extended query" protocol message

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-4"></a> `T` |

#### Parameters

| Parameter  | Type           | Description                      |
| ---------- | -------------- | -------------------------------- |
| `query`    | `string`       | The query statement to execute   |
| `params?`  | `unknown`[]    | Optional parameters of the query |
| `options?` | `QueryOptions` | -                                |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;

The query results

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`query`](../interfaces/IPGliteClient.md#query)

---

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:62

Clears all listeners under every event name.

#### Returns

`void`

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`removeAllEventListeners`](../../utils/classes/EventDispatcher.md#removealleventlisteners)

---

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:49

Removes a listener. Unknown event names and unregistered listeners are no-ops, and no empty set is created.

If removed during `dispatchEvent`, the removed listener **still** receives the current event (snapshot semantics).

#### Type Parameters

| Type Parameter                                                                                                  |
| --------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-5"></a> `T` _extends_ keyof [`PGliteClientEvents`](../interfaces/PGliteClientEvents.md) |

#### Parameters

| Parameter  | Type                                                                                                                                   | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                                                                    | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`PGliteClientEvents`](../interfaces/PGliteClientEvents.md)\[`T`\]&gt; | Listener    |

#### Returns

`void`

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`removeEventListener`](../../utils/classes/EventDispatcher.md#removeeventlistener)

---

### runExclusive() \{#runexclusive\}

```ts
runExclusive<T>(fn): Promise<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:471](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L471)

Runs a function exclusively; no other transaction or query is allowed while the function runs
This is especially useful with the execProtocol methods, since they are not blocked by, and do not block, the locks used by transactions and queries

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-6"></a> `T` |

#### Parameters

| Parameter | Type                       | Description         |
| --------- | -------------------------- | ------------------- |
| `fn`      | () => `Promise`&lt;`T`&gt; | The function to run |

#### Returns

`Promise`&lt;`T`&gt;

The function's result

#### Remarks

Optional, for the same reason as [IPGliteClient.describeQuery](../interfaces/IPGliteClient.md#describequery) but harder: `fn` is the caller's closure and cannot cross processes; to truly proxy it, the renderer would have to hold the main process's only connection for the whole duration of `fn`, and if the renderer crashes that lock would never be released.

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`runExclusive`](../interfaces/IPGliteClient.md#runexclusive)

---

### snapshotDataDir() \{#snapshotdatadir\}

```ts
snapshotDataDir<T>(fn): Promise<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:505](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L505)

Takes the runtime exclusively, performs a `CHECKPOINT`, then hands the traversal of the Emscripten data directory to `fn`.

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-7"></a> `T` |

#### Parameters

| Parameter | Type                              | Description                            |
| --------- | --------------------------------- | -------------------------------------- |
| `fn`      | (`items`) => `Promise`&lt;`T`&gt; | Callback that reads the data directory |

#### Returns

`Promise`&lt;`T`&gt;

The result of `fn`

#### Remarks

Holds both PGlite's query lock and transaction lock: while `fn` runs no statement can change the data directory, so what it sees is the consistent snapshot after the checkpoint. The slower `fn` is, the longer the database stays blocked.

These two locks only govern this runtime. On IndexedDB storage each connection has its own in-memory filesystem; commits from other connections (another instance in the same page, other tabs or Workers) sync into IndexedDB but never appear in this runtime's view, so when the storage has other holders — or had any since this connection opened, even if already closed — the snapshot does not represent the database's committed state and can only be refused; reconnect before backing up. The SQLite backends do not have this problem: all connections share one database file.

#### Throws

RxDBBackupError `unsupported_combination` when the runtime is not on the current thread (OPFS-AHP Worker), or the current PGlite version lacks the internal parts the snapshot depends on;
`target_busy` when the same IndexedDB storage has other connections, or has had any since this connection opened;
`unsupported_combination` when the IndexedDB storage's environment lacks `navigator.locks.query()`

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`snapshotDataDir`](../interfaces/IPGliteClient.md#snapshotdatadir)

---

### sql() \{#sql\}

```ts
sql<T>(sqlStrings, ...params): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:451](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L451)

Executes a single SQL statement, similar to query, but using a template statement in which template values are treated as parameters

Uses PostgreSQL's "extended query" protocol message

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-8"></a> `T` |

#### Parameters

| Parameter    | Type                   |
| ------------ | ---------------------- |
| `sqlStrings` | `TemplateStringsArray` |
| ...`params`  | `unknown`[]            |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;

The query results

#### Example

```ts
const results = await db.sql`SELECT * FROM ${identifier`foo`} WHERE id = ${id}`;
```

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`sql`](../interfaces/IPGliteClient.md#sql)

---

### transaction() \{#transaction\}

```ts
transaction<T>(callback): Promise<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:467](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L467)

Executes a transaction

#### Type Parameters

| Type Parameter                      |
| ----------------------------------- |
| <a id="type-parameter-t-9"></a> `T` |

#### Parameters

| Parameter  | Type                           | Description                                        |
| ---------- | ------------------------------ | -------------------------------------------------- |
| `callback` | (`tx`) => `Promise`&lt;`T`&gt; | Callback function receiving the transaction object |

#### Returns

`Promise`&lt;`T`&gt;

The transaction's result

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`transaction`](../interfaces/IPGliteClient.md#transaction)

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:577](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L577)

Returns the underlying PostgreSQL version string (runs `SELECT version()`).

Mainly for diagnostics and logging; do not call on hot paths.

#### Returns

`Promise`&lt;`string`&gt;

#### Implementation of

[`IPGliteClient`](../interfaces/IPGliteClient.md).[`version`](../interfaces/IPGliteClient.md#version)
