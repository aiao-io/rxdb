---
sidebar_label: 'RepositoryBase⟨T⟩'
---

# RepositoryBase`<T>`

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L20)

Data repository

The common base class of all Repositories ([Repository](Repository.md), plugin-side `TreeRepository` / `GraphRepository`,
and adapter-side `AdapterRepository`). It only carries **a thin wrapper over entity references**:

- Create / find / exists — all delegated to the [EntityManager](../interfaces/EntityManager.md) LRU cache;
- Update — goes through [EntityStatus.replace](../interfaces/EntityStatus.md#replace) (when present) or falls back to `Object.assign`
  while recording `origin` for downstream diff / change inversion.

The real "query + sync + mutation orchestration" lives in subclasses or on the adapter side; the base class does not touch that business,
otherwise its complexity would grow linearly with every repository feature.

## Extended by

- [`Repository`](Repository.md)
- [`SupabaseRepository`](../../rxdb-adapter-supabase/classes/SupabaseRepository.md)
- [`SqliteRepositoryBase`](../../rxdb-adapter-sqlite-core/classes/SqliteRepositoryBase.md)

## Type Parameters

| Type Parameter                                                                            | Description                                                                                                  |
| ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) | The entity type constructor, determining the derivation paths of static types like `findOptions` / `idType`. |

## Constructors

### Constructor

```ts
new RepositoryBase<T>(rxdb, EntityType): RepositoryBase<T>;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L42)

#### Parameters

| Parameter    | Type              |
| ------------ | ----------------- |
| `rxdb`       | [`RxDB`](RxDB.md) |
| `EntityType` | `T`               |

#### Returns

`RepositoryBase`&lt;`T`&gt;

## Properties

### EntityType \{#entitytype\}

```ts
readonly EntityType: T;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L44)

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L43)

---

### \_STATIC\_METHODS \{#_static_methods\}

```ts
protected static _STATIC_METHODS: string[] = [];
```

Defined in: [packages/rxdb/src/repository/RepositoryBase.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/RepositoryBase.ts#L29)

The list of "static method names" declared by subclasses, used to inject methods like `User.findOne(...)`
onto the entity class (mounted during [EntityManager.init](../interfaces/EntityManager.md#init)).

#### Remarks

Uses a class field `static` rather than assigning in the constructor — field initialization merges **bottom-up**
along the `extends` chain, so the `_STATIC_METHODS` defined by subclasses is not lost; runtime reflection reads the current class's field.

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

## Methods

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
