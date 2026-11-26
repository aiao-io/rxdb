# SqliteClient

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L162)

Typesafe synchronous event dispatcher.

Dispatch semantics are aligned with the DOM `EventTarget`:

- `dispatchEvent` takes a **snapshot** of the listener set before iterating. Listeners added during dispatch
  do not receive the current event and must wait for the next dispatch; listeners removed during dispatch **are still** invoked this time.
- Exceptions thrown by listeners are not swallowed: they bubble up to the caller as-is, and subsequent listeners are not executed.
- Only `addEventListener` creates a set for an event name; the event name is reclaimed immediately once the set is emptied,
  preventing the Map from growing without bound when event names are unbounded.

## Extends

- [`EventDispatcher`](../../utils/classes/EventDispatcher.md)&lt;`SqliteClientEvents`&gt;

## Constructors

### Constructor

```ts
new SqliteClient(): SqliteClient;
```

#### Returns

`SqliteClient`

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`constructor`](../../utils/classes/EventDispatcher.md#constructor)

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(
   type,
   listener,
   owner?
): void;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:240](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L240)

Register a change listener.

#### Type Parameters

| Type Parameter                                                         |
| ---------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ keyof `SqliteClientEvents` |

#### Parameters

| Parameter  | Type                                                                                            | Description                                                                                               |
| ---------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `type`     | `T`                                                                                             | Change type                                                                                               |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`SqliteClientEvents`\[`T`\]&gt; | Listener                                                                                                  |
| `owner?`   | `string`                                                                                        | The owner registering it; when given, it is removed together on return ([SqliteClient.release](#release)) |

#### Returns

`void`

#### Overrides

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`addEventListener`](../../utils/classes/EventDispatcher.md#addeventlistener)

---

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L332)

#### Returns

`string`

---

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L328)

#### Returns

`string`

---

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:316](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L316)

Open a temporary `:memory:` connection on the same module and describe what a freshly created empty database looks like on this engine.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBlankDatabase.md)&gt;

The object list and description of the empty database

#### Throws

Error client not initialized

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:345](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L345)

Disconnect the database

Idempotent: repeated calls close the connection only once; a safe no-op when not initialized.
Calling while init is in progress first waits for it to finish, to avoid missing a just-opened connection.

Drains the execution queue and then synchronously dispatches the final batch of committed changes.
Listener exceptions are logged, but do not block the connection from closing.

#### Returns

`Promise`&lt;`void`&gt;

---

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:60

Synchronously dispatch an event.

Iterates a snapshot rather than the live set: a listener calling `addEventListener` during handling does not feed
this round of iteration (otherwise a single synchronous dispatch could be extended indefinitely by third-party listeners, UTL-011).

#### Type Parameters

| Type Parameter                                                           |
| ------------------------------------------------------------------------ |
| <a id="type-parameter-t-1"></a> `T` _extends_ keyof `SqliteClientEvents` |

#### Parameters

| Parameter | Type                        | Description |
| --------- | --------------------------- | ----------- |
| `type`    | `T`                         | Event name  |
| `data`    | `SqliteClientEvents`\[`T`\] | Event data  |

#### Returns

`void`

#### Throws

Any exception thrown by a listener, bubbled up as-is; subsequent listeners are not executed

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`dispatchEvent`](../../utils/classes/EventDispatcher.md#dispatchevent)

---

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:370](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L370)

Execute an SQL statement

All queries are automatically queued, guaranteeing serial execution to avoid concurrent conflicts

#### Parameters

| Parameter   | Type                                                                                            |
| ----------- | ----------------------------------------------------------------------------------------------- |
| `sql`       | `string`                                                                                        |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

#### Throws

client not initialized or already disconnected

---

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: packages/utils/dist/tools/event.d.ts:40

Check whether a listener is registered. Does not create a set for unknown event names.

#### Type Parameters

| Type Parameter                                                           |
| ------------------------------------------------------------------------ |
| <a id="type-parameter-t-2"></a> `T` _extends_ keyof `SqliteClientEvents` |

#### Parameters

| Parameter  | Type                                                                                            | Description |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                             | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`SqliteClientEvents`\[`T`\]&gt; | Listener    |

#### Returns

`boolean`

Whether it is registered

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`hasEventListener`](../../utils/classes/EventDispatcher.md#haseventlistener)

---

### init() \{#init\}

```ts
init(
   dbName,
   options,
   owner?
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L195)

Initialize the database

#### Parameters

| Parameter | Type                | Description                                                                                                                 |
| --------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `dbName`  | `string`            | Database name (without the .sqlite extension)                                                                               |
| `options` | `LoadModuleOptions` | Load options                                                                                                                |
| `owner?`  | `string`            | Owner key: each tab's adapter on the SharedWorker provides one, and it is used on return ([SqliteClient.release](#release)) |

#### Returns

`Promise`&lt;`void`&gt;

#### Throws

a client with disconnect in progress cannot be initialized

#### Throws

[RxDBAdapterSqliteError](RxDBAdapterSqliteError.md) the client has opened (or is opening) a database with a different identity: if the database name, VFS, read-only, resource, or lock configuration
differs in any way it is rejected and the owner is not registered; the database can only be changed after disconnecting

---

### release() \{#release\}

```ts
release(owner): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:261](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L261)

One owner exits: removes the listeners it registered with its key and returns its share of the hold; disconnects when the last share is returned, and can `init` again afterwards (US-314 B2.3b).

#### Parameters

| Parameter | Type     | Description                                                                                       |
| --------- | -------- | ------------------------------------------------------------------------------------------------- |
| `owner`   | `string` | The owner key given at `init`; one that never held or already returned only has listeners removed |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Inside the SharedWorker there is only this one client, and every tab connects to it: when one tab disconnects it only returns its own share and does not close a connection others are still using.
Listeners coming in through Comlink are proxies newly created inside the worker; they are released together once removed, and the port on the tab side that exposed the listener is closed along with them.

---

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:62

Clear all listeners under every event name.

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

Remove a listener. Unknown event names or unregistered listeners are no-ops, and no empty set is created.

If removed during `dispatchEvent`, the removed one **still** receives the current event (snapshot semantics).

#### Type Parameters

| Type Parameter                                                           |
| ------------------------------------------------------------------------ |
| <a id="type-parameter-t-3"></a> `T` _extends_ keyof `SqliteClientEvents` |

#### Parameters

| Parameter  | Type                                                                                            | Description |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------- |
| `type`     | `T`                                                                                             | Event name  |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`SqliteClientEvents`\[`T`\]&gt; | Listener    |

#### Returns

`void`

#### Inherited from

[`EventDispatcher`](../../utils/classes/EventDispatcher.md).[`removeEventListener`](../../utils/classes/EventDispatcher.md#removeeventlistener)

---

### rollbackOrphanTransaction() \{#rollbackorphantransaction\}

```ts
rollbackOrphanTransaction(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L281)

Roll back an unfinished transaction on the connection if there is one (US-314 B2.3b).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when it was rolled back; `false` when the connection was already in autocommit state

#### Throws

client not initialized or already disconnected

#### Remarks

Judged after the statements already delivered to this client: statements sent by the dead tab run to completion first, then check whether the transaction it left behind is still open.
The caller must hold the cross-tab lock, otherwise the rollback might hit a transaction another tab is currently running.

---

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): void;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:306](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L306)

Pause / resume change-event collection.

#### Parameters

| Parameter | Type      | Description                                                                        |
| --------- | --------- | ---------------------------------------------------------------------------------- |
| `muted`   | `boolean` | when `true`, the update hook ignores writes outright — not batched, not dispatched |

#### Returns

`void`

#### Remarks

Muting is client-wide, not per owner; the SharedWorker transport does not support resuming, so a shared client is never muted.

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts:293](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-wasm/src/SqliteClient.ts#L293)

Get the SQLite version number

#### Returns

`Promise`&lt;`string`&gt;
