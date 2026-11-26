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

The entity classes generated during this instance's `init()`: the products of the repository `entityGenerator`
and the many-to-many junction tables (US-313).

##### Remarks

They are also in `config.entities`, but they were not declared by the integrating side. When opening another
instance (such as a read-only checkout's snapshot database), they must not be passed in as entities to clone:
the new instance's `SchemaManager` generates its own copy, and two copies with the same name would collide.

##### Returns

readonly [`EntityType`](../type-aliases/EntityType.md)[]

## Methods

### findMappedRelation() \{#findmappedrelation\}

```ts
findMappedRelation(meta, relation): FindMappedRelationResult<EntityRelationMetadata>;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:234](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L234)

Finds the mapped relation of the current relation property.

#### Parameters

| Parameter  | Type                                                                  | Description                   |
| ---------- | --------------------------------------------------------------------- | ----------------------------- |
| `meta`     | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                 | -                             |
| `relation` | [`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md) | The current relation property |

#### Returns

`FindMappedRelationResult`&lt;[`EntityRelationMetadata`](../type-aliases/EntityRelationMetadata.md)&gt;

---

### getEntityMetadata() \{#getentitymetadata\}

```ts
getEntityMetadata(name, namespace):
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:310](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L310)

Gets entity metadata.

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `name`      | `string` |
| `namespace` | `string` |

#### Returns

\| `Readonly`&lt;[`EntityMetadataType`](EntityMetadataType.md)&gt;
\| `undefined`

---

### getEntityMetadataByTableName() \{#getentitymetadatabytablename\}

```ts
getEntityMetadataByTableName(tableName, namespace):
  | Readonly<EntityMetadataType>
  | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:338](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L338)

Gets entity metadata by tableName.

#### Parameters

| Parameter   | Type     | Description         |
| ----------- | -------- | ------------------- |
| `tableName` | `string` | Database table name |
| `namespace` | `string` | Namespace           |

#### Returns

\| `Readonly`&lt;[`EntityMetadataType`](EntityMetadataType.md)&gt;
\| `undefined`

---

### getEntityType() \{#getentitytype\}

```ts
getEntityType<T>(name, namespace): T | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:318](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L318)

Gets entity metadata.

#### Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter   | Type     |
| ----------- | -------- |
| `name`      | `string` |
| `namespace` | `string` |

#### Returns

`T` \| `undefined`

---

### getEntityTypeByTableName() \{#getentitytypebytablename\}

```ts
getEntityTypeByTableName<T>(tableName, namespace): T | undefined;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:328](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L328)

Gets the entity type by tableName.

#### Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t-1"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter   | Type     | Description         |
| ----------- | -------- | ------------------- |
| `tableName` | `string` | Database table name |
| `namespace` | `string` | Namespace           |

#### Returns

`T` \| `undefined`

---

### getFieldRelations() \{#getfieldrelations\}

```ts
getFieldRelations(metadata, field): GetFieldRelationsResult;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:271](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L271)

Finds the relation array through the field of a query condition.

#### Parameters

| Parameter  | Type                                                  | Description                      |
| ---------- | ----------------------------------------------------- | -------------------------------- |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | -                                |
| `field`    | `string`                                              | The field of the query condition |

#### Returns

`GetFieldRelationsResult`

---

### init() \{#init\}

```ts
init(): void;
```

Defined in: [packages/rxdb/src/schema/SchemaManager.ts:98](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/schema/SchemaManager.ts#L98)

Registers all entity metadata and adds the missing system tables into `config.entities`.

#### Returns

`void`

#### Remarks

Table addition is judged **one table at a time**; no single table is used as an "already injected" sentinel.
Previously this was written as `if (!entities.includes(RxDBBranch)) entities.push(...SYSTEM_ENTITIES)`, but the
four tables `RxDBBranch` / `RxDBChange` / `RxDBMigration` / `RxDBSync` are all publicly exported from
`src/index.ts` — if the integrating side wrote one of them, `RxDBBranch`, into its own `entities` (which
happens both to give it relations and to register it separately in devtools), not one of the whole batch of
system tables would be added.

Before epic-006 this consequence stayed hidden: people who write `RxDBBranch` usually write all four together,
and the missing part happened to be the empty set. Now a database with `@aiao/rxdb-plugin-working-tree`
installed has 14 tables, 10 of which are **not publicly exported**, so there is no way for the integrating side
to list them all — missing tables are inevitable. The symptom: on the first `commit()`,
`entityManager.instantiate(CommitBranchRef)` throws `need init rxdb`, an error from which the subject cannot be
read.

Judging one table at a time also preserves the problem the old sentinel really solved: `entities` is that
**mutable array itself** on `config`, and `init()` reruns on disconnect → reconnect, so an unconditional push
would make it grow without bound.

The list comes from [RxDB.systemEntities](../classes/RxDB.md#systementities) (the core four + the
contributions `use()`d by **this instance**), not the module-level `SYSTEM_ENTITIES`. The latter is a live
view used for judging that only grows: injecting from it would make a database without a contributor still get
those tables created — and pay for their migrations — as long as any database in the process had it installed.
