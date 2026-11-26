---
sidebar_label: "SqliteRepository⟨T⟩"
---

# SqliteRepository`<T>`

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:6

The repository for operating on entities

## Extends

- [`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Implements

- [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

## Constructors

### Constructor

```ts
new SqliteRepository<T>(adapter, EntityType): SqliteRepository<T>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:11

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../../rxdb-adapter-wa-sqlite/interfaces/RxDBAdapterSqliteBase.md) |
| `EntityType` | `T` |

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

***

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`EntityType`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#entitytype)

***

### metadata \{#metadata\}

```ts
readonly metadata: EntityMetadata;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:10

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`metadata`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#metadata)

***

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`rxdb`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#rxdb)

***

### \_STATIC\_METHODS \{#_static_methods\}

```ts
protected static _STATIC_METHODS: string[];
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:29

The list of "static method names" declared by subclasses, used to inject
methods like `User.findOne(...)` onto the entity class (mounted at
[EntityManager.init](../../rxdb/interfaces/EntityManager.md#init)).

#### Remarks

Uses class-field `static` instead of assigning in the constructor — field
initialization merges **bottom-up** along the `extends` chain, so a
`_STATIC_METHODS` defined by a subclass is not lost; runtime reflection reads
the current class's field.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`_STATIC_METHODS`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#_static_methods)

## Accessors

### staticMethods \{#staticmethods\}

#### Get Signature

```ts
get static staticMethods(): string[];
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:37

All static method names declared by the current class (including every layer of the inheritance chain)

##### Remarks

Does **not** accumulate along the prototype chain: each subclass writes its own
copy of `_STATIC_METHODS`, avoiding the runtime reflecting names like `get` /
`findOne` of an ancestor that a descendant then accidentally overrides once more.

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

Adds to the cache

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md) | - |
| `forcedUpdate?` | `boolean` | Force a refresh; updates the data even when it already exists, which is needed when data is modified |
| `submissions?` | `SqliteWriteSubmissions`&lt;`T`&gt; | Write-receipt only: the submission records of this write (indexed by the written entities), preserving edits made after the submission during backfill |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`addQueryCache`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#addquerycache)

***

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:27

Queries the number of entities

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | Query options (see [CountOptions](../../rxdb/interfaces/CountOptions.md) for details) |

#### Returns

`Promise`&lt;`number`&gt;

The number of rows matching the conditions

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`count`](../../rxdb/interfaces/IRepository.md#count)

***

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:28

Creates an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance (usually created via [EntityManager.instantiate](../../rxdb/interfaces/EntityManager.md#instantiate)) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence; **not** the same reference as the argument (the implementation may swap in a new instance)

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`create`](../../rxdb/interfaces/IRepository.md#create)

***

### createEntityRef() \{#createentityref\}

```ts
createEntityRef(data): EntityInstanceType<T>;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:50

Creates (or reuses) an entity reference

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | [`EntityUpdateData`](../../rxdb/type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Initial field values; `id` is auto-generated when omitted |

#### Returns

[`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The entity instance already attached to the [EntityManager](../../rxdb/interfaces/EntityManager.md) cache

#### Remarks

Regardless of whether the input `id` already exists in the cache, the instance
in the cache is **preferred** (overwrite-style refresh); going through
`rxdb.entityManager.createEntityRef` reuses the same reference semantics and
avoids different call stacks getting two out-of-sync clones.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`createEntityRef`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#createentityref)

***

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:26

Reads entities by query conditions and merges the result rows into the identity map.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | Query conditions |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities corresponding to the result rows (cache hits return the same reference)

#### Remarks

The backfill goes through [SqliteRepositoryBase.mergeQueryCache](../../rxdb-adapter-wa-sqlite/classes/SqliteRepository.md#mergequerycache)
instead of `addQueryCache(result)`: the latter, with `forcedUpdate = false`,
**only creates new entities and never touches cached ones**, so after any write
bypassing the ORM (the commit graph's HEAD CAS, the CAS that enables commit
capability) lands in the database, any further `find()` in this process only
ever reads the stale value in the cache — the CAS clearly pushed `headRevision`
to 1, but reading back gives 0, and the next commit therefore keeps hitting
`head_revision_conflict`. The PGlite side backfills on every read, so the same
code behaves differently on the two backends.

`addQueryCache(result, true)` is not used either: that is whole-row overwrite
plus `modified` reset, which writes a user's unsaved edits into the baseline
and then silently clears them (see `entity-status.ts#applyExternal`).

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`find`](../../rxdb/interfaces/IRepository.md#find)

***

### findByRowIds() \{#findbyrowids\}

```ts
findByRowIds(rowIds, forceRefresh?): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:12

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rowIds` | `bigint`[] |
| `forceRefresh?` | `boolean` |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`findByRowIds`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#findbyrowids)

***

### findOne() \{#findone\}

```ts
findOne(options): Promise<InstanceType<T> | undefined>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:8

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOneOptions"`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt; \| `undefined`&gt;

***

### get() \{#get\}

```ts
get(id): Promise<InstanceType<T>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:7

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

***

### getEntityRef() \{#getentityref\}

```ts
getEntityRef(id): 
  | EntityInstanceType<T>
  | undefined;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:57

Looks up an entity in the current process's entity cache by ID

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity primary key |

#### Returns

  \| [`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;
  \| `undefined`

Returns the instance on a cache hit, `undefined` on a miss (**does not** trigger a database query)

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`getEntityRef`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#getentityref)

***

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef(id): boolean;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:68

Determines whether the current process's entity cache has a given ID

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity primary key |

#### Returns

`boolean`

Returns `true` on a cache hit, otherwise `false`

#### Remarks

Equivalent to `getEntityRef(id) !== undefined`; provided separately so hot
paths like "batch warm-up" and "diff sync" save the cost of one reference
creation / status read.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`hasEntityRef`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#hasentityref)

***

### mergeQueryCache() \{#mergequerycache\}

```ts
protected mergeQueryCache(sqliteSuccessResult): Promise<InstanceType<T>[]>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepositoryBase.d.ts:33

Merges the result rows into the identity map: clean entities get whole-row refresh, dirty entities get field-by-field avoidance of unsaved edits.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../../rxdb-adapter-sqlite-core/interfaces/SqliteSuccessResult.md) | The result set of one SELECT |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities corresponding to the result rows (cache hits return the same reference)

#### Remarks

The division of labor with [addQueryCache](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#addquerycache)
is "read" vs "write": the write path (`create` / `update`) knows what it just
wrote, and whole-row overwrite via `forcedUpdate` is correct there; the read
path gets rows written by **someone else**, which may land on an entity the user
is editing, so only the pair of strategies `state.modified ? mergeExternal :
replace` applies — this is exactly the semantics of
`entity-status.ts#applyExternal`, which explicitly lists "query result backfill"
as one of the three paths that must be separated.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`mergeQueryCache`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#mergequerycache)

***

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:30

Removes an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity to remove (located by `id`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after removal (fields cleared, `local` set to `false`)

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`remove`](../../rxdb/interfaces/IRepository.md#remove)

***

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: packages/rxdb-adapter-sqlite-core/dist/repository/SqliteRepository.d.ts:29

Updates an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity to update (provides `id` and the latest fields) |
| `patch` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Field-level patch; fields not listed are untouched |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after persistence

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`update`](../../rxdb/interfaces/IRepository.md#update)

***

### updateEntity() \{#updateentity\}

```ts
updateEntity(entity, update): void;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:80

Overwrites entity fields with `update`

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The target entity |
| `update` | `InstanceType`&lt;`T`&gt; | The fields to write; the primary key `id` is assigned too (for hydrate scenarios) |

#### Returns

`void`

#### Remarks

Goes through [EntityStatus.applyExternal](../../rxdb/interfaces/EntityStatus.md#applyexternal),
guaranteeing dirty tracking and patch generation take the same path, and that
entities with unsaved edits are avoided field-by-field rather than overwritten
whole-row — a live-query batch backfill can hit entities the user has already
modified, and an unconditional `replace` would silently eat those edits.

#### Inherited from

[`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md).[`updateEntity`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md#updateentity)
