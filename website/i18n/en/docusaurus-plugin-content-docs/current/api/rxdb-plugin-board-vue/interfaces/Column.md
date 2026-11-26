# Column

Defined in: packages/rxdb-plugin-board/dist/entities/column.entity.d.ts:10

`Column` — a column of the board: a sortable domain grouped by `boardId` (columns are dragged within the board).

## Remarks

`board_id` is a non-null foreign key with RESTRICT as the default cascade: deleting a board is preceded by the application-layer delete service clearing the columns, and deleting a board via direct SQL is still blocked by the foreign key. The immutability of `column.board_id` after creation is enforced at the domain service entry points (US-534 technical note); this entity does not promise storage-layer rejection. The `(boardId, sortOrder)` index serves in-board column ordering and the board deletion plan (the storage layer does not auto-create indexes for foreign keys).

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Implements

- [`ISortableEntity`](../../rxdb/interfaces/ISortableEntity.md)

## Properties

### boardId \{#boardid\}

```ts
boardId: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb-plugin-board/dist/entities/column.entity.d.ts:11

---

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:36

Creation time.
Automatically set to the current time when the entity is created.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdAt`](../../rxdb/classes/EntityBase.md#createdat)

---

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:46

Creator ID.
Records the ID of the user who created this entity.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

---

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:31

Unique entity identifier.
An automatically generated UUID used as the primary key.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

---

### remove \{#remove\}

```ts
remove: () => Promise<Column>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Deletes the entity.

#### Returns

`Promise`&lt;`Column`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

---

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

---

### save \{#save\}

```ts
save: () => Promise<Column>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`Column`&gt;

#### Remarks

This entry point does not hold a transaction executor and re-enters the adapter queue. Awaiting this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead. See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction) for complete positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

---

### sortOrder \{#sortorder\}

```ts
sortOrder: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/column.entity.d.ts:13

Sort key, non-null.

#### Implementation of

`ISortableEntity.sortOrder`

---

### title \{#title\}

```ts
title: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/column.entity.d.ts:12

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:41

Update time.
Automatically set to the current time when the entity is created or updated.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:51

Updater ID.
Records the ID of the user who last updated this entity.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)
