---
sidebar_label: 'SqliteRepositoryBase⟨T⟩'
---

# SqliteRepositoryBase`<T>`

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L18)

Repository for operating on entities

## Extends

- [`RepositoryBase`](../../rxdb/classes/RepositoryBase.md)&lt;`T`&gt;

## Extended by

- [`SqliteRepository`](SqliteRepository.md)
- [`SqliteRepository`](../../rxdb-adapter-wa-sqlite/classes/SqliteRepository.md)
- [`SqliteRepository`](../../rxdb-adapter-sqlite/classes/SqliteRepository.md)
- [`SqliteRepository`](../../rxdb-adapter-sqlite-wasm/classes/SqliteRepository.md)
- [`SqliteRepository`](../../rxdb-adapter-sqliteai/classes/SqliteRepository.md)

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Constructors

### Constructor

```ts
new SqliteRepositoryBase<T>(adapter, EntityType): SqliteRepositoryBase<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L21)

#### Parameters

| Parameter    | Type                                                |
| ------------ | --------------------------------------------------- |
| `adapter`    | [`RxDBAdapterSqliteBase`](RxDBAdapterSqliteBase.md) |
| `EntityType` | `T`                                                 |

#### Returns

`SqliteRepositoryBase`&lt;`T`&gt;

#### Overrides

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`constructor`](../../rxdb/classes/RepositoryBase.md#constructor)

## Properties

### adapter \{#adapter\}

```ts
protected adapter: RxDBAdapterSqliteBase;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L22)

---

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`EntityType`](../../rxdb/classes/RepositoryBase.md#entitytype)

---

### metadata \{#metadata\}

```ts
readonly metadata: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/repository/SqliteRepositoryBase.ts#L19)

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

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`_STATIC_METHODS`](../../rxdb/classes/RepositoryBase.md#_static_methods)

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

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`staticMethods`](../../rxdb/classes/RepositoryBase.md#staticmethods)

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

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`createEntityRef`](../../rxdb/classes/RepositoryBase.md#createentityref)

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

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`getEntityRef`](../../rxdb/classes/RepositoryBase.md#getentityref)

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

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`hasEntityRef`](../../rxdb/classes/RepositoryBase.md#hasentityref)

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

The division of labor with [addQueryCache](#addquerycache) is "read" vs "write": the write path (`create` / `update`) knows
what it just wrote, and overwriting the whole row with `forcedUpdate` is correct; the read path receives rows written by **someone else**, which may
land on an entity the user is editing, so only the pair of strategies `state.modified ? mergeExternal : replace`
can be used — this is exactly the semantics of `entity-status.ts#applyExternal`, which explicitly lists "query result backfill"
as one of the three paths that must be branched.

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

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`updateEntity`](../../rxdb/classes/RepositoryBase.md#updateentity)
