# DesktopSqliteClient

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:90

Client for accessing a local SQLite file through the desktop host.

## Remarks

It satisfies `SqliteClientLike`, so the query, transaction, branch switching, and system schema migration logic in `RxDBAdapterSqliteBase` is all reused as-is — the desktop path is not a second implementation, just the same contract over a different transport channel.

## Implements

- [`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md)

## Properties

### resolvedLocation \{#resolvedlocation\}

```ts
readonly resolvedLocation: string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:93

The logical location resolved by the host, for diagnostics only (AC#3).

## Accessors

### sessionId \{#sessionid\}

#### Get Signature

```ts
get sessionId(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:95

This client's session ID on the host, used to match pushed change events to the right session.

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

The Promise return aligns with `SqliteClientLike`: a Comlink remote client returns a Promise even when its implementation is synchronous, so registrants always `await` — otherwise the listener might not be in effect before writes begin.

What is awaited here is the transport's [DesktopHostTransport.subscriptionReady](../interfaces/DesktopHostTransport.md#subscriptionready), i.e. the one registration that `connect()` already waited for. On the normal path it has long settled and the `await` costs only a microtask; when the channel drops afterwards, it rejects, so the registrant learns it will not receive events instead of silently never receiving any.

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`addEventListener`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#addeventlistener)

***

### beginSystemMigrationTransactionSql() \{#beginsystemmigrationtransactionsql\}

```ts
beginSystemMigrationTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:161

The strongest-lock SQL used by system schema migrations.

#### Returns

`string`

The statement the host gave in the `open` response

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`beginSystemMigrationTransactionSql`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#beginsystemmigrationtransactionsql)

***

### beginTransactionSql() \{#begintransactionsql\}

```ts
beginTransactionSql(): string;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:155

SQL for opening an ordinary transaction.

#### Returns

`string`

The statement the host gave in the `open` response

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`beginTransactionSql`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#begintransactionsql)

***

### describeBlankDatabase() \{#describeblankdatabase\}

```ts
describeBlankDatabase(): Promise<SqliteBlankDatabase>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:183

Describes what a freshly created empty database on the host looks like.

#### Returns

`Promise`&lt;[`SqliteBlankDatabase`](../../rxdb-adapter-sqlite-core/interfaces/SqliteBlankDatabase.md)&gt;

A description containing no objects

#### Remarks

Unlike the wasm client, it does not open a temporary `:memory:` connection to measure: the wire protocol can only open database files inside the app data directory, and creating a temporary database just to measure would leave artifacts next to the target. A freshly created desktop-host database always has no user objects: both hosts only install TEMP notification triggers, which do not enter the main database's `sqlite_schema`.

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

The order is AC#7's semantics: first set the closed flag to **stop accepting new tasks**, then wait for in-flight requests to finish, and only then let the host release the handle. What is awaited is DesktopSqliteClient.#tail, which does not reject — one failed in-flight query should not keep the handle held forever.

Concurrent callers share the same DesktopSqliteClient.#disconnectPromise, so **all** callers settle only after the handle is truly released. The `#closed` boolean alone cannot do that: as soon as it is set, a second caller returns successfully at once and might rename or back up the file while the database is still open.

When closing fails, this promise is cached as rejected; later calls see the same rejection — they do **not** silently treat it as closed, nor do they retry automatically. There is no second criterion for whether the handle was released, and pretending success would only postpone the "file still in use" blowup to a place that is harder to locate.

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
| `sql` | `string` | The SQL to execute |
| `bindings?` | [`SQLiteCompatibleType`](../../rxdb-adapter-sqlite-core/type-aliases/SQLiteCompatibleType.md)[] | Positional binding parameters |

#### Returns

`Promise`&lt;[`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md)&gt;

An execution result shaped the same as the local SQLite backend

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when the session is disconnected, or the host reports execution failure

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`execute`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#execute)

***

### setChangeEventsMuted() \{#setchangeeventsmuted\}

```ts
setChangeEventsMuted(muted): Promise<void>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:172

Pauses / resumes change event collection for this session (muted while US-217 restores an entire database).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `muted` | `boolean` | When `true`, the host stops collecting this session's changes |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Muting lands on the host side (protocol v2's `mute`): if the renderer merely discarded them, the host would still accumulate rowIds for every row the restore writes and move the whole batch across IPC, with cost growing linearly in the size of the database.

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when the session is disconnected, or the host rejects the request

#### Implementation of

[`SqliteClientLike`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md).[`setChangeEventsMuted`](../../rxdb-adapter-sqlite-core/interfaces/SqliteClientLike.md#setchangeeventsmuted)

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/desktop/desktop-sqlite-client.d.ts:134

Reports the host-side SQLite engine version.

#### Returns

`Promise`&lt;`string`&gt;

A version string such as `3.50.4`

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

Deletes a database file and its journal sidecar files on the host (US-313: reclaiming snapshot databases of read-only checkouts).

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `transport` | [`DesktopHostTransport`](../interfaces/DesktopHostTransport.md) | Transport provided by the preload or a worker bridge |
| `storage` | [`DesktopSqliteFileStorage`](../interfaces/DesktopSqliteFileStorage.md) | The database to delete |

#### Returns

`Promise`&lt;`boolean`&gt;

Whether the database file existed before

#### Remarks

Not attached to a session; the preconditions are the same as [DesktopSqliteClient.connect](#connect): transport and storage are validated on the renderer side first, and the handshake precedes the request — this request has side effects, and a host with a mismatched version should never receive it.

#### Throws

[RxDBAdapterDesktopError](RxDBAdapterDesktopError.md) when no transport is injected, the configuration is invalid, or the channel fails; throws `database_busy` when a session on the host still has this database open
