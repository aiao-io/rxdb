# Column

Defined in: [packages/rxdb-plugin-board/src/entities/column.entity.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/entities/column.entity.ts#L41)

`Column` — a board column: an ordering domain grouped by `boardId` (drag columns within the board).

## Remarks

`board_id` is a non-null foreign key with RESTRICT default cascade: deleting a board is preceded by the application-layer delete service clearing its columns,
and deleting a board via direct SQL is still blocked by the foreign key.
The immutability of `column.board_id` after creation is enforced at the domain service entry (US-534 tech notes); this entity does not promise rejection at the storage layer.
The `(boardId, sortOrder)` index serves the in-board column order and the board deletion plan (the storage layer does not auto-create indexes for foreign keys).

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Implements

- [`ISortableEntity`](../../rxdb/interfaces/ISortableEntity.md)

## Constructors

### Constructor

```ts
new Column(initData?): Column;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:117

Base entity class constructor
Subclasses enhance this constructor through the Entity decorator

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `initData?` | `unknown` |

#### Returns

`Column`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`constructor`](../../rxdb/classes/EntityBase.md#constructor)

## Properties

### boardId \{#boardid\}

```ts
boardId: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: [packages/rxdb-plugin-board/src/entities/column.entity.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/entities/column.entity.ts#L42)

***

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:36

Creation time
Automatically set to the current time when the entity is created

#### Inherited from

[`BoardLabel`](BoardLabel.md).[`createdAt`](BoardLabel.md#createdat)

***

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:46

Creator ID
Records the ID of the user who created this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

***

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:31

Unique identifier of the entity
An auto-generated UUID, used as the primary key

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

***

### remove \{#remove\}

```ts
remove: () => Promise<Column>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Delete

#### Returns

`Promise`&lt;`Column`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

***

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:101

Reset data

#### Returns

`void`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`reset`](../../rxdb/classes/EntityBase.md#reset)

***

### save \{#save\}

```ts
save: () => Promise<Column>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`Column`&gt;

#### Remarks

This entry does not hold a transaction executor and re-enters the adapter queue.
Awaiting this method inside a transaction callback waits for the current transaction to end; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead.
See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction) for complete positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

***

### sortOrder \{#sortorder\}

```ts
sortOrder: string;
```

Defined in: [packages/rxdb-plugin-board/src/entities/column.entity.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/entities/column.entity.ts#L44)

Ordering key, non-null

#### Implementation of

[`ISortableEntity`](../../rxdb/interfaces/ISortableEntity.md).[`sortOrder`](../../rxdb/interfaces/ISortableEntity.md#sortorder)

***

### title \{#title\}

```ts
title: string;
```

Defined in: [packages/rxdb-plugin-board/src/entities/column.entity.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/entities/column.entity.ts#L43)

***

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:41

Update time
Automatically set to the current time when the entity is created or updated

#### Inherited from

[`BoardLabel`](BoardLabel.md).[`updatedAt`](BoardLabel.md#updatedat)

***

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:51

Updater ID
Records the ID of the user who last updated this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)

***

### count \{#count\}

```ts
static count: <T>(this, options) => Observable<number>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:93

Counts entities

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `options` | [`CountOptions`](../../rxdb/interfaces/CountOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions |

#### Returns

`Observable`&lt;`number`&gt;

The count wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`count`](../../rxdb/classes/EntityBase.md#count)

***

### find \{#find\}

```ts
static find: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:75

Finds multiple entities

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions, limit, offset, etc. |

#### Returns

`Observable`&lt;`T`[]&gt;

Array of entity instances wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`find`](../../rxdb/classes/EntityBase.md#find)

***

### findAll \{#findall\}

```ts
static findAll: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:81

Finds all entities

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `options` | [`FindAllOptions`](../../rxdb/interfaces/FindAllOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions and ordering (no quantity limit) |

#### Returns

`Observable`&lt;`T`[]&gt;

Array of entity instances wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findAll`](../../rxdb/classes/EntityBase.md#findall)

***

### findByCursor \{#findbycursor\}

```ts
static findByCursor: <T>(this, options) => Observable<T[]>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:87

Paginated query via a cursor

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `options` | [`FindByCursorOptions`](../../rxdb/interfaces/FindByCursorOptions.md)&lt;new () => `T`&gt; | Cursor pagination options, including orderBy and before/after cursors |

#### Returns

`Observable`&lt;`T`[]&gt;

Array of entity instances wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findByCursor`](../../rxdb/classes/EntityBase.md#findbycursor)

***

### findOne \{#findone\}

```ts
static findOne: <T>(this, options) => Observable<T | null>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:63

Finds one entity

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `options` | [`FindOneOptions`](../../rxdb/interfaces/FindOneOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions |

#### Returns

`Observable`&lt;`T` \| `null`&gt;

Entity instance or null wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOne`](../../rxdb/classes/EntityBase.md#findone)

***

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: <T>(this, options) => Observable<T>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:69

Finds one entity, throwing an error when none is found

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `options` | [`FindOneOrFailOptions`](../../rxdb/interfaces/FindOneOrFailOptions.md)&lt;new () => `T`&gt; | Query options, including where conditions |

#### Returns

`Observable`&lt;`T`&gt;

Entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`findOneOrFail`](../../rxdb/classes/EntityBase.md#findoneorfail)

***

### get \{#get\}

```ts
static get: <T>(this, id) => Observable<T>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:57

Gets an entity by id

#### Type Parameters

| Type Parameter |
| ------ |
| `T` *extends* [`EntityBase`](../../rxdb/classes/EntityBase.md)&lt;[`RxDBEntityId`](../../rxdb/type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `this` | new () => `T` | - |
| `id` | `T`\[`"id"`\] | Unique identifier of the entity |

#### Returns

`Observable`&lt;`T`&gt;

Entity instance wrapped in an Observable

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`get`](../../rxdb/classes/EntityBase.md#get)
