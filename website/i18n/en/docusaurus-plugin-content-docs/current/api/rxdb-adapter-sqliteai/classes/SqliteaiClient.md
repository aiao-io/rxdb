# SqliteaiClient

Defined in: [packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts#L13)

The oo1 client implementation for SqliteAI.

Only declares `clientName` and `loadModule`; the rest of the lifecycle (init /
disconnect / event batching / queue / custom function registration / OPFS
fallback) is entirely provided by `Oo1ClientBase`.

## Extends

- [`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md)&lt;[`SqliteaiLoadOptions`](../type-aliases/SqliteaiLoadOptions.md)&gt;

## Constructors

### Constructor

```ts
new SqliteaiClient(): SqliteaiClient;
```

#### Returns

`SqliteaiClient`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`constructor`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#constructor)

## Properties

### db \{#db\}

```ts
protected db: Oo1Database;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:69

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`db`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#db)

***

### sqlite3 \{#sqlite3\}

```ts
protected sqlite3: Oo1Static;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:68

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`sqlite3`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#sqlite3)

## Accessors

### clientName \{#clientname\}

#### Get Signature

```ts
get protected clientName(): string;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts#L14)

The short identifier used in error messages (e.g. `'sqliteai'`).

##### Returns

`string`

#### Overrides

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`clientName`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#clientname)

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, handler): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:76

External override, keeping the signature consistent with [SqliteClientLike](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).
Delegates to the generic implementation in [EventDispatcher](../../utils/classes/EventDispatcher.md).

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `type` | [`SQLiteChangeType`](../../rxdb-adapter-sqlite-core/enumerations/SQLiteChangeType.md) |
| `handler` | (`event`) => `void` |

#### Returns

`void`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`addEventListener`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#addeventlistener)

***

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:86

Gets the strongest lock the backend supports for system schema upgrades.

#### Returns

`string`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`beginSystemMigrationTransactionSql`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#beginsystemmigrationtransactionsql)

***

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:79

The SQL used when starting a transaction, `'BEGIN;'` by default.

#### Returns

`string`

#### Remarks

Backends can override it to insert their own lock-strategy prelude — for
example, when wa-sqlite's `IDBBatchAtomicVFS`/`OPFSAdaptiveVFS` uses the
`shared+hint` lock strategy, it must send `PRAGMA write_hint;` during the
shared-lock phase to avoid `SQLITE_BUSY` when upgrading SHARED→RESERVED (see
wa-sqlite's `WebLocksMixin`).

A Comlink remote client returns a Promise even when its implementation is
synchronous; registrants must await.

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`beginTransactionSql`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#begintransactionsql)

***

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:92

Opens a temporary `:memory:` connection on the same module and describes what the engine's freshly created empty database looks like.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBlankDatabase.md)&gt;

The object list and description of the empty database

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`describeBlankDatabase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#describeblankdatabase)

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:93

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`disconnect`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#disconnect)

***

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:60

Dispatches an event synchronously.

Iterates over a snapshot rather than the live set: a listener calling
`addEventListener` while handling will not feed itself into this round of
iteration (otherwise a single synchronous dispatch could be extended
indefinitely by third-party listeners, UTL-011).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* keyof [`Oo1ClientEvents`](../../rxdb-adapter-sqlite-core/interfaces/Oo1ClientEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The event name |
| `data` | [`Oo1ClientEvents`](../../rxdb-adapter-sqlite-core/interfaces/Oo1ClientEvents.md)\[`T`\] | The event data |

#### Returns

`void`

#### Throws

Any exception thrown by a listener, bubbling up unchanged; subsequent listeners no longer run

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`dispatchEvent`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#dispatchevent)

***

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:102

Executes SQL.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | The SQL statement |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] | The bound parameters |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

The execution result

#### Throws

When the client is disconnected, or has not finished `init`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`execute`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#execute)

***

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: packages/utils/dist/tools/event.d.ts:40

Queries whether a listener is registered. Does not create a collection for unknown event names.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* keyof [`Oo1ClientEvents`](../../rxdb-adapter-sqlite-core/interfaces/Oo1ClientEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The event name |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`Oo1ClientEvents`](../../rxdb-adapter-sqlite-core/interfaces/Oo1ClientEvents.md)\[`T`\]&gt; | The listener |

#### Returns

`boolean`

Whether it is registered

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`hasEventListener`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#haseventlistener)

***

### init() \{#init\}

```ts
init(dbName, options?): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:77

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dbName` | `string` |
| `options?` | [`SqliteaiLoadOptions`](../type-aliases/SqliteaiLoadOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`init`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#init)

***

### loadModule() \{#loadmodule\}

```ts
protected loadModule(options?): Promise<Oo1Static>;
```

Defined in: [packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqliteai/src/SqliteaiClient.ts#L18)

Loads and initializes the underlying sqlite-wasm module.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options?` | [`SqliteaiLoadOptions`](../type-aliases/SqliteaiLoadOptions.md) |

#### Returns

`Promise`&lt;[`Oo1Static`](../../rxdb-adapter-sqlite-core/interfaces/Oo1Static.md)&gt;

#### Overrides

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`loadModule`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#loadmodule)

***

### normalizeRowId() \{#normalizerowid\}

```ts
protected normalizeRowId(rowId): bigint;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:111

Normalizes the rowId output by `sqlite3_update_hook` into a bigint.

`@sqlite.org/sqlite-wasm` may return a plain `number` when the rowId is small;
the official client overrides this method to force `bigint`. Subclasses whose
runtime always outputs `bigint` can keep the default.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rowId` | `number` \| `bigint` |

#### Returns

`bigint`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`normalizeRowId`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#normalizerowid)

***

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:62

Removes all listeners under every event name.

#### Returns

`void`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`removeAllEventListeners`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#removealleventlisteners)

***

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:49

Removes a listener. Unknown event names or unregistered listeners are no-ops, and no empty collection is created.

When removed during `dispatchEvent`, the removed listener **still** receives the
current event (snapshot semantics).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* keyof [`Oo1ClientEvents`](../../rxdb-adapter-sqlite-core/interfaces/Oo1ClientEvents.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The event name |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`Oo1ClientEvents`](../../rxdb-adapter-sqlite-core/interfaces/Oo1ClientEvents.md)\[`T`\]&gt; | The listener |

#### Returns

`void`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`removeEventListener`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#removeeventlistener)

***

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): void;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:85

Pauses / resumes change event collection.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `muted` | `boolean` | When `true`, the update hook ignores writes outright — neither batching nor dispatching |

#### Returns

`void`

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`setChangeEventsMuted`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#setchangeeventsmuted)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/Oo1ClientBase.d.ts:78

#### Returns

`Promise`&lt;`string`&gt;

#### Inherited from

[`Oo1ClientBase`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md).[`version`](../../rxdb-adapter-sqlite-core/classes/Oo1ClientBase.md#version)
