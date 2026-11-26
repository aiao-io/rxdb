# Task

Defined in: packages/rxdb-plugin-board/dist/entities/task.entity.d.ts:11

`Task` — a board task: a sortable domain grouped by `columnId` (manually ordered within a column).

## Remarks

No separate `board_id`: the board is derived from the owning column, a single source of truth (US-534). `dueDate` is a plain date string `YYYY-MM-DD`, never converted through `Date` / UTC (US-536); stored in column `due_date`. Title and description declare `searchable` from the first persisted version, and the search plugin maintains the index from phase A (first slice of the epic). The storage layer does not auto-create indexes for foreign keys: `(columnId, sortOrder)` serves column rendering, default ordering within the group and the column / board deletion plans.

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Implements

- [`ISortableEntity`](../../rxdb/interfaces/ISortableEntity.md)

## Properties

### columnId \{#columnid\}

```ts
columnId: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb-plugin-board/dist/entities/task.entity.d.ts:12

***

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:36

Creation time.
Automatically set to the current time when the entity is created.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdAt`](../../rxdb/classes/EntityBase.md#createdat)

***

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:46

Creator ID.
Records the ID of the user who created this entity.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

***

### description \{#description\}

```ts
description: string | null;
```

Defined in: packages/rxdb-plugin-board/dist/entities/task.entity.d.ts:14

***

### dueDate \{#duedate\}

```ts
dueDate: string | null;
```

Defined in: packages/rxdb-plugin-board/dist/entities/task.entity.d.ts:15

***

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:31

Unique entity identifier.
An automatically generated UUID used as the primary key.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

***

### remove \{#remove\}

```ts
remove: () => Promise<Task>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Deletes the entity.

#### Returns

`Promise`&lt;`Task`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

***

### reset \{#reset\}

```ts
reset: () => void;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:101

Resets the data.

#### Returns

`void`

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`reset`](../../rxdb/classes/EntityBase.md#reset)

***

### save \{#save\}

```ts
save: () => Promise<Task>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`Task`&gt;

#### Remarks

This entry point does not hold a transaction executor and re-enters the adapter queue. Awaiting this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead. See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction) for complete positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

***

### sortOrder \{#sortorder\}

```ts
sortOrder: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/task.entity.d.ts:16

Sort key, non-null.

#### Implementation of

`ISortableEntity.sortOrder`

***

### title \{#title\}

```ts
title: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/task.entity.d.ts:13

***

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:41

Update time.
Automatically set to the current time when the entity is created or updated.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

***

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:51

Updater ID.
Records the ID of the user who last updated this entity.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)
