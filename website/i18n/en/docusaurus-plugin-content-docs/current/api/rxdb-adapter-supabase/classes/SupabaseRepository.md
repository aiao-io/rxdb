---
sidebar_label: 'SupabaseRepository⟨T⟩'
---

# SupabaseRepository`<T>`

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L99)

Supabase Repository
Provides CRUD operations on Supabase tables

## Extends

- [`RepositoryBase`](../../rxdb/classes/RepositoryBase.md)&lt;`T`&gt;

## Extended by

- [`SupabaseTreeRepository`](SupabaseTreeRepository.md)

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Implements

- [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`T`&gt;

## Constructors

### Constructor

```ts
new SupabaseRepository<T>(adapter, EntityType): SupabaseRepository<T>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L102)

#### Parameters

| Parameter    | Type                                            |
| ------------ | ----------------------------------------------- |
| `adapter`    | [`RxDBAdapterSupabase`](RxDBAdapterSupabase.md) |
| `EntityType` | `T`                                             |

#### Returns

`SupabaseRepository`&lt;`T`&gt;

#### Overrides

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`constructor`](../../rxdb/classes/RepositoryBase.md#constructor)

## Properties

### adapter \{#adapter\}

```ts
protected readonly adapter: RxDBAdapterSupabase;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L103)

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
protected readonly metadata: EntityMetadata;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L100)

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:19

#### Inherited from

[`SupabaseTreeRepository`](SupabaseTreeRepository.md).[`rxdb`](SupabaseTreeRepository.md#rxdb)

---

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

Does **not** accumulate along the prototype chain: each subclass writes its own
copy of `_STATIC_METHODS`, avoiding the runtime reflecting names like `get` /
`findOne` of an ancestor that a descendant then accidentally overrides once more.

##### Returns

`string`[]

#### Inherited from

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`staticMethods`](../../rxdb/classes/RepositoryBase.md#staticmethods)

## Methods

### buildSelectFields() \{#buildselectfields\}

```ts
buildSelectFields(where, fields?): string;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:301](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L301)

Builds the SELECT fields including the embeds needed by relation conditions.

#### Parameters

| Parameter | Type                                 | Default value | Description                               |
| --------- | ------------------------------------ | ------------- | ----------------------------------------- |
| `where`   | `RepositoryRuleGroup` \| `undefined` | `undefined`   | The query conditions                      |
| `fields?` | `string`                             | `'*'`         | The columns to return for the root entity |

#### Returns

`string`

The PostgREST SELECT expression with relation embeds

---

### column\_name() \{#column_name\}

```ts
protected column_name(field): string;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:313](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L313)

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `field`   | `string` |

#### Returns

`string`

---

### count() \{#count\}

```ts
count(options): Promise<number>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:196](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L196)

Counts the entities matching the conditions.

Uses PostgREST's `count=exact` + `head=true`, returning only the count without
downloading rows. groupBy is not supported yet.

#### Parameters

| Parameter | Type                                                                                           | Description                            |
| --------- | ---------------------------------------------------------------------------------------------- | -------------------------------------- |
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

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`count`](../../rxdb/interfaces/IRepository.md#count)

---

### create() \{#create\}

```ts
create(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:221](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L221)

Creates an entity and lands it in the database.

If rxdb.context.userId exists, the createdBy / updatedBy audit fields are injected automatically.

#### Parameters

| Parameter | Type                      | Description                                            |
| --------- | ------------------------- | ------------------------------------------------------ |
| `entity`  | `InstanceType`&lt;`T`&gt; | The entity to create (must contain the primary key id) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The created entity (including database-backfilled fields like createdAt, restored to a typed instance via `transform_row_to_entity`)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On remote refusal to insert (primary key conflict / RLS / constraints etc.)

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

| Parameter | Type                                                                         | Description                                               |
| --------- | ---------------------------------------------------------------------------- | --------------------------------------------------------- |
| `data`    | [`EntityUpdateData`](../../rxdb/type-aliases/EntityUpdateData.md)&lt;`T`&gt; | Initial field values; `id` is auto-generated when omitted |

#### Returns

[`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;

The entity instance already attached to the [EntityManager](../../rxdb/interfaces/EntityManager.md) cache

#### Remarks

Regardless of whether the input `id` already exists in the cache, the instance
in the cache is **preferred** (overwrite-style refresh); going through
`rxdb.entityManager.createEntityRef` reuses the same reference semantics and
avoids different call stacks getting two out-of-sync clones.

#### Inherited from

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`createEntityRef`](../../rxdb/classes/RepositoryBase.md#createentityref)

---

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

| Parameter | Type                                                                                          | Description                                             |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
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

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`find`](../../rxdb/interfaces/IRepository.md#find)

---

### getEntityRef() \{#getentityref\}

```ts
getEntityRef(id):
  | EntityInstanceType<T>
  | undefined;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:57

Looks up an entity in the current process's entity cache by ID

#### Parameters

| Parameter | Type                                                                                     | Description            |
| --------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity primary key |

#### Returns

\| [`EntityInstanceType`](../../rxdb/type-aliases/EntityInstanceType.md)&lt;`T`&gt;
\| `undefined`

Returns the instance on a cache hit, `undefined` on a miss (**does not** trigger a database query)

#### Inherited from

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`getEntityRef`](../../rxdb/classes/RepositoryBase.md#getentityref)

---

### hasEntityRef() \{#hasentityref\}

```ts
hasEntityRef(id): boolean;
```

Defined in: packages/rxdb/dist/repository/RepositoryBase.d.ts:68

Determines whether the current process's entity cache has a given ID

#### Parameters

| Parameter | Type                                                                                     | Description            |
| --------- | ---------------------------------------------------------------------------------------- | ---------------------- |
| `id`      | [`EntityStaticType`](../../rxdb/type-aliases/EntityStaticType.md)&lt;`T`, `"idType"`&gt; | The entity primary key |

#### Returns

`boolean`

Returns `true` on a cache hit, otherwise `false`

#### Remarks

Equivalent to `getEntityRef(id) !== undefined`; provided separately so hot
paths like "batch warm-up" and "diff sync" save the cost of one reference
creation / status read.

#### Inherited from

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`hasEntityRef`](../../rxdb/classes/RepositoryBase.md#hasentityref)

---

### primary\_key\_column() \{#primary_key_column\}

```ts
protected primary_key_column(): string;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:309](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L309)

#### Returns

`string`

---

### remove() \{#remove\}

```ts
remove(entity): Promise<InstanceType<T>>;
```

Defined in: [packages/rxdb-adapter-supabase/src/SupabaseRepository.ts:280](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-supabase/src/SupabaseRepository.ts#L280)

Hard-deletes an entity by id (no soft delete / tombstone).

Returns the original entity reference for convenient chaining; use find/update
if server-backfilled fields are needed.

#### Parameters

| Parameter | Type                      | Description                                               |
| --------- | ------------------------- | --------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The target entity (only the id is used to locate the row) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The entity passed in (returned unchanged after successful deletion)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On RLS refusal, or when the deleted row does not match the target id

#### Implementation of

[`IRepository`](../../rxdb/interfaces/IRepository.md).[`remove`](../../rxdb/interfaces/IRepository.md#remove)

---

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

| Parameter | Type                                       | Description                                               |
| --------- | ------------------------------------------ | --------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt;                  | The target entity (only the id is used to locate the row) |
| `patch`   | `Partial`&lt;`InstanceType`&lt;`T`&gt;&gt; | The incremental fields (without id)                       |

#### Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;&gt;

The updated entity (restored to a typed instance via `transform_row_to_entity`)

#### Throws

`NetworkOfflineError` when the remote cannot be reached (judge offline with the
core's `isNetworkError`, don't catch as `SupabaseDataError`)

#### Throws

On row not existing / RLS refusal

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

| Parameter | Type                      | Description                                                                       |
| --------- | ------------------------- | --------------------------------------------------------------------------------- |
| `entity`  | `InstanceType`&lt;`T`&gt; | The target entity                                                                 |
| `update`  | `InstanceType`&lt;`T`&gt; | The fields to write; the primary key `id` is assigned too (for hydrate scenarios) |

#### Returns

`void`

#### Remarks

Goes through [EntityStatus.applyExternal](../../rxdb/interfaces/EntityStatus.md#applyexternal),
guaranteeing dirty tracking and patch generation take the same path, and that
entities with unsaved edits are avoided field-by-field rather than overwritten
whole-row — a live-query batch backfill can hit entities the user has already
modified, and an unconditional `replace` would silently eat those edits.

#### Inherited from

[`RepositoryBase`](../../rxdb/classes/RepositoryBase.md).[`updateEntity`](../../rxdb/classes/RepositoryBase.md#updateentity)
