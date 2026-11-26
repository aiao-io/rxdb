---
sidebar_label: 'SqliteRepository⟨T⟩'
---

# SqliteRepository`<T>`

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:6

Repository for operating on entities

## Extends

- [`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md)&lt;`T`&gt;

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

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:11

#### Parameters

| Parameter    | Type                                                              |
| ------------ | ----------------------------------------------------------------- |
| `adapter`    | [`RxDBAdapterSqliteBase`](../interfaces/RxDBAdapterSqliteBase.md) |
| `EntityType` | `T`                                                               |

#### Returns

`SqliteRepository`&lt;`T`&gt;

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`constructor`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#constructor)

## Properties

### adapter \{#adapter\}

```ts
protected adapter: RxDBAdapterSqliteBase;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:9

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`adapter`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#adapter)

---

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`EntityType`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#entitytype)

---

### metadata \{#metadata\}

```ts
readonly metadata: EntityMetadata;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:10

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`metadata`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#metadata)

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`rxdb`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#rxdb)

---

### \_STATIC\_METHODS \{#_static_methods\}

```ts
protected static _STATIC_METHODS: string[];
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:29

List of "static method names" declared by subclasses, used to inject methods like `User.findOne(...)`
onto the entity class (attached during [EntityManager.init](../../rxdb/interfaces/EntityManager.md#init)).

#### Remarks

Declared as a class field `static` rather than assigned in the constructor — field initialization merges **bottom-up**
along the `extends` chain, so a subclass-defined `_STATIC_METHODS` is never lost; runtime reflection reads the field of the current class.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`_STATIC_METHODS`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#_static_methods)

## Accessors

### staticMethods \{#staticmethods\}

#### Get Signature

```ts
get static staticMethods(): string[];
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:37

All static method names declared by the current class (including every level of the inheritance chain)

##### Remarks

**Does not** accumulate along the prototype chain: each subclass writes its own `_STATIC_METHODS`, avoiding runtime
reflection surfacing names like the ancestors' `get` / `findOne` only to be accidentally overridden again by a descendant.

##### Returns

`string`[]

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`staticMethods`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#staticmethods)

## Methods

### addQueryCache() \{#addquerycache\}

```ts
addQueryCache(
   sqliteSuccessResult,
   forcedUpdate?,
   submissions?
): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:19

Add cache

#### Parameters

| Parameter             | Type                                                                                      | Description                                                                                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md) | -                                                                                                                                                |
| `forcedUpdate?`       | `boolean`                                                                                 | Force refresh: updates the data even when data already exists, needed when data has been modified                                                |
| `submissions?`        | `SqliteWriteSubmissions`&lt;`T`&gt;                                                       | Write-receipt specific: the submission records of this write (indexed by the written entity); backfill preserves edits made after the submission |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`addQueryCache`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#addquerycache)

---

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:27

Query the number of entities

#### Parameters

| Parameter | Type                                                                                           | Description                                                                           |
| --------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | Query options (see [CountOptions](../../rxdb/interfaces/CountOptions.md) for details) |

#### Returns

`Promise`&lt;`number`&gt;

Number of rows matching the condition

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`count`](../../rxdb/interfaces/IRepository.md#count)

---

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:28

Create an entity

#### Parameters

| Parameter | Type                      | Description                                                                                                          |
| --------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | Entity instance (usually created by [EntityManager.instantiate](../../rxdb/interfaces/EntityManager.md#instantiate)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence completes; **not** the same reference as the argument (implementations may swap in a new instance)

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`create`](../../rxdb/interfaces/IRepository.md#create)

---

### createEntityRef() \{#createentityref\}

```ts
createEntityRef(data): EntityInstanceType<T>;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:50

Create (or reuse) an entity reference

#### Parameters

| Parameter | Type                                                                         | Description                                                   |
| --------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `data`    | [`EntityUpdateData`](../../rxdb/type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Initial field values; the `id` is auto-generated when omitted |

#### Returns

[`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The entity instance attached to the [EntityManager](../../rxdb/interfaces/EntityManager.md) cache

#### Remarks

Whether or not the `id` argument already exists in the cache, the cached instance is **preferentially** returned (refresh by overwrite);
routing through `rxdb.entityManager.createEntityRef` reuses the same reference semantics, avoiding
two out-of-sync clones across different call stacks.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`createEntityRef`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#createentityref)

---

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:26

Read entities by query conditions and merge the result rows into the identity map.

#### Parameters

| Parameter | Type                                                                                          | Description      |
| --------- | --------------------------------------------------------------------------------------------- | ---------------- |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | Query conditions |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Entities for the result rows (cache hits return the same reference)

#### Remarks

Backfill goes through [SqliteRepositoryBase.mergeQueryCache](../../rxdb-adapter-wa-sqlite/classes/SqliteRepository.md#mergequerycache) rather than `addQueryCache(result)`:
with `forcedUpdate = false` the latter **only creates new entities and never touches cached ones**, so after any write that bypasses the ORM
(the HEAD CAS of the commit graph, CAS with commit capability enabled) lands in the database, `find()` in this process can only read
the stale value in the cache — the CAS clearly pushed `headRevision` to 1, yet reads still return 0, so the next commit
always hits `head_revision_conflict`. The PGlite side backfills on every read, so the same code behaves
differently on the two backends.

Neither is `addQueryCache(result, true)` used: that is a full-row overwrite + zeroing `modified`, which writes the user's unsaved
edits into the baseline and then silently clears them (see `entity-status.ts#applyExternal`).

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`find`](../../rxdb/interfaces/IRepository.md#find)

---

### findByRowIds() \{#findbyrowids\}

```ts
findByRowIds(rowIds, forceRefresh?): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:12

#### Parameters

| Parameter       | Type       |
| --------------- | ---------- |
| `rowIds`        | `bigint`[] |
| `forceRefresh?` | `boolean`  |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`findByRowIds`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#findbyrowids)

---

### findOne() \{#findone\}

```ts
findOne(options): Promise<InstanceType<T> | undefined>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:8

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

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:7

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

Look up an entity by ID in the current process's entity cache

#### Parameters

| Parameter | Type                                                                                     | Description        |
| --------- | ---------------------------------------------------------------------------------------- | ------------------ |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity primary key |

#### Returns

\| [`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;
\| `undefined`

Returns the instance on a cache hit, `undefined` on a miss (**without** triggering a database query)

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`getEntityRef`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#getentityref)

---

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef(id): boolean;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:68

Determine whether the current process's entity cache contains the given ID

#### Parameters

| Parameter | Type                                                                                     | Description        |
| --------- | ---------------------------------------------------------------------------------------- | ------------------ |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity primary key |

#### Returns

`boolean`

`true` on a cache hit, otherwise `false`

#### Remarks

Equivalent to `getEntityRef(id) !== undefined`, provided separately so hot paths such as "batch prewarming" and
"delta sync" save the cost of one reference creation / state read.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`hasEntityRef`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#hasentityref)

---

### mergeQueryCache() \{#mergequerycache\}

```ts
protected mergeQueryCache(sqliteSuccessResult): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:33

Merge result rows into the identity map: clean entities are refreshed row-wide, dirty entities avoid clobbering unsaved edits field by field.

#### Parameters

| Parameter             | Type                                                                                      | Description                |
| --------------------- | ----------------------------------------------------------------------------------------- | -------------------------- |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md) | The result set of a SELECT |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

Entities for the result rows (cache hits return the same reference)

#### Remarks

The division of labor with [addQueryCache](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#addquerycache) is "read" vs "write": the write path (`create` / `update`) knows
what it just wrote, so a full-row overwrite with `forcedUpdate` is correct there; the read path receives rows written by **someone else**, which may
land on an entity a user is currently editing, so only the `state.modified ? mergeExternal : replace`
pair of strategies applies — this is exactly the semantics of `entity-status.ts#applyExternal`, which explicitly lists "query result backfill"
as one of the three paths that must be distinguished.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`mergeQueryCache`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#mergequerycache)

---

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:30

Delete an entity

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

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:29

Update an entity

#### Parameters

| Parameter | Type                                       | Description                                                |
| --------- | ------------------------------------------ | ---------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                  | The entity to update (provides `id` and the latest fields) |
| `patch`   | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Field-level patch; fields not listed are left unchanged    |

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

Overwrite entity fields with `update`

#### Parameters

| Parameter | Type                      | Description                                                                      |
| --------- | ------------------------- | -------------------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | Target entity                                                                    |
| `update`  | `InstanceType`&lt;`T`&gt; | Fields to write; the primary key `id` is also assigned (for hydration scenarios) |

#### Returns

`void`

#### Remarks

Goes through [EntityStatus.applyExternal](../../rxdb/interfaces/EntityStatus.md#applyexternal), ensuring dirty tracking and patch generation take the same path,
and that an entity with unsaved edits is avoided field by field rather than overwritten row-wide — a live query's batch backfill can hit entities the user has already modified,
and an unconditional `replace` would silently eat those edits.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`updateEntity`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#updateentity)
