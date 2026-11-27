---
sidebar_label: 'Repository⟨T, RT⟩'
---

# Repository`<T, RT>`

Defined in: [packages/rxdb/src/repository/Repository.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L80)

Entity repository
Decides the concrete operations of an entity based on configuration

## Extends

- [`RepositoryBase`](RepositoryBase.md)&lt;`T`&gt;

## Extended by

- [`GraphRepository`](../../rxdb-plugin-graph/classes/GraphRepository.md)
- [`TreeRepository`](../../rxdb-plugin-tree/classes/TreeRepository.md)

## Type Parameters

| Type Parameter                                                                                         | Default type                                             |
| ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md)              | -                                                        |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; | [`IRepository`](../interfaces/IRepository.md)&lt;`T`&gt; |

## Constructors

### Constructor

```ts
new Repository<T, RT>(rxdb, EntityType): Repository<T, RT>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:169](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L169)

#### Parameters

| Parameter    | Type              |
| ------------ | ----------------- |
| `rxdb`       | [`RxDB`](RxDB.md) |
| `EntityType` | `T`               |

#### Returns

`Repository`&lt;`T`, `RT`&gt;

#### Overrides

[`RepositoryBase`](RepositoryBase.md).[`constructor`](RepositoryBase.md#constructor)

## Properties

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L44)

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`EntityType`](RepositoryBase.md#entitytype)

---

### local$ \{#local\}

```ts
protected readonly local$: Observable<RT>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L141)

Local repository

---

### primary$ \{#primary\}

```ts
protected readonly primary$: Observable<RT>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L153)

Primary repository (chooses local or remote based on SyncOptions)

- SyncType.None + remote only: uses remote$
- Otherwise: uses local$

---

### queryManager \{#querymanager\}

```ts
protected readonly queryManager: QueryManager<T>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L158)

Query cache manager

---

### remote$ \{#remote\}

```ts
protected readonly remote$: Observable<IRepository<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L146)

Remote repository

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L43)

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`rxdb`](RepositoryBase.md#rxdb)

---

### sync \{#sync\}

```ts
readonly sync: SyncOptions;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L167)

This instance's effective sync configuration for the entity (resolved via `rxdb.entitySync.resolve`)

#### Remarks

Read-only: entities covered by `syncOverrides` get an instance-frozen snapshot, and mutating its fields at runtime throws `TypeError`.
For uncovered entities this happens to be the decorator or database-level config object itself — do not mutate it either, other instances are reading it.

---

### \_STATIC\_METHODS \{#_static_methods\}

```ts
protected static _STATIC_METHODS: string[];
```

Defined in: [packages/rxdb/src/repository/Repository.ts:127](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L127)

The list of "static method names" declared by subclasses, used to inject methods like `User.findOne(...)`
onto the entity class (mounted during [EntityManager.init](../interfaces/EntityManager.md#init)).

#### Remarks

Uses a class field `static` rather than assigning in the constructor — field initialization merges **bottom-up**
along the `extends` chain, so the `_STATIC_METHODS` defined by subclasses is not lost; runtime reflection reads the current class's field.

#### Overrides

[`RepositoryBase`](RepositoryBase.md).[`_STATIC_METHODS`](RepositoryBase.md#_static_methods)

## Accessors

### staticMethods \{#staticmethods\}

#### Get Signature

```ts
get static staticMethods(): string[];
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L38)

All static method names declared by the current class (including every layer of the inheritance chain)

##### Remarks

**No** accumulation along the prototype chain: each subclass writes its own `_STATIC_METHODS`, avoiding runtime
reflection of ancestor names like `get` / `findOne` being accidentally overridden once more by a descendant.

##### Returns

`string`[]

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`staticMethods`](RepositoryBase.md#staticmethods)

## Methods

### \_setLocal() \{#_setlocal\}

```ts
protected _setLocal(entity): void;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:563](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L563)

Sets the state to local

#### Parameters

| Parameter | Type                      |
| --------- | ------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; |

#### Returns

`void`

---

### \_setLocals() \{#_setlocals\}

```ts
protected _setLocals(entities): void;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:575](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L575)

#### Parameters

| Parameter  | Type                        |
| ---------- | --------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`void`

---

### count() \{#count\}

```ts
count(options): Observable<number>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:427](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L427)

Queries the number of entities

#### Parameters

| Parameter | Type                                                       | Description                                  |
| --------- | ---------------------------------------------------------- | -------------------------------------------- |
| `options` | [`CountOptions`](../interfaces/CountOptions.md)&lt;`T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`number`&gt;

---

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:443](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L443)

Creates an entity

#### Parameters

| Parameter | Type                      | Description                   |
| --------- | ------------------------- | ----------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity instance to create |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Throws

[RxDBReadOnlyError](RxDBReadOnlyError.md) read-only instance (delivered as a rejected Promise)

#### Throws

[PermissionDeniedError](PermissionDeniedError.md) the entity declares `create: 'system'` (delivered as a rejected Promise)

#### Throws

[WorktreeTableSetMismatchError](WorktreeTableSetMismatchError.md) the entity was not created on the table set this instance currently mounts (delivered as a rejected Promise)

---

### createEntityRef() \{#createentityref\}

```ts
createEntityRef(data): EntityInstanceType<T>;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L58)

Creates (or reuses) an entity reference

#### Parameters

| Parameter | Type                                                                 | Description                                                   |
| --------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| `data`    | [`EntityUpdateData`](../type-aliases/EntityUpdateData.md)&lt;`T`&gt; | The initial field values; `id` is auto-generated when omitted |

#### Returns

[`EntityInstanceType`](../type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The entity instance mounted in the [EntityManager](../interfaces/EntityManager.md) cache

#### Remarks

Regardless of whether the input `id` already exists in the cache, the cached instance is **preferentially** returned (overwriting refresh);
it goes through `rxdb.entityManager.createEntityRef` to reuse the same reference semantics and avoid
different call stacks getting two out-of-sync clones.

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`createEntityRef`](RepositoryBase.md#createentityref)

---

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:230](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L230)

#### Returns

`void`

---

### find() \{#find\}

```ts
find(options): Observable<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:319](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L319)

Queries multiple entities

#### Parameters

| Parameter | Type                                                     | Description                                                       |
| --------- | -------------------------------------------------------- | ----------------------------------------------------------------- |
| `options` | [`FindOptions`](../interfaces/FindOptions.md)&lt;`T`&gt; | Query options, including the where condition, limit, offset, etc. |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

---

### findAll() \{#findall\}

```ts
findAll(options): Observable<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:357](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L357)

Queries all entities

#### Parameters

| Parameter | Type                                                           | Description                                                                   |
| --------- | -------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `options` | [`FindAllOptions`](../interfaces/FindAllOptions.md)&lt;`T`&gt; | Query options, including the where condition and ordering (no quantity limit) |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

---

### findByCursor() \{#findbycursor\}

```ts
findByCursor(options): Observable<InstanceType<T>[]>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:386](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L386)

Paginated query via cursor

#### Parameters

| Parameter | Type                                                                     | Description                                                              |
| --------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| `options` | [`FindByCursorOptions`](../interfaces/FindByCursorOptions.md)&lt;`T`&gt; | Cursor pagination options, including orderBy and the before/after cursor |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

`before` (backward paging) requires **reversing the ordering before querying**: `limit` in SQL always truncates from the head of the result set,
so keeping the caller's forward ordering would only return the very first page of the whole collection, not the page right before the cursor.
Therefore `orderBy` is reversed when sent down to the adapter, and the array is restored to the caller-requested order before returning —
the incremental merge (the findByCursor branch of `merge_create.ts`) also sorts by `options.orderBy` before slicing,
so both sides must be in the same order.

The cursor anchors on the **row** `after` / `before`, not on its value at call time: each execution slices the window by that row's currently
persisted ordering key; after the anchor row's ordering key is edited, the adjacent pages move with it without needing to be reopened.

---

### findOne() \{#findone\}

```ts
findOne(options): Observable<InstanceType<T> | null>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:278](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L278)

Finds one entity

#### Parameters

| Parameter | Type                                                           | Description                                  |
| --------- | -------------------------------------------------------------- | -------------------------------------------- |
| `options` | [`FindOneOptions`](../interfaces/FindOneOptions.md)&lt;`T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt; \| `null`&gt;

---

### findOneOrFail() \{#findoneorfail\}

```ts
findOneOrFail(options): Observable<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:297](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L297)

Finds one entity, throws when not found

#### Parameters

| Parameter | Type                                                                       | Description                                  |
| --------- | -------------------------------------------------------------------------- | -------------------------------------------- |
| `options` | [`FindOneOrFailOptions`](../interfaces/FindOneOrFailOptions.md)&lt;`T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;&gt;

---

### get() \{#get\}

```ts
get(id): Observable<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:244](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L244)

Gets an entity by id

#### Parameters

| Parameter | Type                                                                             | Description                    |
| --------- | -------------------------------------------------------------------------------- | ------------------------------ |
| `id`      | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity's unique identifier |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;&gt;

---

### getEntityRef() \{#getentityref\}

```ts
getEntityRef(id):
  | EntityInstanceType<T>
  | undefined;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L68)

Looks up an entity by ID in the current process's entity cache

#### Parameters

| Parameter | Type                                                                             | Description        |
| --------- | -------------------------------------------------------------------------------- | ------------------ |
| `id`      | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity primary key |

#### Returns

\| [`EntityInstanceType`](../type-aliases/EntityInstanceType.md)&lt;`T`&gt;
\| `undefined`

Returns the instance on a cache hit, `undefined` on a miss (**does not** trigger a database query)

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`getEntityRef`](RepositoryBase.md#getentityref)

---

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef(id): boolean;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L82)

Determines whether the given ID exists in the current process's entity cache

#### Parameters

| Parameter | Type                                                                             | Description        |
| --------- | -------------------------------------------------------------------------------- | ------------------ |
| `id`      | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity primary key |

#### Returns

`boolean`

`true` on a cache hit, otherwise `false`

#### Remarks

Equivalent to `getEntityRef(id) !== undefined`; provided separately so that hot paths like "bulk preheating" and
"diff sync" save the cost of one reference creation / state fetch.

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`hasEntityRef`](RepositoryBase.md#hasentityref)

---

### rawQuery() \{#rawquery\}

```ts
protected rawQuery(sql, params?): Promise<RawQueryResult>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:552](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L552)

Executes a raw SQL query
Used for scenarios like conditional UPDATE that need to bypass the ORM

#### Parameters

| Parameter | Type        | Description     |
| --------- | ----------- | --------------- |
| `sql`     | `string`    | SQL statement   |
| `params?` | `unknown`[] | Bind parameters |

#### Returns

`Promise`&lt;[`RawQueryResult`](../interfaces/RawQueryResult.md)&gt;

---

### refreshAllQueries() \{#refreshallqueries\}

```ts
refreshAllQueries(): void;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:226](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L226)

**`Internal`**

Re-runs all live queries of this repository (US-314 B1.4): this instance re-mounted its table set; subscriptions are kept as-is and emit results from the new set.

#### Returns

`void`

---

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:495](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L495)

Deletes an entity

#### Parameters

| Parameter | Type                      | Description                   |
| --------- | ------------------------- | ----------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity instance to delete |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Throws

[RxDBReadOnlyError](RxDBReadOnlyError.md) read-only instance (delivered as a rejected Promise)

#### Throws

[PermissionDeniedError](PermissionDeniedError.md) the entity declares `delete: 'system'` (delivered as a rejected Promise)

#### Throws

[WorktreeTableSetMismatchError](WorktreeTableSetMismatchError.md) the entity was not read from the table set this instance currently mounts (delivered as a rejected Promise)

---

### reorder() \{#reorder\}

```ts
reorder(id, target): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:529](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L529)

Moves a row to the target position (only for entities with `manualOrder` enabled)

#### Parameters

| Parameter | Type                                                                                                                                        | Description                                                                                                                                                                                                                                                                                                                                                                                                               |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | [`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt;                                                            | The id of the row being moved                                                                                                                                                                                                                                                                                                                                                                                             |
| `target`  | [`ReorderTarget`](../type-aliases/ReorderTarget.md)&lt;[`EntityStaticType`](../type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt;&gt; | The target position: the neighboring pair `{ prevId, nextId }`, or appending to the end of a group `{ group }` (the key happens to be the grouping field, `{}` for whole-table ordering); a neighbor target may carry `expectedGroup`, rejecting neighbors that already changed groups inside the transaction. Fields of the two target kinds cannot be mixed (`{ group, expectedGroup }` is rejected as `invalidTarget`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after the move; returned as-is with zero writes when already at the target position

#### Throws

[RxDBReadOnlyError](RxDBReadOnlyError.md) read-only instance, thrown before opening the transaction

#### Throws

[PermissionDeniedError](PermissionDeniedError.md) the entity declares `update: 'system'`, thrown before opening the transaction

#### Throws

[SortOrderError](SortOrderError.md) see [SortOrderErrorReason](../type-aliases/SortOrderErrorReason.md) (`'staleTarget'` when a neighbor is no longer in `expectedGroup`);
when thrown, not a single write has been committed

#### Remarks

The input is a move intent rather than the final arrangement: reading neighbors, rechecking adjacency, computing keys and writing all happen inside the primary adapter's same transaction,
an intra-group move only writes `sortOrder`, a cross-group move only writes the grouping field and `sortOrder`, without also saving other uncommitted changes on the instance.
Rejected when the primary side is remote-only or QueryCache — locally there is only a subset of the sequence, and computing keys from it would disagree with the remote.

#### Example

```typescript
const repository = rxdb.entityManager.getRepository(Category);
await repository.reorder(movedId, { prevId: aboveId, nextId: belowId });
await repository.reorder(movedId, { group: {} }); // whole-table ordering: move to the end
await todos.reorder(todoId, { group: { completed: true } }); // grouped ordering: move to the end of the "completed" group
```

---

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb/src/repository/Repository.ts:472](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/Repository.ts#L472)

Updates an entity

#### Parameters

| Parameter | Type                                       | Description                   |
| --------- | ------------------------------------------ | ----------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                  | The entity instance to update |
| `patch`   | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Partial update data           |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Throws

[RxDBReadOnlyError](RxDBReadOnlyError.md) read-only instance (delivered as a rejected Promise)

#### Throws

[PermissionDeniedError](PermissionDeniedError.md) the entity declares `update: 'system'` (delivered as a rejected Promise)

#### Throws

[SortOrderError](SortOrderError.md) the manual ordering key is invalid; changing the grouping field lands on a remote-only / QueryCache primary side

#### Throws

[WorktreeTableSetMismatchError](WorktreeTableSetMismatchError.md) the entity was not read from the table set this instance currently mounts (delivered as a rejected Promise)

#### Remarks

When a grouped manually ordered entity changes its grouping field without providing `sortOrder`, it is appended to the end of the new group inside the primary adapter's transaction (US-028 AC#16).

---

### updateEntity() \{#updateentity\}

```ts
updateEntity(entity, update): void;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L97)

Overwrites the entity fields with `update`

#### Parameters

| Parameter | Type                      | Description                                                                          |
| --------- | ------------------------- | ------------------------------------------------------------------------------------ |
| `entity`  | `InstanceType`&lt;`T`&gt; | The target entity                                                                    |
| `update`  | `InstanceType`&lt;`T`&gt; | The fields to write; the primary key `id` is also assigned (for hydration scenarios) |

#### Returns

`void`

#### Remarks

Goes through [EntityStatus.applyExternal](../interfaces/EntityStatus.md#applyexternal), ensuring dirty tracking and patch generation take the same path,
and dodges field by field instead of overwriting the whole row when the entity has unsaved edits — bulk backfill of live queries can hit
entities the user already changed, and an unconditional `replace` would silently eat those edits.

#### Inherited from

[`RepositoryBase`](RepositoryBase.md).[`updateEntity`](RepositoryBase.md#updateentity)

---

### writeMutations()? \{#writemutations\}

Optional batch-write hook for repository implementations. The local primary adapter calls it for `saveMany`, `mutations`, and `save()` with multiple entities.

Normalize the mutations before calling `next()`. After `next()` returns, the supplied transaction executor can read rows written by the batch. Throwing rolls back the batch in storage. Entity objects updated in memory by `next()` retain those updates.

The hook does not run for remote-only writes, QueryCache primary writes, or writes performed directly through a transaction executor.
