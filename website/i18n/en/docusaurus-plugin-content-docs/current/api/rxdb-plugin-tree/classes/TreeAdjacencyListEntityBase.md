---
sidebar_label: 'TreeAdjacencyListEntityBase⟨Id⟩'
---

# TreeAdjacencyListEntityBase`<Id>`

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:46](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L46)

Tree entity decorator configuration
Defines the parent-child relationship required by the tree structure

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;`Id`&gt;

## Type Parameters

| Type Parameter                                                                                          | Default type                              |
| ------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| <a id="type-parameter-id"></a> `Id` _extends_ [`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md) | [`UUID`](../../rxdb/type-aliases/UUID.md) |

## Implements

- [`ITreeEntity`](../interfaces/ITreeEntity.md)

## Constructors

### Constructor

```ts
new TreeAdjacencyListEntityBase<Id>(initData?): TreeAdjacencyListEntityBase<Id>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:117

Entity base class constructor
Subclasses enhance this constructor through the Entity decorator

#### Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `initData?` | `unknown` |

#### Returns

`TreeAdjacencyListEntityBase`&lt;`Id`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`constructor`](../../rxdb/classes/EntityBase.md#constructor)

## Properties

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:36

Creation time
Automatically set to the current time when the entity is created

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`createdAt`](../interfaces/ITreeEntity.md#createdat)

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdAt`](../../rxdb/classes/EntityBase.md#createdat)

---

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:46

Creator ID
Records the user ID that created this entity

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`createdBy`](../interfaces/ITreeEntity.md#createdby)

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

---

### hasChildren? \{#haschildren\}

```ts
hasChildren?: boolean | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L59)

Whether there are child nodes, auto-filled by a database computed property.
`declare` because it is a computed property injected via metadata; the class does not need to initialize it.

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`hasChildren`](../interfaces/ITreeEntity.md#haschildren)

---

### id \{#id\}

```ts
readonly id: Id;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:31

Entity unique identifier
An auto-generated UUID serving as the primary key

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`id`](../interfaces/ITreeEntity.md#id)

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

---

### parentId? \{#parentid\}

```ts
parentId?: Id | null;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L53)

Parent node ID

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`parentId`](../interfaces/ITreeEntity.md#parentid)

---

### remove \{#remove\}

```ts
remove: () => Promise<TreeAdjacencyListEntityBase<Id>>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:97

Deletes

#### Returns

`Promise`&lt;`TreeAdjacencyListEntityBase`&lt;`Id`&gt;&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

---

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:101

Resets data

#### Returns

`void`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`reset`](../../rxdb/classes/EntityBase.md#reset)

---

### save \{#save\}

```ts
save: () => Promise<TreeAdjacencyListEntityBase<Id>>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`TreeAdjacencyListEntityBase`&lt;`Id`&gt;&gt;

#### Remarks

This entry point does not hold a transaction executor and re-enters the adapter queue. Awaiting this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead. For full dos and don'ts, see [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction).

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:41

Update time
Automatically set to the current time when the entity is created or updated

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`updatedAt`](../interfaces/ITreeEntity.md#updatedat)

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:51

Updater ID
Records the user ID that last updated this entity

#### Implementation of

[`ITreeEntity`](../interfaces/ITreeEntity.md).[`updatedBy`](../interfaces/ITreeEntity.md#updatedby)

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)

---

### count \{#count\}

```ts
static count: <T>(this, options) => Observable<number>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:93

Counts entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                         | Description                                  |
| --------- | ---------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                | -                                            |
| `options` | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`number`&gt;

The count wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`count`](../../rxdb/classes/EntityBase.md#count)

---

### countAncestors \{#countancestors\}

```ts
static countAncestors: <T>(this, options) => Observable<number>;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L96)

Counts ancestor nodes

#### Type Parameters

| Type Parameter                                                                                               |
| ------------------------------------------------------------------------------------------------------------ |
| `T` _extends_ `TreeAdjacencyListEntityBase`&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                            |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `this`    | new () => `T`                                                              | -                                                      |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;new () => `T`&gt; | Query options, including the entity ID and level depth |

#### Returns

`Observable`&lt;`number`&gt;

The ancestor node count wrapped in an Observable

---

### countDescendants \{#countdescendants\}

```ts
static countDescendants: <T>(this, options) => Observable<number>;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L76)

Counts descendant nodes

#### Type Parameters

| Type Parameter                                                                                               |
| ------------------------------------------------------------------------------------------------------------ |
| `T` _extends_ `TreeAdjacencyListEntityBase`&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                            |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `this`    | new () => `T`                                                              | -                                                      |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;new () => `T`&gt; | Query options, including the entity ID and level depth |

#### Returns

`Observable`&lt;`number`&gt;

The descendant node count wrapped in an Observable

---

### find \{#find\}

```ts
static find: <T>(this, options) => Observable<T[]>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:75

Finds multiple entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                                       |
| --------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `this`    | new () => `T`                                                              | -                                                                 |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition, limit, offset, etc. |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`find`](../../rxdb/classes/EntityBase.md#find)

---

### findAll \{#findall\}

```ts
static findAll: <T>(this, options) => Observable<T[]>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:81

Finds all entities

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                             | Description                                                          |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                                                    |
| `options` | [`FindAllOptions`](../../rxdb/interfaces/FindAllOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition and ordering (no limit) |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findAll`](../../rxdb/classes/EntityBase.md#findall)

---

### findAncestors \{#findancestors\}

```ts
static findAncestors: <T>(this, options) => Observable<T[]>;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L86)

Finds all ancestor nodes

#### Type Parameters

| Type Parameter                                                                                               |
| ------------------------------------------------------------------------------------------------------------ |
| `T` _extends_ `TreeAdjacencyListEntityBase`&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                            |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `this`    | new () => `T`                                                              | -                                                      |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;new () => `T`&gt; | Query options, including the entity ID and level depth |

#### Returns

`Observable`&lt;`T`[]&gt;

The ancestor node array wrapped in an Observable

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: <T>(this, options) => Observable<T[]>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:87

Paginated query via cursor

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                       | Description                                                               |
| --------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                                              | -                                                                         |
| `options` | [`FindByCursorOptions`](../../rxdb/interfaces/FindByCursorOptions.md)&lt;new () => `T`&gt; | Cursor pagination options, including orderBy and the before/after cursors |

#### Returns

`Observable`&lt;`T`[]&gt;

The entity instance array wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findByCursor`](../../rxdb/classes/EntityBase.md#findbycursor)

---

### findDescendants \{#finddescendants\}

```ts
static findDescendants: <T>(this, options) => Observable<T[]>;
```

Defined in: [rxdb-plugin-tree/src/entity/tree-entity-base.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-tree/src/entity/tree-entity-base.ts#L66)

Finds all descendant nodes

#### Type Parameters

| Type Parameter                                                                                               |
| ------------------------------------------------------------------------------------------------------------ |
| `T` _extends_ `TreeAdjacencyListEntityBase`&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                       | Description                                            |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------ |
| `this`    | new () => `T`                                                              | -                                                      |
| `options` | [`FindTreeOptions`](../interfaces/FindTreeOptions.md)&lt;new () => `T`&gt; | Query options, including the entity ID and level depth |

#### Returns

`Observable`&lt;`T`[]&gt;

The descendant node array wrapped in an Observable

---

### findOne \{#findone\}

```ts
static findOne: <T>(this, options) => Observable<T | null>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:63

Finds one entity

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                             | Description                                  |
| --------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                    | -                                            |
| `options` | [`FindOneOptions`](../../rxdb/interfaces/FindOneOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T` \| `null`&gt;

The entity instance or null wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOne`](../../rxdb/classes/EntityBase.md#findone)

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: <T>(this, options) => Observable<T>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:69

Finds one entity, throws when none is found

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                         | Description                                  |
| --------- | -------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                                                | -                                            |
| `options` | [`FindOneOrFailOptions`](../../rxdb/interfaces/FindOneOrFailOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T`&gt;

The entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOneOrFail`](../../rxdb/classes/EntityBase.md#findoneorfail)

---

### get \{#get\}

```ts
static get: <T>(this, id) => Observable<T>;
```

Defined in: rxdb/dist/entity/entity-base.d.ts:57

Gets an entity by id

#### Type Parameters

| Type Parameter                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------- |
| `T` _extends_ [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type          | Description                    |
| --------- | ------------- | ------------------------------ |
| `this`    | new () => `T` | -                              |
| `id`      | `T`\[`"id"`\] | The entity's unique identifier |

#### Returns

`Observable`&lt;`T`&gt;

The entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`get`](../../rxdb/classes/EntityBase.md#get)
