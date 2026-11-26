# WaSqliteMiniProgramClient

Defined in: [packages/rxdb-adapter-miniprogram/src/create-client.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/create-client.ts#L90)

Mini-program-specific wa-sqlite client (host injected via `wechat` or `host`).

## Extends

- `WaSqliteClientBase`&lt;[`WaSqliteMiniProgramAdapterOptions`](../type-aliases/WaSqliteMiniProgramAdapterOptions.md)&gt;

## Constructors

### Constructor

```ts
new WaSqliteMiniProgramClient(): WaSqliteMiniProgramClient;
```

Defined in: [packages/rxdb-adapter-miniprogram/src/create-client.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-miniprogram/src/create-client.ts#L91)

#### Returns

`WaSqliteMiniProgramClient`

#### Overrides

`WaSqliteClientBase<WaSqliteMiniProgramAdapterOptions>.constructor`

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener<T>(
   type, 
   listener, 
   owner?
): void;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:65

Registers a change listener.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The change type |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`WaSqliteClientEvents`\[`T`\]&gt; | The listener |
| `owner?` | `string` | The owner that registers it; when given, it is removed together on release ([WaSqliteClientBase.release](../../rxdb-adapter-wa-sqlite/classes/SqliteClient.md#release)) |

#### Returns

`void`

#### Inherited from

`WaSqliteClientBase.addEventListener`

***

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:102

Gets the strongest lock statement required by system migration transactions.

#### Returns

`string`

#### Inherited from

`WaSqliteClientBase.beginSystemMigrationTransactionSql`

***

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:100

Gets the transaction-begin statement required by the current VFS.

#### Returns

`string`

#### Inherited from

`WaSqliteClientBase.beginTransactionSql`

***

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:109

Opens a temporary `:memory:` connection on the same module and describes how the engine creates a brand-new empty database.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBlankDatabase.md)&gt;

The object list and description of the empty database

#### Throws

Error when the client is not ready

#### Inherited from

`WaSqliteClientBase.describeBlankDatabase`

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:111

Waits for existing tasks to finish and closes the database and the VFS; once closed it cannot be used again, regardless of owner.

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

Iterates over a snapshot rather than the live set: a listener calling `addEventListener` during processing does not feed
this round of iteration (otherwise a single synchronous dispatch could be extended indefinitely by third-party listeners, UTL-011).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The event name |
| `data` | `WaSqliteClientEvents`\[`T`\] | The event data |

#### Returns

`void`

#### Throws

Any exception thrown by a listener, bubbled up unchanged; subsequent listeners do not run

#### Inherited from

`WaSqliteClientBase.dispatchEvent`

***

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:113

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

Checks whether a listener is registered. Does not create a set for unknown event names.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The event name |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`WaSqliteClientEvents`\[`T`\]&gt; | The listener |

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

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:57

Initializes the database. Repeatable for the same identity; conflicting configs are explicitly rejected.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | The database name |
| `options` | [`WaSqliteMiniProgramAdapterOptions`](../type-aliases/WaSqliteMiniProgramAdapterOptions.md) | The platform load config |
| `owner?` | `string` | The owner key: on a SharedWorker each tab's adapter gives its own, and release uses it ([WaSqliteClientBase.release](../../rxdb-adapter-wa-sqlite/classes/SqliteClient.md#release)) |

#### Returns

`Promise`&lt;`void`&gt;

#### Inherited from

`WaSqliteClientBase.init`

***

### release() \{#release\}

```ts
release(owner): Promise<void>;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:76

One owner exits: removes the listeners it registered with its key, and hands back its share of the hold; when the last share is handed back the database closes, and after closing it can `init` again (US-314 B2.3b).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `owner` | `string` | The owner key given at `init`; one that never held or already handed back only has its listeners removed |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

In a SharedWorker there is only this one client, and every tab connects to it: one tab disconnecting only hands back its own share, without closing the connection others are still using.
Listeners coming in over Comlink are proxies newly created inside the worker; removing them releases them too, and the port exposing the listener on the tab side closes with it.
[WaSqliteClientBase.disconnect](../../rxdb-adapter-wa-sqlite/classes/SqliteClient.md#disconnect) still closes everything regardless of owner and cannot be used again.

#### Inherited from

`WaSqliteClientBase.release`

***

### removeAllEventListeners() \{#removealleventlisteners\}

```ts
removeAllEventListeners(): void;
```

Defined in: packages/utils/dist/tools/event.d.ts:62

Clears all listeners under every event name.

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

Removes a listener. An unknown event name or an unregistered listener are both no-ops, and do not create empty sets.

If removed during `dispatchEvent`, the removed listener **still receives** the current event (snapshot semantics).

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` *extends* keyof `WaSqliteClientEvents` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `T` | The event name |
| `listener` | [`EventListener`](../../utils/type-aliases/EventListener.md)&lt;`WaSqliteClientEvents`\[`T`\]&gt; | The listener |

#### Returns

`void`

#### Inherited from

`WaSqliteClientBase.removeEventListener`

***

### rollbackOrphanTransaction() \{#rollbackorphantransaction\}

```ts
rollbackOrphanTransaction(): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:87

Rolls back an unfinished transaction on the connection, if any (US-314 B2.3b).

#### Returns

`Promise`&lt;`boolean`&gt;

`true` when one was rolled back; `false` when the connection was already in autocommit

#### Throws

Error when the client is not ready

#### Remarks

Judged after the statements already delivered to this client finish: statements sent by a dead tab run first, then it checks whether the transaction it left behind is still open.
The caller must hold the cross-tab lock, otherwise it might roll back a transaction another tab is running.

#### Inherited from

`WaSqliteClientBase.rollbackOrphanTransaction`

***

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): void;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:98

Pauses / resumes change event collection.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `muted` | `boolean` | When `true` the update hook ignores writes outright — no batching, no dispatch |

#### Returns

`void`

#### Remarks

Muting applies to the whole client, not per owner; SharedWorker transport does not support resuming, so a shared client is never muted.

#### Inherited from

`WaSqliteClientBase.setChangeEventsMuted`

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-wa-sqlite/dist/WaSqliteClientBase.d.ts:89

Gets the SQLite version number.

#### Returns

`Promise`&lt;`string`&gt;

#### Inherited from

`WaSqliteClientBase.version`
