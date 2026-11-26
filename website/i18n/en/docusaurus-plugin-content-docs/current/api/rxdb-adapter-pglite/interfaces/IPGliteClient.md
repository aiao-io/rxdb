# IPGliteClient

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:233](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L233)

The minimal public contract of a PGlite client.

Abstracts the core methods of [PGliteClient](../classes/PGliteClient.md), making it easy to substitute a mock in tests or to inject it as an interface in cross-adapter code. All method signatures forward directly to the same-named API of the underlying `@electric-sql/pglite`.

## Properties

### pendingNotificationCount? \{#pendingnotificationcount\}

```ts
readonly pendingNotificationCount?: number;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:315](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L315)

Number of NOTIFY row events not yet dispatched.

## Methods

### describeQuery()? \{#describequery\}

```ts
describeQuery?(query, options?): Promise<DescribeQueryResult>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:278](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L278)

Describes a query

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | The query to describe |
| `options?` | `QueryOptions` | - |

#### Returns

`Promise`&lt;`DescribeQueryResult`&gt;

Description of the query result type

#### Remarks

Optional: `DescribeQueryResult` carries parser functions that cannot survive structured cloning, so the desktop proxy client of US-208 cannot provide it. The adapter itself never calls it; declaring it required would turn "cannot implement locally" into "must fake one".

***

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:335](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L335)

#### Returns

`Promise`&lt;`void`&gt;

***

### exec() \{#exec\}

```ts
exec(query, options?): Promise<Results[]>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L266)

Executes a SQL query, which may contain multiple statements
Uses PostgreSQL's "simple query" protocol message

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | The query to execute |
| `options?` | `QueryOptions` | - |

#### Returns

`Promise`&lt;`Results`[]&gt;

The query results

***

### forceClose() \{#forceclose\}

```ts
forceClose(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:334](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L334)

Releases client resources without performing a persistence sync.

#### Returns

`Promise`&lt;`void`&gt;

***

### hasStoragePeer()? \{#hasstoragepeer\}

```ts
hasStoragePeer?(): boolean;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:302](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L302)

Whether another client in the current realm holds the same persistent storage.

#### Returns

`boolean`

***

### init() \{#init\}

```ts
init(dbName, options): Promise<void>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L234)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `dbName` | `string` |
| `options` | [`PGliteClientOptions`](PGliteClientOptions.md) |

#### Returns

`Promise`&lt;`void`&gt;

***

### liveQuery()? \{#livequery\}

```ts
liveQuery?<T>(
   query, 
   params?, 
   callback?
): Promise<LiveQuery<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:327](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L327)

Creates a PGlite live query that calls back automatically when data changes

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | SQL |
| `params?` | `unknown`[] \| `null` | Parameters |
| `callback?` | (`results`) => `void` | Result callback |

#### Returns

`Promise`&lt;`LiveQuery`&lt;`T`&gt;&gt;

#### Remarks

Optional: a `LiveQuery` handle carries a subscription and `unsubscribe`, and a proxy implementation would need to build a whole cross-process subscription lifecycle itself. [RxDBAdapterPGlite.liveQuery](../classes/RxDBAdapterPGlite.md#livequery) already decides by capability and fails fast.

***

### query() \{#query\}

```ts
query<T>(
   query, 
   params?, 
   options?
): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:243](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L243)

Executes a single SQL statement
Uses PostgreSQL's "extended query" protocol message

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `query` | `string` | The query statement to execute |
| `params?` | `unknown`[] | Optional parameters for the query |
| `options?` | `QueryOptions` | - |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;

The query results

***

### runExclusive()? \{#runexclusive\}

```ts
runExclusive?<T>(fn): Promise<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L299)

Runs a function exclusively, disallowing other transactions or queries while it runs
This is particularly useful with execProtocol methods, because they are not blocked by, nor do they block, the locks used by transactions and queries

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-2"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `fn` | () => `Promise`&lt;`T`&gt; | The function to run |

#### Returns

`Promise`&lt;`T`&gt;

The function's result

#### Remarks

Optional, for the same class of reason as [IPGliteClient.describeQuery](#describequery) but harder: `fn` is the caller's closure and cannot be passed across processes; to truly proxy it, the renderer would have to hold the main process's single connection for the whole duration of `fn`, and if the renderer crashes that lock can never be released again.

***

### snapshotDataDir()? \{#snapshotdatadir\}

```ts
snapshotDataDir?<T>(fn): Promise<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L312)

Reads the data directory on a consistent snapshot.

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-3"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `fn` | (`items`) => `Promise`&lt;`T`&gt; |

#### Returns

`Promise`&lt;`T`&gt;

#### Remarks

Optional: a main-thread PGlite walks the Emscripten filesystem directly, the desktop proxy client streams chunks back from the host on a transactional snapshot; the Worker client does not provide it, and [RxDBAdapterPGlite.backup](../classes/RxDBAdapterPGlite.md#backup) reports `unsupported_combination` accordingly. The snapshot stays valid until `fn` returns, during which the database is held exclusively.

***

### sql() \{#sql\}

```ts
sql<T>(sqlStrings, ...params): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:258](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L258)

Executes a single SQL statement, similar to query but using a template statement where template values are treated as parameters

Uses PostgreSQL's "extended query" protocol message

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-4"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `sqlStrings` | `TemplateStringsArray` |
| ...`params` | `unknown`[] |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;

The query results

#### Example

```ts
const results = await db.sql`SELECT * FROM ${identifier`foo`} WHERE id = ${id}`
```

***

### transaction() \{#transaction\}

```ts
transaction<T>(callback): Promise<T>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:285](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L285)

Executes a transaction

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-5"></a> `T` |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `callback` | (`tx`) => `Promise`&lt;`T`&gt; | Callback function that receives the transaction object |

#### Returns

`Promise`&lt;`T`&gt;

The transaction's result

***

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-pglite/src/PGliteClient.ts:336](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/PGliteClient.ts#L336)

#### Returns

`Promise`&lt;`string`&gt;
