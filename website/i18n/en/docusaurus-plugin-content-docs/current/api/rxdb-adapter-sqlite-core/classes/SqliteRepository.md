---
sidebar_label: 'SqliteRepository⟨T⟩'
---

# SqliteRepository`<T>`

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L23)

Repository for operating on entities

## Extends

- [`SqliteRepositoryBase`](SqliteRepositoryBase.md)&lt;`T`&gt;

## Extended by

- [`SqliteTreeRepository`](SqliteTreeRepository.md)

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Implements

- [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

## Constructors

### Constructor

```ts
new SqliteRepository<T>(adapter, EntityType): SqliteRepository<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L21)

#### Parameters

| Parameter    | Type                                                |
| ------------ | --------------------------------------------------- |
| `adapter`    | [`RxDBAdapterSqliteBase`](RxDBAdapterSqliteBase.md) |
| `EntityType` | `T`                                                 |

#### Returns

`SqliteRepository`&lt;`T`&gt;

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`constructor`](SqliteRepositoryBase.md#constructor)

## Properties

### adapter \{#adapter\}

```ts
protected adapter: RxDBAdapterSqliteBase;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L22)

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`adapter`](SqliteRepositoryBase.md#adapter)

---

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`EntityType`](SqliteRepositoryBase.md#entitytype)

---

### metadata \{#metadata\}

```ts
readonly metadata: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L19)

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`metadata`](SqliteRepositoryBase.md#metadata)

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`SqliteTreeRepository`](SqliteTreeRepository.md).[`rxdb`](SqliteTreeRepository.md#rxdb)

---

### \_STATIC\_METHODS \{#_static_methods\}

```ts
protected static _STATIC_METHODS: string[];
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:29

The list of "static method names" declared by subclasses, used to inject methods such as `User.findOne(...)`
onto the entity class (attached at [EntityManager.init](../../rxdb/interfaces/EntityManager.md#init) time).

#### Remarks

Uses a class field `static` rather than assignment in the constructor — field initialization is merged **bottom-up**
along the `extends` chain, so `_STATIC_METHODS` defined by subclasses is not lost; runtime reflection reads the current class's field.

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`_STATIC_METHODS`](SqliteRepositoryBase.md#_static_methods)

## Accessors

### staticMethods \{#staticmethods\}

#### Get Signature

```ts
get static staticMethods(): string[];
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:37

All static method names declared by the current class (including every layer of the inheritance chain)

##### Remarks

**Not** accumulated along the prototype chain: each subclass writes its own `_STATIC_METHODS`, avoiding names like an ancestor's
`get` / `findOne` being reflected at runtime and then accidentally overridden once more by a descendant.

##### Returns

`string`[]

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`staticMethods`](SqliteRepositoryBase.md#staticmethods)

## Methods

### addQueryCache() \{#addquerycache\}

```ts
addQueryCache(
   sqliteSuccessResult,
   forcedUpdate?,
   submissions?
): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L70)

Adds to the cache

#### Parameters

| Parameter             | Type                                                          | Default value | Description                                                                                                                                                 |
| --------------------- | ------------------------------------------------------------- | ------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md) | `undefined`   | -                                                                                                                                                           |
| `forcedUpdate?`       | `boolean`                                                     | `false`       | Force refresh; updates the data even when it already exists — needed when the data has been modified                                                        |
| `submissions?`        | `SqliteWriteSubmissions`&lt;`T`&gt;                           | `undefined`   | Write-receipt only: the submission records of this write (indexed by the written entity); new edits made after the submission are preserved during backfill |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`addQueryCache`](SqliteRepositoryBase.md#addquerycache)

---

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L65)

Queries the number of entities

#### Parameters

| Parameter | Type                                                                                           | Description                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | Query options (see [CountOptions](../../rxdb/interfaces/CountOptions.md) for details) |

#### Returns

`Promise`&lt;`number`&gt;

The number of rows satisfying the condition

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`count`](../../rxdb/interfaces/IRepository.md#count)

---

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L71)

Creates an entity

#### Parameters

| Parameter | Type                      | Description                                                                                                              |
| --------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity instance (usually created by [EntityManager.instantiate](../../rxdb/interfaces/EntityManager.md#instantiate)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence completes; **not** the same reference as the argument (the implementation may swap in a new instance)

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`create`](../../rxdb/interfaces/IRepository.md#create)

---

### createEntityRef() \{#createentityref\}

```ts
createEntityRef(data): EntityInstanceType<T>;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:50

Creates (or reuses) an entity reference

#### Parameters

| Parameter | Type                                                                         | Description                                                        |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `data`    | [`EntityUpdateData`](../../rxdb/type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Initial field values; `id` is generated automatically when omitted |

#### Returns

[`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The entity instance already attached to the [EntityManager](../../rxdb/interfaces/EntityManager.md) cache

#### Remarks

Regardless of whether the input `id` already exists in the cache, the cached instance is **preferred** (overwrite refresh);
it goes through `rxdb.entityManager.createEntityRef` to reuse the same reference semantics, avoiding
two out-of-sync clones in different call stacks.

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`createEntityRef`](SqliteRepositoryBase.md#createentityref)

---

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L58)

Reads entities by query conditions and merges the result rows into the identity map.

#### Parameters

| Parameter | Type                                                                                          | Description      |
| --------- | --------------------------------------------------------------------------------------------- | ---------------- |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | Query conditions |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities corresponding to the result rows (same reference for cache hits)

#### Remarks

Backfill goes through [SqliteRepositoryBase.mergeQueryCache](SqliteRepositoryBase.md#mergequerycache) rather than `addQueryCache(result)`:
the latter, under `forcedUpdate = false`, **only creates new entities and never touches cached ones**, so after any write that bypasses the ORM
(the commit graph's HEAD CAS, CAS with commit capability enabled) lands in the database, no matter how many times this process calls `find()`, it only reads
the stale value in the cache — the CAS clearly pushed `headRevision` to 1, but the read-back is still 0, so the next commit
always hits `head_revision_conflict`. On the PGlite side every read backfills; the same code behaves differently on the two backends.

`addQueryCache(result, true)` is not used either: that is whole-row overwrite + resetting `modified` to zero, which writes the user's unsaved
edits into the baseline and then silently clears them (see `entity-status.ts#applyExternal`).

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`find`](../../rxdb/interfaces/IRepository.md#find)

---

### findByRowIds() \{#findbyrowids\}

```ts
findByRowIds(rowIds, forceRefresh?): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L29)

#### Parameters

| Parameter       | Type       | Default value |
| --------------- | ---------- | ------------- |
| `rowIds`        | `bigint`[] | `undefined`   |
| `forceRefresh?` | `boolean`  | `false`       |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`findByRowIds`](SqliteRepositoryBase.md#findbyrowids)

---

### findOne() \{#findone\}

```ts
findOne(options): Promise<InstanceType<T> | undefined>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L36)

#### Parameters

| Parameter | Type                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------ |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOneOptions"`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

---

### get() \{#get\}

```ts
get(id): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L24)

#### Parameters

| Parameter | Type                                                                                     |
| --------- | ---------------------------------------------------------------------------------------- |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

---

### getEntityRef() \{#getentityref\}

```ts
getEntityRef(id):
  | EntityInstanceType<T>
  | undefined;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:57

Looks up an entity by ID in the current process's entity cache

#### Parameters

| Parameter | Type                                                                                     | Description            |
| --------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity primary key |

#### Returns

\| [`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;
\| `undefined`

The instance on cache hit, `undefined` on miss (**does not** trigger a database query)

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`getEntityRef`](SqliteRepositoryBase.md#getentityref)

---

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef(id): boolean;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:68

Determines whether the given ID exists in the current process's entity cache

#### Parameters

| Parameter | Type                                                                                     | Description            |
| --------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity primary key |

#### Returns

`boolean`

`true` on cache hit, otherwise `false`

#### Remarks

Equivalent to `getEntityRef(id) !== undefined`; provided separately so hot paths such as "batch warm-up" and
"diff sync" save the cost of one reference creation / state read.

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`hasEntityRef`](SqliteRepositoryBase.md#hasentityref)

---

### mergeQueryCache() \{#mergequerycache\}

```ts
protected mergeQueryCache(sqliteSuccessResult): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L99)

Merges result rows into the identity map: clean entities get a whole-row refresh, dirty entities dodge unsaved edits field by field.

#### Parameters

| Parameter             | Type                                                          | Description                  |
| --------------------- | ------------------------------------------------------------- | ---------------------------- |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md) | The result set of one SELECT |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities corresponding to the result rows (same reference for cache hits)

#### Remarks

The division of labor with [addQueryCache](SqliteRepositoryBase.md#addquerycache) is "read" vs "write": the write path (`create` / `update`) knows
what it just wrote, and overwriting the whole row with `forcedUpdate` is correct; the read path receives rows written by **someone else**, which may
land on an entity the user is editing, so only the pair of strategies `state.modified ? mergeExternal : replace`
can be used — this is exactly the semantics of `entity-status.ts#applyExternal`, which explicitly lists "query result backfill"
as one of the three paths that must be branched.

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`mergeQueryCache`](SqliteRepositoryBase.md#mergequerycache)

---

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:113](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L113)

Deletes an entity

#### Parameters

| Parameter | Type                      | Description                            |
| --------- | ------------------------- | -------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity to delete (located by `id`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after deletion completes (fields cleared, `local` set to `false`)

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`remove`](../../rxdb/interfaces/IRepository.md#remove)

---

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepository.ts#L91)

Updates an entity

#### Parameters

| Parameter | Type                                       | Description                                                |
| --------- | ------------------------------------------ | ---------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                  | The entity to update (provides `id` and the latest fields) |
| `patch`   | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Field-level patch; fields not listed are not modified      |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence completes

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`update`](../../rxdb/interfaces/IRepository.md#update)

---

### updateEntity() \{#updateentity\}

```ts
updateEntity(entity, update): void;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:80

Overwrites entity fields with `update`

#### Parameters

| Parameter | Type                      | Description                                                                        |
| --------- | ------------------------- | ---------------------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The target entity                                                                  |
| `update`  | `InstanceType`&lt;`T`&gt; | The fields to write; the primary key `id` is also assigned (for hydrate scenarios) |

#### Returns

`void`

#### Remarks

Goes through [EntityStatus.applyExternal](../../rxdb/interfaces/EntityStatus.md#applyexternal), ensuring dirty tracking and patch generation take the same path,
and dodges field by field instead of overwriting the whole row when the entity has unsaved edits — a live query's batch backfill can hit entities already changed by the user,
and unconditional `replace` would silently eat those edits.

#### Inherited from

[`SqliteRepositoryBase`](SqliteRepositoryBase.md).[`updateEntity`](SqliteRepositoryBase.md#updateentity)
