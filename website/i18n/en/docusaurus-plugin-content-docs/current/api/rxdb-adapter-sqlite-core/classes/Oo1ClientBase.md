---
sidebar_label: 'Oo1ClientBase⟨TLoadOptions⟩'
---

# Oo1ClientBase`<TLoadOptions>`

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L86)

SQLite client base class wrapping `oo1.DB`-style runtimes (`@sqlite.org/sqlite-wasm`, `@sqliteai/sqlite-wasm`, etc.).

## Why the name Oo1

`oo1` is the upstream official SQLite WASM's **Object Oriented API v1** naming
(`sqlite3.oo1.DB` / `OpfsDb`), not an abbreviation invented by this repository.
All adapters on this layer (sqlite / sqliteai) inherit this base class;
wa-sqlite goes through the C API and does **not** reuse it here.

Subclasses only need to implement [loadModule](#loadmodule) and [clientName](#clientname);
everything else (queue management, init/disconnect lifecycle, change event batching,
custom function registration, OPFS fallback) lives here.

## See

[Oo1Static](../interfaces/Oo1Static.md) — minimal contract of the `oo1` runtime

## Extends

- [`EventDispatcher`](../../utils/classes/EventDispatcher.md)&lt;[`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md)&gt;

## Extended by

- [`SqliteClient`](../../rxdb-adapter-sqlite/classes/SqliteClient.md)
- [`SqliteaiClient`](../../rxdb-adapter-sqliteai/classes/SqliteaiClient.md)

## Type Parameters

| Type Parameter                                                                                                                    | Default type                                                    |
| --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| <a id="type-parameter-tloadoptions"></a> `TLoadOptions` _extends_ [`Oo1ClientLoadOptions`](../interfaces/Oo1ClientLoadOptions.md) | [`Oo1ClientLoadOptions`](../interfaces/Oo1ClientLoadOptions.md) |

## Implements

- [`SqliteClientLike`](../interfaces/SqliteClientLike.md)

## Constructors

### Constructor

```ts
new Oo1ClientBase<TLoadOptions>(): Oo1ClientBase<TLoadOptions>;
```

#### Returns

`Oo1ClientBase`&lt;`TLoadOptions`&gt;

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`constructor`](../../utils/classes/EventDispatcher.md#constructor)

## Properties

### db \{#db\}

```ts
protected db: Oo1Database;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L100)

---

### sqlite3 \{#sqlite3\}

```ts
protected sqlite3: Oo1Static;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L99)

## Accessors

### clientName \{#clientname\}

#### Get Signature

```ts
get abstract protected clientName(): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L103)

Short identifier used in error messages (e.g. `'sqliteai'`).

##### Returns

`string`

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, handler): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L109)

Public override, keeping the signature consistent with [SqliteClientLike](../interfaces/SqliteClientLike.md).
Delegates to the generic implementation in [EventDispatcher](../../utils/classes/EventDispatcher.md).

#### Parameters

| Parameter | Type                                                      |
| --------- | --------------------------------------------------------- |
| `type`    | [`SQLiteChangeType`](../enumerations/SQLiteChangeType.md) |
| `handler` | (`event`) => `void`                                       |

#### Returns

`void`

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`addEventListener`](../interfaces/SqliteClientLike.md#addeventlistener)

#### Overrides

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`addEventListener`](../../utils/classes/EventDispatcher.md#addeventlistener)

---

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L160)

Gets the strongest lock the backend supports during system schema upgrades.

#### Returns

`string`

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`beginSystemMigrationTransactionSql`](../interfaces/SqliteClientLike.md#beginsystemmigrationtransactionsql)

---

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:147](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L147)

SQL used when opening a transaction, default `'BEGIN;'`.

#### Returns

`string`

#### Remarks

Backends may override to insert their own lock-strategy preamble — for example, when wa-sqlite's
`IDBBatchAtomicVFS`/`OPFSAdaptiveVFS` chooses the `shared+hint` lock strategy,
it needs to issue `PRAGMA write_hint;` first during the shared-lock phase to avoid
`SQLITE_BUSY` when upgrading SHARED→RESERVED (see wa-sqlite's `WebLocksMixin`).

A Comlink remote client returns a Promise even when its implementation is synchronous; registrants must await.

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`beginTransactionSql`](../interfaces/SqliteClientLike.md#begintransactionsql)

---

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L169)

Opens a temporary `:memory:` connection on the same module to describe what a freshly created empty database of this engine looks like.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../interfaces/SqliteBlankDatabase.md)&gt;

Object list and description of the empty database

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`describeBlankDatabase`](../interfaces/SqliteClientLike.md#describeblankdatabase)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:180](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L180)

#### Returns

`Promise`&lt;`void`&gt;

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`disconnect`](../interfaces/SqliteClientLike.md#disconnect)

---

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:60

Dispatches an event synchronously.

It iterates a snapshot rather than the live set: a listener calling `addEventListener` during handling does not feed
the current iteration (otherwise a single synchronous dispatch could be extended indefinitely by a third-party listener, UTL-011).

#### Type Parameters

| Type Parameter                                                                                          |
| ------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ keyof [`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md) |

#### Parameters

| Parameter | Type                                                         | Description |
| --------- | ------------------------------------------------------------ | ----------- |
| `type`    | `T`                                                          | Event name  |
| `data`    | [`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md)\[`T`\] | Event data  |

#### Returns

`void`

#### Throws

Any exception thrown by a listener, bubbling up unchanged; remaining listeners do not run

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`dispatchEvent`](../../utils/classes/EventDispatcher.md#dispatchevent)

---

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:228](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L228)

Executes SQL.

#### Parameters

| Parameter   | Type                                                                | Description     |
| ----------- | ------------------------------------------------------------------- | --------------- |
| `sql`       | `string`                                                            | SQL statement   |
| `bindings?` | [`SQLiteCompatibleType`](../type-aliases/SQLiteCompatibleType.md)[] | Bind parameters |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)&gt;

Execution result

#### Throws

The client is disconnected, or has not finished `init` yet

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`execute`](../interfaces/SqliteClientLike.md#execute)

---

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: packages/utils/dist/tools/event.d.ts:40

Queries whether a listener is registered. Does not create a collection for unknown event names.

#### Type Parameters

| Type Parameter                                                                                            |
| --------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ keyof [`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md) |

#### Parameters

| Parameter  | Type                                                                                                                             | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                                                              | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md)\[`T`\]&gt; | Listener    |

#### Returns

`boolean`

Whether it is registered

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`hasEventListener`](../../utils/classes/EventDispatcher.md#haseventlistener)

---

### init() \{#init\}

```ts
init(dbName, options?): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L113)

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `dbName`   | `string`       |
| `options?` | `TLoadOptions` |

#### Returns

`Promise`&lt;`void`&gt;

---

### loadModule() \{#loadmodule\}

```ts
abstract protected loadModule(options?): Promise<Oo1Static>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:241](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L241)

Loads and initializes the underlying sqlite-wasm module.

#### Parameters

| Parameter  | Type           |
| ---------- | -------------- |
| `options?` | `TLoadOptions` |

#### Returns

`Promise`&lt;[`Oo1Static`](../interfaces/Oo1Static.md)&gt;

---

### normalizeRowId() \{#normalizerowid\}

```ts
protected normalizeRowId(rowId): bigint;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L249)

Normalizes the rowId from `sqlite3_update_hook` to bigint.

`@sqlite.org/sqlite-wasm` may give a plain `number` when the rowId is small;
the official client overrides this method to force `bigint`; subclasses whose runtime always outputs `bigint` can keep the default.

#### Parameters

| Parameter | Type                 |
| --------- | -------------------- |
| `rowId`   | `number` \| `bigint` |

#### Returns

`bigint`

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

Removes a listener. Unknown event names or unregistered listeners are both no-ops, and no empty collection is created.

If removed during a `dispatchEvent`, the removed one **still** receives this event (snapshot semantics).

#### Type Parameters

| Type Parameter                                                                                            |
| --------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ keyof [`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md) |

#### Parameters

| Parameter  | Type                                                                                                                             | Description |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                                                              | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;[`Oo1ClientEvents`](../interfaces/Oo1ClientEvents.md)\[`T`\]&gt; | Listener    |

#### Returns

`void`

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`removeEventListener`](../../utils/classes/EventDispatcher.md#removeeventlistener)

---

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): void;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:156](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L156)

Pauses / resumes change event collection.

#### Parameters

| Parameter | Type      | Description                                                                           |
| --------- | --------- | ------------------------------------------------------------------------------------- |
| `muted`   | `boolean` | When `true` the update hook ignores writes directly, neither batching nor dispatching |

#### Returns

`void`

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`setChangeEventsMuted`](../interfaces/SqliteClientLike.md#setchangeeventsmuted)

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/Oo1ClientBase.ts#L142)

#### Returns

`Promise`&lt;`string`&gt;

#### Implementation of

[`SqliteClientLike`](../interfaces/SqliteClientLike.md).[`version`](../interfaces/SqliteClientLike.md#version)
