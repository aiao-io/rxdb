---
sidebar_label: "TreeRepository⟨T, RepositoryType⟩"
---

# TreeRepository`<T, RepositoryType>`

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L42)

Tree structure entity repository
Decides the concrete operations of an entity based on configuration

## Example

```typescript
// ✅ Correct: extend TreeAdjacencyListEntityBase
// No need to write repository: `repository: 'TreeRepository'` and `features.tree` are both declared by the base class
// and inherited along the prototype chain (declare them explicitly in your own @Entity to override)
@Entity({ name: 'Category' })
class Category extends TreeAdjacencyListEntityBase {
  name!: string;
}

// Tree query methods are available
Category.findDescendants({ entityId: 'root-id' });
Category.findAncestors({ entityId: 'leaf-id' });

// ❌ Wrong: only extends EntityBase, does not implement ITreeEntity
@Entity({ name: 'User' })
class User extends EntityBase {
  name!: string;
}

// Compile error: User does not satisfy TreeRepository's type constraint
// User.findDescendants({ entityId: 'id' }); // TypeScript error
```

## Extends

- [`Repository`](../../rxdb/classes/Repository.md)&lt;`T`, `RepositoryType`&gt;

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) & (new (...`args`) => [`ITreeEntity`](../interfaces/ITreeEntity.md)) | - | Must be an entity type implementing the ITreeEntity interface (usually extending TreeAdjacencyListEntityBase) |
| <a id="type-parameter-repositorytype"></a> `RepositoryType` *extends* [`ITreeRepository`](../interfaces/ITreeRepository.md)&lt;`T`&gt; | [`ITreeRepository`](../interfaces/ITreeRepository.md)&lt;`T`&gt; | - |

## Constructors

### Constructor

```ts
new TreeRepository<T, RepositoryType>(rxdb, EntityType): TreeRepository<T, RepositoryType>;
```

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L50)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `rxdb` | [`RxDB`](../../rxdb/classes/RxDB.md) |
| `EntityType` | `T` |

#### Returns

`TreeRepository`&lt;`T`, `RepositoryType`&gt;

#### Overrides

[`Repository`](../../rxdb/classes/Repository.md).[`constructor`](../../rxdb/classes/Repository.md#constructor)

## Properties

### \_setLocal \{#_setlocal\}

```ts
protected _setLocal: (entity) => void;
```

Defined in: rxdb/dist/repository/Repository.d.ts:174

Sets the state to local

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; |

#### Returns

`void`

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`_setLocal`](../../rxdb/classes/Repository.md#_setlocal)

***

### \_setLocals \{#_setlocals\}

```ts
protected _setLocals: (entities) => void;
```

Defined in: rxdb/dist/repository/Repository.d.ts:175

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `entities` | `InstanceType`&lt;`T`&gt;[] |

#### Returns

`void`

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`_setLocals`](../../rxdb/classes/Repository.md#_setlocals)

***

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`EntityType`](../../rxdb/classes/Repository.md#entitytype)

***

### local$ \{#local\}

```ts
protected readonly local$: Observable<RepositoryType>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:21

Local repository

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`local$`](../../rxdb/classes/Repository.md#local)

***

### primary$ \{#primary\}

```ts
protected readonly primary$: Observable<RepositoryType>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:31

Primary repository (chooses local or remote based on SyncOptions)
- SyncType.None + remote only: uses remote$
- Otherwise: uses local$

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`primary$`](../../rxdb/classes/Repository.md#primary)

***

### queryManager \{#querymanager\}

```ts
protected readonly queryManager: QueryManager<T>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:35

Query cache manager

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`queryManager`](../../rxdb/classes/Repository.md#querymanager)

***

### remote$ \{#remote\}

```ts
protected readonly remote$: Observable<IRepository<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:25

Remote repository

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`remote$`](../../rxdb/classes/Repository.md#remote)

***

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`rxdb`](../../rxdb/classes/Repository.md#rxdb)

***

### sync \{#sync\}

```ts
readonly sync: SyncOptions;
```

Defined in: rxdb/dist/repository/Repository.d.ts:43

The effective sync configuration of this instance for this entity (resolved via `rxdb.entitySync.resolve`)

#### Remarks

Read-only: entities overridden by `syncOverrides` receive a frozen snapshot of the instance, and mutating its fields at runtime throws `TypeError`. For non-overridden entities this happens to be the original decorator- or library-level configuration object — do not mutate it either, other instances are reading it.

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`sync`](../../rxdb/classes/Repository.md#sync)

***

### \_STATIC\_METHODS \{#_static_methods\}

```ts
protected static _STATIC_METHODS: string[];
```

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L48)

The list of "static method names" declared by a subclass, used to inject methods like `User.findOne(...)` onto the entity class (attached at [EntityManager.init](../../rxdb/interfaces/EntityManager.md#init)).

#### Remarks

Declared as a class field `static` rather than assigned in the constructor — field initialization merges **bottom-up** along the `extends` chain, so a subclass-defined `_STATIC_METHODS` is never lost; runtime reflection reads the current class's field.

#### Overrides

[`Repository`](../../rxdb/classes/Repository.md).[`_STATIC_METHODS`](../../rxdb/classes/Repository.md#_static_methods)

## Accessors

### staticMethods \{#staticmethods\}

#### Get Signature

```ts
get static staticMethods(): string[];
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:37

All static method names declared by the current class (including every level of the inheritance chain)

##### Remarks

Does **not** accumulate along the prototype chain: each subclass writes its own `_STATIC_METHODS`, avoiding a situation where the runtime reflects ancestor names like `get` / `findOne` and a descendant then accidentally overrides them once more.

##### Returns

`string`[]

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`staticMethods`](../../rxdb/classes/Repository.md#staticmethods)

## Methods

### count() \{#count\}

```ts
count(options): Observable<number>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:107

Counts entities

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;`T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`number`&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`count`](../../rxdb/classes/Repository.md#count)

***

### countAncestors() \{#countancestors\}

```ts
countAncestors(options): Observable<number>;
```

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L112)

Counts ancestors

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Observable`&lt;`number`&gt;

***

### countDescendants() \{#countdescendants\}

```ts
countDescendants(options): Observable<number>;
```

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L82)

Counts descendants

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Observable`&lt;`number`&gt;

***

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:115

Creates an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance to create |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Throws

[RxDBReadOnlyError](../../rxdb/classes/RxDBReadOnlyError.md) read-only instance (delivered as a rejected Promise)

#### Throws

[PermissionDeniedError](../../rxdb/classes/PermissionDeniedError.md) the entity declares `create: 'system'` (delivered as a rejected Promise)

#### Throws

[WorktreeTableSetMismatchError](../../rxdb/classes/WorktreeTableSetMismatchError.md) the entity was not created on the table set currently mounted by this instance (delivered as a rejected Promise)

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`create`](../../rxdb/classes/Repository.md#create)

***

### createEntityRef() \{#createentityref\}

```ts
createEntityRef(data): EntityInstanceType<T>;
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:50

Creates (or reuses) an entity reference

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `data` | [`EntityUpdateData`](../../rxdb/type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Initial field values; `id` is generated automatically when omitted |

#### Returns

[`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The entity instance attached to the [EntityManager](../../rxdb/interfaces/EntityManager.md) cache

#### Remarks

Whether or not the input `id` already exists in the cache, the cached instance is **preferentially** returned (refreshed by overwrite); going through `rxdb.entityManager.createEntityRef` reuses the same reference semantics so that different call stacks never end up with two out-of-sync clones.

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`createEntityRef`](../../rxdb/classes/Repository.md#createentityref)

***

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: rxdb/dist/repository/Repository.d.ts:61

#### Returns

`void`

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`destroy`](../../rxdb/classes/Repository.md#destroy)

***

### find() \{#find\}

```ts
find(options): Observable<InstanceType<T>[]>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:81

Finds multiple entities

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;`T`&gt; | Query options, including the where condition, limit, offset, etc. |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`find`](../../rxdb/classes/Repository.md#find)

***

### findAll() \{#findall\}

```ts
findAll(options): Observable<InstanceType<T>[]>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:87

Finds all entities

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindAllOptions`](../../rxdb/interfaces/FindAllOptions.md)&lt;`T`&gt; | Query options, including the where condition and ordering (no limit) |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`findAll`](../../rxdb/classes/Repository.md#findall)

***

### findAncestors() \{#findancestors\}

```ts
findAncestors(options): Observable<InstanceType<T>[]>;
```

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L95)

Finds ancestors

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

***

### findByCursor() \{#findbycursor\}

```ts
findByCursor(options): Observable<InstanceType<T>[]>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:102

Paginated query via cursor

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindByCursorOptions`](../../rxdb/interfaces/FindByCursorOptions.md)&lt;`T`&gt; | Cursor pagination options, including orderBy and the before/after cursors |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

`before` (backward paging) requires **reversing the ordering before querying**: `limit` in SQL always truncates from the start of the result set, so keeping the caller's forward ordering would return the very first page of the whole collection instead of the page right before the cursor. Therefore the `orderBy` is reversed when handed to the adapter, and the array is restored to the caller's requested order before being returned — the incremental merge (the findByCursor branch of `merge_create.ts`) also sorts by `options.orderBy` before slicing; both sides must use the same order.

The cursor anchors on the **row** of `after` / `before`, not on its value at call time: every execution slices the window by that row's currently persisted ordering key, so when the anchor row's ordering key is edited, adjacent pages move with it without needing to be reopened.

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`findByCursor`](../../rxdb/classes/Repository.md#findbycursor)

***

### findDescendants() \{#finddescendants\}

```ts
findDescendants(options): Observable<InstanceType<T>[]>;
```

Defined in: [rxdb-plugin-tree/src/repository/TreeRepository.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/repository/TreeRepository.ts#L65)

Finds descendants

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

***

### findOne() \{#findone\}

```ts
findOne(options): Observable<InstanceType<T> | null>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:71

Finds one entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOneOptions`](../../rxdb/interfaces/FindOneOptions.md)&lt;`T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt; \| `null`&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`findOne`](../../rxdb/classes/Repository.md#findone)

***

### findOneOrFail() \{#findoneorfail\}

```ts
findOneOrFail(options): Observable<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:76

Finds one entity, throws when none is found

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`FindOneOrFailOptions`](../../rxdb/interfaces/FindOneOrFailOptions.md)&lt;`T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`findOneOrFail`](../../rxdb/classes/Repository.md#findoneorfail)

***

### get() \{#get\}

```ts
get(id): Observable<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:66

Gets an entity by id

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity's unique identifier |

#### Returns

`Observable`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`get`](../../rxdb/classes/Repository.md#get)

***

### getEntityRef() \{#getentityref\}

```ts
getEntityRef(id): 
  | EntityInstanceType<T>
  | undefined;
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:57

Looks up an entity in the current process's entity cache by ID

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity primary key |

#### Returns

  \| [`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;
  \| `undefined`

Returns the instance on cache hit, `undefined` on miss (**does not** trigger a database query)

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`getEntityRef`](../../rxdb/classes/Repository.md#getentityref)

***

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef(id): boolean;
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:68

Determines whether the given ID is present in the current process's entity cache

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Entity primary key |

#### Returns

`boolean`

Returns `true` on cache hit, otherwise `false`

#### Remarks

Equivalent to `getEntityRef(id) !== undefined`; provided separately so hot paths like "batch warm-up" and "diff sync" save the cost of one reference creation / state read.

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`hasEntityRef`](../../rxdb/classes/Repository.md#hasentityref)

***

### rawQuery() \{#rawquery\}

```ts
protected rawQuery(sql, params?): Promise<RawQueryResult>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:170

Executes a raw SQL query
For scenarios like conditional UPDATE that need to bypass the ORM

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `sql` | `string` | SQL statement |
| `params?` | `unknown`[] | Bind parameters |

#### Returns

`Promise`&lt;[`RawQueryResult`](../../rxdb/interfaces/RawQueryResult.md)&gt;

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`rawQuery`](../../rxdb/classes/Repository.md#rawquery)

***

### refreshAllQueries() \{#refreshallqueries\}

```ts
refreshAllQueries(): void;
```

Defined in: rxdb/dist/repository/Repository.d.ts:60

**`Internal`**

Re-runs all live queries of this repository (US-314 B1.4): this instance switched the mounted table set, subscriptions are kept as-is, and results are emitted from the new table set.

#### Returns

`void`

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`refreshAllQueries`](../../rxdb/classes/Repository.md#refreshallqueries)

***

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:136

Deletes an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance to delete |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Throws

[RxDBReadOnlyError](../../rxdb/classes/RxDBReadOnlyError.md) read-only instance (delivered as a rejected Promise)

#### Throws

[PermissionDeniedError](../../rxdb/classes/PermissionDeniedError.md) the entity declares `delete: 'system'` (delivered as a rejected Promise)

#### Throws

[WorktreeTableSetMismatchError](../../rxdb/classes/WorktreeTableSetMismatchError.md) the entity was not read from the table set currently mounted by this instance (delivered as a rejected Promise)

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`remove`](../../rxdb/classes/Repository.md#remove)

***

### reorder() \{#reorder\}

```ts
reorder(id, target): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:163

Moves a row to a target position (only for entities with `manualOrder` enabled)

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `id` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | Id of the row being moved |
| `target` | [`ReorderTarget`](../../rxdb/type-aliases/ReorderTarget.md)&lt;[`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt;&gt; | Target position: adjacent neighbors `{ prevId, nextId }`, or append to the end of a group `{ group }` (the key happens to be the grouping field; whole-table ordering is `{}`); neighbor targets may carry `expectedGroup`, which rejects neighbors that changed groups inside the transaction. Fields of the two target kinds must not be mixed (`{ group, expectedGroup }` is rejected as `invalidTarget`) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity after the move; returned unchanged with zero writes when it is already at the target position

#### Throws

[RxDBReadOnlyError](../../rxdb/classes/RxDBReadOnlyError.md) read-only instance, thrown before the transaction opens

#### Throws

[PermissionDeniedError](../../rxdb/classes/PermissionDeniedError.md) the entity declares `update: 'system'`, thrown before the transaction opens

#### Throws

[SortOrderError](../../rxdb/classes/SortOrderError.md) see [SortOrderErrorReason](../../rxdb/type-aliases/SortOrderErrorReason.md) (a neighbor no longer in `expectedGroup` is `'staleTarget'`);
  thrown before any write is committed

#### Remarks

The input is a move intent, not a final arrangement: reading the neighbors, re-checking adjacency, computing keys and writing all happen inside the same transaction on the primary adapter. A move within a group writes only `sortOrder`; a cross-group move writes only the grouping field and `sortOrder` — other uncommitted changes on the instance are not saved along. Rejected when the primary side is remote-only or QueryCache — locally there is only a subset of the sequence, and computing keys from it would diverge from the remote.

#### Example

```typescript
const repository = rxdb.entityManager.getRepository(Category);
await repository.reorder(movedId, { prevId: aboveId, nextId: belowId });
await repository.reorder(movedId, { group: {} }); // whole-table ordering: move to the end
await todos.reorder(todoId, { group: { completed: true } }); // grouped ordering: move to the end of the "completed" group
```

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`reorder`](../../rxdb/classes/Repository.md#reorder)

***

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: rxdb/dist/repository/Repository.d.ts:128

Updates an entity

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity instance to update |
| `patch` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | Partial update data |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

#### Throws

[RxDBReadOnlyError](../../rxdb/classes/RxDBReadOnlyError.md) read-only instance (delivered as a rejected Promise)

#### Throws

[PermissionDeniedError](../../rxdb/classes/PermissionDeniedError.md) the entity declares `update: 'system'` (delivered as a rejected Promise)

#### Throws

[SortOrderError](../../rxdb/classes/SortOrderError.md) invalid manual ordering key; changing the grouping field while the primary side is remote-only / QueryCache

#### Throws

[WorktreeTableSetMismatchError](../../rxdb/classes/WorktreeTableSetMismatchError.md) the entity was not read from the table set currently mounted by this instance (delivered as a rejected Promise)

#### Remarks

When a grouped manual-ordering entity changes its grouping field without providing `sortOrder`, it is appended to the end of the new group inside the primary adapter's transaction (US-028 AC#16).

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`update`](../../rxdb/classes/Repository.md#update)

***

### updateEntity() \{#updateentity\}

```ts
updateEntity(entity, update): void;
```

Defined in: rxdb/dist/repository/RepositoryBase.d.ts:80

Overwrites entity fields with `update`

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | Target entity |
| `update` | `InstanceType`&lt;`T`&gt; | Fields to write; the primary key `id` is also assigned (for hydrate scenarios) |

#### Returns

`void`

#### Remarks

Goes through [EntityStatus.applyExternal](../../rxdb/interfaces/EntityStatus.md#applyexternal), ensuring dirty tracking and patch generation take the same path, and when the entity has unsaved edits it avoids field by field instead of overwriting the whole row — batch backfills of live queries can hit entities the user has already modified, and an unconditional `replace` would silently eat those edits.

#### Inherited from

[`Repository`](../../rxdb/classes/Repository.md).[`updateEntity`](../../rxdb/classes/Repository.md#updateentity)
