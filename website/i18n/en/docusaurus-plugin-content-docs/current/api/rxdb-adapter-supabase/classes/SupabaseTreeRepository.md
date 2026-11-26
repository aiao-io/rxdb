---
sidebar_label: "SupabaseTreeRepository⟨T⟩"
---

# SupabaseTreeRepository`<T>`

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts#L36)

Supabase Tree Repository
Provides query operations on tree structures

## Remarks

**Does not use** recursive CTEs and depends on no database functions like
`get_descendants` / `get_ancestors` — the implementation sends a `select` per
level (one `in('parentId', ...)` per level) and expands step by step. So
traversing a subtree of depth N takes N round trips; mind the latency on deep
trees. Ancestor chains are likewise queried bottom-up hop by hop.

The comment previously written here said "uses PostgreSQL's recursive CTE",
which did not match the implementation (SUPA-023).

## Extends

- [`SupabaseRepository`](SupabaseRepository.md)&lt;`T`&gt;

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Implements

- [`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md)&lt;`T`&gt;

## Constructors

### Constructor

```ts
new SupabaseTreeRepository<T>(adapter, EntityType): SupabaseTreeRepository<T>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts#L37)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSupabase`](RxDBAdapterSupabase.md) |
| `EntityType` | `T` |

#### Returns

`SupabaseTreeRepository`&lt;`T`&gt;

#### Overrides

[`SupabaseRepository`](SupabaseRepository.md).[`constructor`](SupabaseRepository.md#constructor)

## Properties

### adapter \{#adapter\}

```ts
protected readonly adapter: RxDBAdapterSupabase;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L103)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`adapter`](SupabaseRepository.md#adapter)

***

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:20

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`EntityType`](SupabaseRepository.md#entitytype)

***

### metadata \{#metadata\}

```ts
protected readonly metadata: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L100)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`metadata`](SupabaseRepository.md#metadata)

***

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`rxdb`](SupabaseRepository.md#rxdb)

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

[`SupabaseRepository`](SupabaseRepository.md).[`_STATIC_METHODS`](SupabaseRepository.md#_static_methods)

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

[`SupabaseRepository`](SupabaseRepository.md).[`staticMethods`](SupabaseRepository.md#staticmethods)

## Methods

### buildSelectFields() \{#buildselectfields\}

```ts
buildSelectFields(where, fields?): string;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L301)

Builds the SELECT fields including the embeds needed by relation conditions.

#### Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `where` | `RepositoryRuleGroup` \| `undefined` | `undefined` | The query conditions |
| `fields?` | `string` | `'*'` | The columns to return for the root entity |

#### Returns

`string`

The PostgREST SELECT expression with relation embeds

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`buildSelectFields`](SupabaseRepository.md#buildselectfields)

***

### column\_name() \{#column_name\}

```ts
protected column_name(field): string;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:313](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L313)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `field` | `string` |

#### Returns

`string`

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`column_name`](SupabaseRepository.md#column_name)

***

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L196)

Counts the entities matching the conditions.

Uses PostgREST's `count=exact` + `head=true`, returning only the count without
downloading rows. groupBy is not supported yet.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"countOptions"`&gt; | The query conditions (where / groupBy) |

#### Returns

`Promise`&lt;`number`&gt;

The total number of entities (0 when nothing matches)

#### Throws

When groupBy is passed (not implemented yet)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On remote refusal (RLS / constraints / syntax etc.)

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`count`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#count)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`count`](SupabaseRepository.md#count)

***

### countAncestors() \{#countancestors\}

```ts
countAncestors(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts#L81)

Queries the number of ancestor nodes

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

#### Remarks

- With entityId given: **excludes the current node**, counting only ancestors
- Without entityId: counts all root nodes

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`countAncestors`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#countancestors)

***

### countDescendants() \{#countdescendants\}

```ts
countDescendants(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts#L59)

Queries the number of descendant nodes

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`number`&gt;

#### Remarks

- With entityId given: **excludes the current node**, counting only descendants
- Without entityId: counts all root nodes and their descendants in total

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`countDescendants`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#countdescendants)

***

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L221)

Creates an entity and lands it in the database.

If rxdb.context.userId exists, the createdBy / updatedBy audit fields are injected automatically.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The entity to create (must contain the primary key id) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The created entity (including database-backfilled fields like createdAt, restored to a typed instance via `transform_row_to_entity`)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On remote refusal to insert (primary key conflict / RLS / constraints etc.)

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`create`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#create)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`create`](SupabaseRepository.md#create)

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

[`SupabaseRepository`](SupabaseRepository.md).[`createEntityRef`](SupabaseRepository.md#createentityref)

***

### find() \{#find\}

```ts
find(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L121)

Queries multiple entities.

Automatically paginates at 1000 rows per request until the limit is met or the
data is exhausted, avoiding a single request exceeding PostgREST's default
cap. When where contains cross-table conditions, a `!inner` relation SELECT is
appended to make the association filter effective.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"findOptions"`&gt; | The query conditions (where / orderBy / limit / offset) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

The entities matching the conditions (restored to typed instances via transform_row_to_entity)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On remote refusal (RLS / constraints / syntax etc.)

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`find`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#find)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`find`](SupabaseRepository.md#find)

***

### findAncestors() \{#findancestors\}

```ts
findAncestors(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts#L70)

Queries ancestor nodes

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

- With entityId given: includes the current node + its ancestor nodes
- Without entityId: returns all root nodes (the start is all roots; there are no ancestors above)

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`findAncestors`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#findancestors)

***

### findDescendants() \{#finddescendants\}

```ts
findDescendants(options): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseTreeRepository.ts#L48)

Queries descendant nodes

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | [`FindTreeOptions`](../../rxdb-plugin-tree/interfaces/FindTreeOptions.md)&lt;`T`&gt; |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;

#### Remarks

- With entityId given: includes the current node + its descendant nodes
- Without entityId: returns all root nodes and their descendants

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`findDescendants`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#finddescendants)

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

[`SupabaseRepository`](SupabaseRepository.md).[`getEntityRef`](SupabaseRepository.md#getentityref)

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

[`SupabaseRepository`](SupabaseRepository.md).[`hasEntityRef`](SupabaseRepository.md#hasentityref)

***

### primary\_key\_column() \{#primary_key_column\}

```ts
protected primary_key_column(): string;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L309)

#### Returns

`string`

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`primary_key_column`](SupabaseRepository.md#primary_key_column)

***

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L280)

Hard-deletes an entity by id (no soft delete / tombstone).

Returns the original entity reference for convenient chaining; use find/update
if server-backfilled fields are needed.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The target entity (only the id is used to locate the row) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity passed in (returned unchanged after successful deletion)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On RLS refusal, or when the deleted row does not match the target id

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`remove`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#remove)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`remove`](SupabaseRepository.md#remove)

***

### update() \{#update\}

```ts
update(entity, patch): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:256](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L256)

Partially updates an entity by id.

If rxdb.context.userId exists, the updatedBy audit field is injected automatically.
Server-side triggers/defaults are backfilled into the return result.

The user patch is first filtered of readonly fields by `normalizeUpdateEntity`,
and the system audit fields are then injected separately.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; | The target entity (only the id is used to locate the row) |
| `patch` | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | The incremental fields (without id) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The updated entity (restored to a typed instance via `transform_row_to_entity`)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On row not existing / RLS refusal

#### Implementation of

[`ITreeRepository`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md).[`update`](../../rxdb-plugin-tree/interfaces/ITreeRepository.md#update)

#### Inherited from

[`SupabaseRepository`](SupabaseRepository.md).[`update`](SupabaseRepository.md#update)

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

[`SupabaseRepository`](SupabaseRepository.md).[`updateEntity`](SupabaseRepository.md#updateentity)
