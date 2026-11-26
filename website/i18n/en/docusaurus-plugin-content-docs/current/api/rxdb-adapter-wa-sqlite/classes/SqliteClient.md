# SqliteClient

Defined in: [packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts#L141)

Browser wa-sqlite client.

## Extends

- `WaSqliteClientBase`&lt;[`LoadModuleOptions`](../type-aliases/LoadModuleOptions.md)&gt;

## Constructors

### Constructor

```ts
new SqliteClient(): WaSqliteClient;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/SqliteClient.ts#L142)

#### Returns

`WaSqliteClient`

#### Overrides

`WaSqliteClientBase<LoadModuleOptions>.constructor`

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(
   type, 
   listener, 
   owner?
): void;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:157](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L157)

Registers a change listener.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | Change type |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`WaSqliteClientEvents`\[`T`\]&gt; | Listener |
| `owner?` | `string` | The owner registering it; when given, it is removed together on release ([WaSqliteClientBase.release](#release)) |

#### Returns

`void`

#### Inherited from

`WaSqliteClientBase.addEventListener`

***

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L236)

Returns the strongest lock statement needed by system migration transactions.

#### Returns

`string`

#### Inherited from

`WaSqliteClientBase.beginSystemMigrationTransactionSql`

***

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L227)

Returns the transaction-begin statement required by the current VFS.

#### Returns

`string`

#### Inherited from

`WaSqliteClientBase.beginTransactionSql`

***

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:250](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L250)

Opens a temporary `:memory:` connection on the same module and describes what a freshly created empty database looks like on this engine.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBlankDatabase.md)&gt;

Object list and description of the empty database

#### Throws

Error when the client is not ready

#### Inherited from

`WaSqliteClientBase.describeBlankDatabase`

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:263](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L263)

Waits for existing tasks to finish and closes the database and VFS; regardless of owners, once closed it cannot be used again.

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

`WaSqliteClientBase.disconnect`

***

### dispatchEvent() \{#dispatchevent\}

```ts
dispatchEvent<T>(type, data): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:60

Dispatches an event synchronously.

Iterates over a snapshot rather than the live set: a listener calling `addEventListener` during handling does not feed
this round of iteration (otherwise a single synchronous dispatch could be extended indefinitely by third-party listeners, UTL-011).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | Event name |
| `data` | `WaSqliteClientEvents`\[`T`\] | Event data |

#### Returns

`void`

#### Throws

Any exception thrown by a listener, bubbling up unchanged; subsequent listeners do not run

#### Inherited from

`WaSqliteClientBase.dispatchEvent`

***

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:281](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L281)

Executes SQL serially.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sql` | `string` |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

#### Inherited from

`WaSqliteClientBase.execute`

***

### hasEventListener() \{#haseventlistener\}

```ts
hasEventListener<T>(type, listener): boolean;
```

Defined in: packages/utils/dist/tools/event.d.ts:40

Queries whether a listener is registered. No set is created for unknown event names.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | Event name |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`WaSqliteClientEvents`\[`T`\]&gt; | Listener |

#### Returns

`boolean`

Whether it is registered

#### Inherited from

`WaSqliteClientBase.hasEventListener`

***

### init() \{#init\}

```ts
init(
   dbName, 
   options, 
   owner?
): Promise<void>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L120)

Initializes the database. Calling again with the same identity is allowed; conflicting configurations are explicitly rejected.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | Database name |
| `options` | `TOptions` | Platform loading configuration |
| `owner?` | `string` | Owner key: each tab's adapter on a SharedWorker provides one, used when returning ownership ([WaSqliteClientBase.release](#release)) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

`WaSqliteClientBase.init`

***

### release() \{#release\}

```ts
release(owner): Promise<void>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:179](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L179)

One owner exits: removes the listeners it registered with its key and returns its share of ownership; the database closes when the last share is returned, and can be `init`ed again afterwards (US-314 B2.3b).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `owner` | `string` | The owner key given at `init`; one that never held or already returned only has its listeners removed |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

There is only this one client in the SharedWorker, and every tab connects to it: when one tab disconnects it only returns its own share, without closing a connection others are still using.
Listeners arriving via Comlink are proxies newly created inside the worker; removing them also releases them, and the port exposing the listener on the tab side closes accordingly.
[WaSqliteClientBase.disconnect](#disconnect) still closes everything regardless of owners, and cannot be used again afterwards.

#### Inherited from

`WaSqliteClientBase.release`

***

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:62

Removes every listener under all event names.

#### Returns

`void`

#### Inherited from

`WaSqliteClientBase.removeAllEventListeners`

***

### removeEventListener() \{#removeeventlistener\}

```ts
removeEventListener<T>(type, listener): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:49

Removes a listener. Unknown event names or unregistered listeners are no-ops, and no empty set is created.

If removed during `dispatchEvent`, the removed listener **still** receives the current event (snapshot semantics).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | Event name |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`WaSqliteClientEvents`\[`T`\]&gt; | Listener |

#### Returns

`void`

#### Inherited from

`WaSqliteClientBase.removeEventListener`

***

### rollbackOrphanTransaction() \{#rollbackorphantransaction\}

```ts
rollbackOrphanTransaction(): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:199](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L199)

Rolls back an unfinished transaction on the connection, if any (US-314 B2.3b).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when rolled back; `false` when the connection was already in autocommit state

#### Throws

Error when the client is not ready

#### Remarks

Judged after the statements already delivered to this client: statements sent by the dead tab run to completion first, then it checks whether the transaction it left behind is still open.
The caller must hold the cross-tab lock, otherwise the rollback could hit a transaction another tab is currently running.

#### Inherited from

`WaSqliteClientBase.rollbackOrphanTransaction`

***

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): void;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L222)

Pauses / resumes change-event collection.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `muted` | `boolean` | When `true`, the update hook ignores writes outright — neither batched nor dispatched |

#### Returns

`void`

#### Remarks

Muting is client-wide, not per owner; the SharedWorker transport does not support resuming, so a shared client is never muted.

#### Inherited from

`WaSqliteClientBase.setChangeEventsMuted`

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts:209](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-wa-sqlite/src/WaSqliteClientBase.ts#L209)

Gets the SQLite version number.

#### Returns

`Promise`&lt;`string`&gt;

#### Inherited from

`WaSqliteClientBase.version`
