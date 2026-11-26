# IRxDBAdapter

Defined in: [packages/rxdb/src/rxdb-adapter.ts:266](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L266)

RxDB database adapter interface.

## Extended by

- [`LocalRxDBChangeRepository`](LocalRxDBChangeRepository.md)
- [`RemoteRxDBChangeRepository`](RemoteRxDBChangeRepository.md)

## Properties

### name \{#name\}

```ts
readonly name: string;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:268](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L268)

The adapter name — the same value as the key used when registering via `RxDB.adapter()`; both error messages
and `getAdapter()` recognize it by this.

## Methods

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:279](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L279)

Establishes the connection and brings the system tables up to the current watermark.

#### Returns

`Promise`&lt;`IRxDBAdapter`&gt;

Itself, for chaining.

#### Remarks

Table creation and system migrations both happen here (see `isCurrentRxDBSystemVersion`), so it may be slow,
and it may throw `UnsupportedRxDBSystemVersionError` because the database is newer than this process.

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L288)

Disconnects and releases the underlying handle.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Unlike `RxDB.destroy()`, disconnecting is **reversible**: the same adapter instance can `connect()` again
afterwards. The implementation must be idempotent — calling it while not connected is a no-op, not an error.

---

### getRepository() \{#getrepository\}

```ts
getRepository<T, RT>(EntityType): RT;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:305](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L305)

Gets this entity's repository instance on **this adapter**.

#### Type Parameters

| Type Parameter                                                                            | Default type                               |
| ----------------------------------------------------------------------------------------- | ------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | -                                          |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](IRepository.md)&lt;`T`&gt;  | [`IRepository`](IRepository.md)&lt;`T`&gt; |

#### Parameters

| Parameter    | Type |
| ------------ | ---- |
| `EntityType` | `T`  |

#### Returns

`RT`

#### Remarks

Returns a repository on the adapter axis (see [AdapterRepositoryConstructor](../type-aliases/AdapterRepositoryConstructor.md)) —
not the same object as the facade repository users usually get from `RxDB.getRepository()`.

---

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:332](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L332)

Whether this entity's table already exists in the database.

#### Parameters

| Parameter    | Type                                          |
| ------------ | --------------------------------------------- |
| `EntityType` | [`EntityType`](../type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

Asks about the **physical table**, not whether the entity is registered in the metadata.

---

### mutations() \{#mutations\}

```ts
mutations<T>(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L324)

Batch-mutates entities (create/update/delete).

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                 |
| --------- | ---------------------------------------------------- |
| `options` | [`RxDBMutationsMap`](RxDBMutationsMap.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

---

### rawQuery()? \{#rawquery\}

```ts
rawQuery?(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:346](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L346)

Executes a raw SQL query (for scenarios that bypass the ORM, such as conditional UPDATE).

#### Parameters

| Parameter | Type        |
| --------- | ----------- |
| `sql`     | `string`    |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;[`RawQueryResult`](RawQueryResult.md)&gt;

#### Remarks

**An optional method, and that has consequences**: the core package cannot wrap it for the adapters the way it
does for the four write primitives, so on a database with the commit capability enabled, the raw-write gate
can only be done by each adapter's own implementation calling `gateRawWrite(sql, ctx, …)` (with `ctx` taken
from [RxDBAdapterLocalBase.workingTreeRawWriteContext](../classes/RxDBAdapterLocalBase.md#workingtreerawwritecontext)).
Missing that one call means all writes on this path bypass change capture.

Writes through here do not go through the entity Proxy, so they produce no entity events, and instances in
the cache are not refreshed automatically.

---

### removeMany() \{#removemany\}

```ts
removeMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L319)

Batch-deletes entities.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-2"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The deleted entities.

---

### saveMany() \{#savemany\}

```ts
saveMany<T>(entities): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:312](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L312)

Batch-writes entities (inserts when absent, updates when present).

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-3"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities after persistence; fields backfilled by the database (primary keys, database-side defaults,
etc.) only have values here.

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb/src/rxdb-adapter.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-adapter.ts#L296)

The underlying database engine's version number (e.g. SQLite's `3.45.0`), for diagnostics and capability checks.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Unrelated to the system-table watermark number (`RXDB_SYSTEM_SCHEMA_VERSION`) — that is RxDB's own number.
