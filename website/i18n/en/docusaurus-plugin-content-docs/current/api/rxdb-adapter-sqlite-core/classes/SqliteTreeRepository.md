---
sidebar_label: 'SqliteTreeRepository⟨T⟩'
---

# SqliteTreeRepository`<T>`

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts#L27)

Repository for tree entities

`findDescendants` / `findAncestors` always use `addQueryCache(result, true)` (forcedUpdate).

This is not just to refresh computed properties such as `hasChildren` — the non-forced path already refreshes computed properties.
forcedUpdate also resets `state.origin` to the database row, thereby counteracting **P0-004**:
a late CREATE/UPDATE event of this tab, via `QueryManager#serialize` → `createEntityRef`
→ `EntityStatus.replace`, rewrites the live entity and its origin back to stale values,
and the subsequent `save()` silently loses the write because `patch === {}`.

The cost: it overwrites the caller's unsaved local edits. Before P0-004 is fixed, **do not** change it back to non-forced,
otherwise the `findAncestors` subscription no longer emits on a second change of the parent
(see "findAncestors subscription: parent change should trigger incremental update" in `shared-tree.suite.ts`).
Kept consistent with `PGliteTreeRepository`.

## Extends

- [`SqliteRepository`](SqliteRepository.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Implements

- [`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md)&lt;`T`&gt;

## Constructors

### Constructor

```ts
new SqliteTreeRepository<T>(adapter, EntityType): SqliteTreeRepository<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L21)

#### Parameters

| Parameter    | Type                                                |
| ------------ | --------------------------------------------------- |
| `adapter`    | [`RxDBAdapterSqliteBase`](RxDBAdapterSqliteBase.md) |
| `EntityType` | `T`                                                 |

#### Returns

`SqliteTreeRepository`&lt;`T`&gt;

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`constructor`](SqliteRepository.md#constructor)

## Properties

### adapter \{#adapter\}

```ts
protected adapter: RxDBAdapterSqliteBase;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L22)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`adapter`](SqliteRepository.md#adapter)

---

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`EntityType`](SqliteRepository.md#entitytype)

---

### metadata \{#metadata\}

```ts
readonly metadata: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L19)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`metadata`](SqliteRepository.md#metadata)

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`rxdb`](SqliteRepository.md#rxdb)

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

[`SqliteRepository`](SqliteRepository.md).[`_STATIC_METHODS`](SqliteRepository.md#_static_methods)

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

[`SqliteRepository`](SqliteRepository.md).[`staticMethods`](SqliteRepository.md#staticmethods)

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

[`SqliteRepository`](SqliteRepository.md).[`addQueryCache`](SqliteRepository.md#addquerycache)

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

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`count`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#count)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`count`](SqliteRepository.md#count)

---

### countAncestors() \{#countancestors\}

```ts
countAncestors(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts#L46)

Queries the number of ancestor nodes

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

#### Remarks

- With entityId given: **excludes the current node**, only counts ancestors
- Without entityId: the number of root nodes

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`countAncestors`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#countancestors)

---

### countDescendants() \{#countdescendants\}

```ts
countDescendants(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts:34](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts#L34)

Queries the number of descendant entities

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

#### Remarks

- With entityId given: **excludes the current node**, only counts descendants
- Without entityId: the total of all root nodes and their descendants

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`countDescendants`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#countdescendants)

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

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`create`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#create)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`create`](SqliteRepository.md#create)

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

[`SqliteRepository`](SqliteRepository.md).[`createEntityRef`](SqliteRepository.md#createentityref)

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

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`find`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#find)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`find`](SqliteRepository.md#find)

---

### findAncestors() \{#findancestors\}

```ts
findAncestors(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts:40](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts#L40)

Queries ancestor nodes

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

- With entityId given: includes the current node + its ancestor nodes
- Without entityId: all root nodes (the start points are all roots; roots have no ancestors above them)

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`findAncestors`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#findancestors)

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

[`SqliteRepository`](SqliteRepository.md).[`findByRowIds`](SqliteRepository.md#findbyrowids)

---

### findDescendants() \{#finddescendants\}

```ts
findDescendants(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteTreeRepository.ts#L28)

Queries descendant entities

#### Parameters

| Parameter | Type                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

- With entityId given: includes the current node + its descendant nodes
- Without entityId: returns all root nodes and their descendants

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`findDescendants`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#finddescendants)

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

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`findOne`](SqliteRepository.md#findone)

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

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`get`](SqliteRepository.md#get)

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

[`SqliteRepository`](SqliteRepository.md).[`getEntityRef`](SqliteRepository.md#getentityref)

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

[`SqliteRepository`](SqliteRepository.md).[`hasEntityRef`](SqliteRepository.md#hasentityref)

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

[`SqliteRepository`](SqliteRepository.md).[`mergeQueryCache`](SqliteRepository.md#mergequerycache)

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

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`remove`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#remove)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`remove`](SqliteRepository.md#remove)

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

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`update`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#update)

#### Inherited from

[`SqliteRepository`](SqliteRepository.md).[`update`](SqliteRepository.md#update)

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

[`SqliteRepository`](SqliteRepository.md).[`updateEntity`](SqliteRepository.md#updateentity)
