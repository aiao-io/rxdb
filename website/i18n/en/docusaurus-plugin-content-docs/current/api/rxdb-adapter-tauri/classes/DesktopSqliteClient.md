# DesktopSqliteClient

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:90

Client for accessing a local SQLite file through the desktop host.

## Remarks

It satisfies `SqliteClientLike`, so queries, transactions, branch switching, and system schema
migration from `RxDBAdapterSqliteBase` are all reused as-is — the desktop path is not a second
implementation, just the same contract over a different transport channel.

## Implements

- [`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)

## Properties

### resolvedLocation \{#resolvedlocation\}

```ts
readonly resolvedLocation: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:93

Logical location resolved by the host, for diagnostics only (AC#3).

## Accessors

### sessionId \{#sessionid\}

#### Get Signature

```ts
get sessionId(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:95

Session ID of this client on the host, used to match pushed change events to their session.

##### Returns

`string`

## Methods

### addEventListener() \{#addeventlistener\}

```ts
addEventListener(type, handler): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:149

Registers a change event listener.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | [`SQLiteChangeType`](../../rxdb-adapter-sqlite-core/enumerations/SQLiteChangeType.md) | The change type of interest |
| `handler` | (`event`) => `void` | Event callback |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The return is a Promise to align with `SqliteClientLike`: a Comlink remote client returns a
Promise even when its implementation is synchronous, so callers always `await`, otherwise the
listener may not be active yet when writes to the database begin.

What is awaited here is the transport's [DesktopHostTransport.subscriptionReady](../interfaces/DesktopHostTransport.md#subscriptionready), i.e.
the same registration that `connect()` awaited. On the normal path it has already settled, so the
`await` costs a single microtask; if the channel drops later it rejects, and the registering side
learns that it will never see events instead of silently never receiving any.

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`addEventListener`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#addeventlistener)

***

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:161

Strongest-lock SQL used by system schema migrations.

#### Returns

`string`

The statement given by the host in the `open` response

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`beginSystemMigrationTransactionSql`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#beginsystemmigrationtransactionsql)

***

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:155

SQL used to begin an ordinary transaction.

#### Returns

`string`

The statement given by the host in the `open` response

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`beginTransactionSql`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#begintransactionsql)

***

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:183

Describes what a freshly created blank database on the host looks like.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBlankDatabase.md)&gt;

A description with no objects

#### Remarks

Unlike the wasm clients, it does not open a temporary `:memory:` connection to measure: the wire
protocol can only open database files in the app data directory, and creating a temporary database
just to measure would leave artifacts next to the target. A database newly created by the desktop
host always has no user objects: both hosts only install TEMP notification triggers, which do not
enter the main database's `sqlite_schema`.

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`describeBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#describeblankdatabase)

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:202

Disconnects the session.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

The order is exactly AC#7's semantics: first set the closed flag to **stop accepting new tasks**,
then wait for in-flight requests to finish, and only then let the host release the handle. What is
awaited is DesktopSqliteClient.#tail, which never rejects — a failed in-flight query must not leave
the handle held forever.

Concurrent callers share the same DesktopSqliteClient.#disconnectPromise, so **all** callers settle
only after the handle is actually released. The `#closed` boolean alone cannot achieve this: once it
is set, a second caller returns successfully immediately and might rename or back up the file while
the database is still open.

When closing fails, this promise is cached as rejected; later calls see the same rejection and
**never** silently treat it as closed, nor retry automatically — there is no second criterion for
whether the handle was released, and pretending success only postpones "the file is still occupied"
to a harder-to-locate explosion.

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when the host refuses or fails to close the session

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`disconnect`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#disconnect)

***

### execute() \{#execute\}

```ts
execute(sql, bindings?): Promise<SqliteSuccessResult>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:128

Executes SQL on the host.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | SQL to execute |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] | Positional binding parameters |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

Execution result with the same shape as the local SQLite backends

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when the session is disconnected, or the host reports an execution failure

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`execute`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#execute)

***

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:172

Pauses / resumes change-event collection for this session (muted while US-217 restores a whole database).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `muted` | `boolean` | When `true`, the host stops collecting changes for this session |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Muting happens on the host side (the `mute` request of protocol v2): if the renderer only dropped
the events, the host would still accumulate rowIds for every row restore writes and move the whole
batch across IPC, with cost growing linearly in database size.

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when the session is disconnected, or the host refuses the request

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`setChangeEventsMuted`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#setchangeeventsmuted)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:134

Reports the version of the host-side SQLite engine.

#### Returns

`Promise`&lt;`string`&gt;

A version string like `3.50.4`

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`version`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#version)

***

### connect() \{#connect\}

```ts
static connect(
   transport, 
   storage, 
   options?
): Promise<DesktopSqliteClient>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:106

Opens a desktop database session.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transport` | [`DesktopHostTransport`](../interfaces/DesktopHostTransport.md) | Transport provided by the preload or a worker bridge |
| `storage` | [`DesktopSqliteFileStorage`](../interfaces/DesktopSqliteFileStorage.md) | Desktop storage configuration |
| `options?` | [`DesktopSqliteClientOptions`](../interfaces/DesktopSqliteClientOptions.md) | Optional behavior parameters |

#### Returns

`Promise`&lt;`DesktopSqliteClient`&gt;

The connected client

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when no transport is injected, the configuration is invalid, or the host fails to open

***

### drop() \{#drop\}

```ts
static drop(transport, storage): Promise<boolean>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:119

Deletes a database file and its journal side files on the host (US-313: reclaiming a read-only checkout's snapshot database).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transport` | [`DesktopHostTransport`](../interfaces/DesktopHostTransport.md) | Transport provided by the preload or a worker bridge |
| `storage` | [`DesktopSqliteFileStorage`](../interfaces/DesktopSqliteFileStorage.md) | The database to delete |

#### Returns

`Promise`&lt;`boolean`&gt;

Whether the database file existed before

#### Remarks

Not attached to a session; the preconditions are the same as [DesktopSqliteClient.connect](#connect): the
transport and the storage are validated renderer-side first, and the handshake happens before
sending — this request has side effects, and a host with a mismatched version should never receive it.

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when no transport is injected, the configuration is invalid, or the channel fails; throws `database_busy` when the host still has a session open on this database
