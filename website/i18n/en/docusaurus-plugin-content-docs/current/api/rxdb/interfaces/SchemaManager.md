# SchemaManager

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L47)

SchemaManager implementation.

## Properties

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L72)

## Accessors

### generatedEntities \{#generatedentities\}

#### Get Signature

```ts
get generatedEntities(): readonly EntityType[];
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L68)

The entity classes generated when this instance `init()`s: the products of the repository `entityGenerator` and the many-to-many junction tables (US-313)

##### Remarks

They are also in `config.entities`, but they are not declared by the integrator. When opening another instance (such as a read-only checkout's snapshot database), they cannot be
passed in as entities to clone: the new instance's `SchemaManager` generates its own copy, and two copies with the same name collide.

##### Returns

readonly [`EntityType`](../type-aliases/EntityType.md)[]

## Methods

### findMappedRelation() \{#findmappedrelation\}

```ts
findMappedRelation(meta, relation): FindMappedRelationResult<EntityRelationMetadata>;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L234)

Finds the mapped relation of the current relation property

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `meta` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | - |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) | The current relation property |

#### Returns

`FindMappedRelationResult`&lt;[`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md)&gt;

***

### getEntityMetadata() \{#getentitymetadata\}

```ts
getEntityMetadata(name, namespace): 
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L310)

Fetches entity metadata

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `namespace` | `string` |

#### Returns

  \| `Readonly`&lt;[`EntityMetadataType`](EntityMetadataType.md)&gt;
  \| `undefined`

***

### getEntityMetadataByTableName() \{#getentitymetadatabytablename\}

```ts
getEntityMetadataByTableName(tableName, namespace): 
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L338)

Fetches entity metadata by tableName

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tableName` | `string` | Database table name |
| `namespace` | `string` | Namespace |

#### Returns

  \| `Readonly`&lt;[`EntityMetadataType`](EntityMetadataType.md)&gt;
  \| `undefined`

***

### getEntityType() \{#getentitytype\}

```ts
getEntityType<T>(name, namespace): T | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L318)

Fetches entity metadata

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `name` | `string` |
| `namespace` | `string` |

#### Returns

`T` \| `undefined`

***

### getEntityTypeByTableName() \{#getentitytypebytablename\}

```ts
getEntityTypeByTableName<T>(tableName, namespace): T | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L328)

Fetches the entity type by tableName

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t-1"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `tableName` | `string` | Database table name |
| `namespace` | `string` | Namespace |

#### Returns

`T` \| `undefined`

***

### getFieldRelations() \{#getfieldrelations\}

```ts
getFieldRelations(metadata, field): GetFieldRelationsResult;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L271)

Finds the relation array via the query condition's field

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | - |
| `field` | `string` | The query condition's field |

#### Returns

`GetFieldRelationsResult`

***

### init() \{#init\}

```ts
init(): void;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L98)

Registers all entity metadata and adds the missing system tables into `config.entities`.

#### Returns

`void`

#### Remarks

The backfill is judged **table by table**, without treating any single table as an "already injected" sentinel.
Before, this wrote `if (!entities.includes(RxDBBranch)) entities.push(...SYSTEM_ENTITIES)`,
while `RxDBBranch` / `RxDBChange` / `RxDBMigration` / `RxDBSync` are all publicly exported from `src/index.ts`
— as soon as an integrator writes `RxDBBranch` into their own `entities` (to add relations to it,
or to register it separately in devtools — both are common), the whole batch of system tables would not be backfilled at all.

Before epic-006 this consequence stayed hidden: people who write `RxDBBranch` usually write all four together, and the missing part
happened to be the empty set. Now a library with `@aiao/rxdb-plugin-working-tree` installed has 14 tables, 10 of which are **not publicly
exported**, and no way an integrator can list them all — so tables are inevitably missing, with the symptom that the first `commit()` makes
`entityManager.instantiate(CommitBranchRef)` throw `need init rxdb`, an error with no readable subject.

The table-by-table check also preserves the problem the old sentinel was really solving: `entities` is **the mutable array itself** on `config`,
and `init()` re-runs on disconnect → reconnect, so unconditional pushes would grow it without bound.

The list comes from [RxDB.systemEntities](../classes/RxDB.md#systementities) (the core four + contributions `use()`d by **this instance**),
not the module-level `SYSTEM_ENTITIES`. The latter is a live view for determination that only ever grows: using it for injection would mean that
as long as any library in the process has a contributor installed, libraries without it would also get those tables created and eat their migrations.
