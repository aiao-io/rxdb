---
sidebar_label: 'EntityBase⟨Id⟩'
---

# EntityBase`<Id>`

Defined in: [packages/rxdb/src/entity/entity-base.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L100)

Entity base class
All entities that need to sync should extend this class

Provides common entity properties such as ID, creation time, update time, etc.
Automatically handles the default values and read-only properties of these fields

## Example

```typescript
@Entity({ name: 'User' })
class User extends EntityBase {}
```

## Implements

Implements the entity interface

## Extended by

- [`Board`](../../rxdb-plugin-board/classes/Board.md)
- [`BoardLabel`](../../rxdb-plugin-board/classes/BoardLabel.md)
- [`Column`](../../rxdb-plugin-board/classes/Column.md)
- [`Task`](../../rxdb-plugin-board/classes/Task.md)
- [`TaskLabel`](../../rxdb-plugin-board/classes/TaskLabel.md)
- [`Board`](../../rxdb-plugin-board-angular/interfaces/Board.md)
- [`BoardLabel`](../../rxdb-plugin-board-angular/interfaces/BoardLabel.md)
- [`Column`](../../rxdb-plugin-board-angular/interfaces/Column.md)
- [`Task`](../../rxdb-plugin-board-angular/interfaces/Task.md)
- [`Board`](../../rxdb-plugin-board-react/interfaces/Board.md)
- [`BoardLabel`](../../rxdb-plugin-board-react/interfaces/BoardLabel.md)
- [`Column`](../../rxdb-plugin-board-react/interfaces/Column.md)
- [`Task`](../../rxdb-plugin-board-react/interfaces/Task.md)
- [`Board`](../../rxdb-plugin-board-vue/interfaces/Board.md)
- [`BoardLabel`](../../rxdb-plugin-board-vue/interfaces/BoardLabel.md)
- [`Column`](../../rxdb-plugin-board-vue/interfaces/Column.md)
- [`Task`](../../rxdb-plugin-board-vue/interfaces/Task.md)
- [`P2PFileManifestEntity`](../../rxdb-plugin-p2p/classes/P2PFileManifestEntity.md)
- [`GraphEntityBase`](../../rxdb-plugin-graph/classes/GraphEntityBase.md)
- [`StorageFileMeta`](../../rxdb-plugin-storage/classes/StorageFileMeta.md)
- [`TreeAdjacencyListEntityBase`](../../rxdb-plugin-tree/classes/TreeAdjacencyListEntityBase.md)

## Type Parameters

| Type Parameter                                                                                  | Default type                      |
| ----------------------------------------------------------------------------------------------- | --------------------------------- |
| <a id="type-parameter-id"></a> `Id` _extends_ [`RxDBEntityId`](../type-aliases/RxDBEntityId.md) | [`UUID`](../type-aliases/UUID.md) |

## Implements

- [`IEntity`](../interfaces/IEntity.md)

## Constructors

### Constructor

```ts
new EntityBase<Id>(initData?): EntityBase<Id>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:222](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L222)

Entity base class constructor
Subclasses will have this constructor enhanced by the Entity decorator

#### Parameters

| Parameter   | Type      |
| ----------- | --------- |
| `initData?` | `unknown` |

#### Returns

`EntityBase`&lt;`Id`&gt;

## Properties

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:111](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L111)

Creation time
Automatically set to the current time when the entity is created

#### Implementation of

[`IEntity`](../interfaces/IEntity.md).[`createdAt`](../interfaces/IEntity.md#createdat)

---

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:123](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L123)

Creator ID
Records the user ID that created this entity

#### Implementation of

[`IEntity`](../interfaces/IEntity.md).[`createdBy`](../interfaces/IEntity.md#createdby)

---

### id \{#id\}

```ts
readonly id: Id;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:105](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L105)

The entity's unique identifier
An auto-generated UUID, used as the primary key

#### Implementation of

[`IEntity`](../interfaces/IEntity.md).[`id`](../interfaces/IEntity.md#id)

---

### remove \{#remove\}

```ts
remove: () => Promise<EntityBase<Id>>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:201](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L201)

Delete

#### Returns

`Promise`&lt;`EntityBase`&lt;`Id`&gt;&gt;

---

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:205](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L205)

Reset data

#### Returns

`void`

---

### save \{#save\}

```ts
save: () => Promise<EntityBase<Id>>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:214](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L214)

Saves the entity.

#### Returns

`Promise`&lt;`EntityBase`&lt;`Id`&gt;&gt;

#### Remarks

This entrance holds no transaction executor and re-enters the adapter queue.
Awaiting this method inside a transaction callback waits for the current transaction to end; use [TransactionExecutor.getRepository](../interfaces/TransactionExecutor.md#getrepository) instead.
See [RxDBAdapterLocalBase.transaction](RxDBAdapterLocalBase.md#transaction) for the complete positive and negative examples.

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L117)

Update time
Automatically set to the current time when the entity is created or updated

#### Implementation of

[`IEntity`](../interfaces/IEntity.md).[`updatedAt`](../interfaces/IEntity.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L129)

Updater ID
Records the user ID that last updated this entity

#### Implementation of

[`IEntity`](../interfaces/IEntity.md).[`updatedBy`](../interfaces/IEntity.md#updatedby)

---

### count \{#count\}

```ts
static count: <T>(this, options) => Observable<number>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:193](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L193)

Queries the number of entities

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                 | Description                                  |
| --------- | -------------------------------------------------------------------- | -------------------------------------------- |
| `this`    | new () => `T`                                                        | -                                            |
| `options` | [`CountOptions`](../interfaces/CountOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`number`&gt;

The count wrapped in an Observable

---

### find \{#find\}

```ts
static find: <T>(this, options) => Observable<T[]>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L163)

Queries multiple entities

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                               | Description                                                       |
| --------- | ------------------------------------------------------------------ | ----------------------------------------------------------------- |
| `this`    | new () => `T`                                                      | -                                                                 |
| `options` | [`FindOptions`](../interfaces/FindOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition, limit, offset, etc. |

#### Returns

`Observable`&lt;`T`[]&gt;

An array of entity instances wrapped in an Observable

---

### findAll \{#findall\}

```ts
static findAll: <T>(this, options) => Observable<T[]>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:173](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L173)

Queries all entities

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                     | Description                                                                   |
| --------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `this`    | new () => `T`                                                            | -                                                                             |
| `options` | [`FindAllOptions`](../interfaces/FindAllOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition and ordering (no quantity limit) |

#### Returns

`Observable`&lt;`T`[]&gt;

An array of entity instances wrapped in an Observable

---

### findByCursor \{#findbycursor\}

```ts
static findByCursor: <T>(this, options) => Observable<T[]>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:183](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L183)

Paginated query via cursor

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                               | Description                                                              |
| --------- | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `this`    | new () => `T`                                                                      | -                                                                        |
| `options` | [`FindByCursorOptions`](../interfaces/FindByCursorOptions.md)&lt;new () => `T`&gt; | Cursor pagination options, including orderBy and the before/after cursor |

#### Returns

`Observable`&lt;`T`[]&gt;

An array of entity instances wrapped in an Observable

---

### findOne \{#findone\}

```ts
static findOne: <T>(this, options) => Observable<T | null>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L143)

Finds one entity

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                     | Description                                  |
| --------- | ------------------------------------------------------------------------ | -------------------------------------------- |
| `this`    | new () => `T`                                                            | -                                            |
| `options` | [`FindOneOptions`](../interfaces/FindOneOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T` \| `null`&gt;

An entity instance or null wrapped in an Observable

---

### findOneOrFail \{#findoneorfail\}

```ts
static findOneOrFail: <T>(this, options) => Observable<T>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:153](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L153)

Finds one entity, throws when not found

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type                                                                                 | Description                                  |
| --------- | ------------------------------------------------------------------------------------ | -------------------------------------------- |
| `this`    | new () => `T`                                                                        | -                                            |
| `options` | [`FindOneOrFailOptions`](../interfaces/FindOneOrFailOptions.md)&lt;new () => `T`&gt; | Query options, including the where condition |

#### Returns

`Observable`&lt;`T`&gt;

An entity instance wrapped in an Observable

---

### get \{#get\}

```ts
static get: <T>(this, id) => Observable<T>;
```

Defined in: [packages/rxdb/src/entity/entity-base.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-base.ts#L136)

Gets an entity by id

#### Type Parameters

| Type Parameter                                                                      |
| ----------------------------------------------------------------------------------- |
| `T` _extends_ `EntityBase`&lt;[`RxDBEntityId`](../type-aliases/RxDBEntityId.md)&gt; |

#### Parameters

| Parameter | Type          | Description                    |
| --------- | ------------- | ------------------------------ |
| `this`    | new () => `T` | -                              |
| `id`      | `T`\[`"id"`\] | The entity's unique identifier |

#### Returns

`Observable`&lt;`T`&gt;

An entity instance wrapped in an Observable
