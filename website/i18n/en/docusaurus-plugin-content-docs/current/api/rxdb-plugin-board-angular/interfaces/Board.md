# Board

Defined in: packages/rxdb-plugin-board/dist/entities/board.entity.d.ts:5

`Board` — the board of the board: title required, description optional; columns and board-level labels are attached to the board (US-534 / US-536).

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Properties

### createdAt \{#createdat\}

```ts
readonly createdAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:36

Creation time
Automatically set to the current time when the entity is created

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdAt`](../../rxdb/classes/EntityBase.md#createdat)

---

### createdBy? \{#createdby\}

```ts
readonly createdBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:46

Creator ID
Records the user ID that created this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`createdBy`](../../rxdb/classes/EntityBase.md#createdby)

---

### description \{#description\}

```ts
description: string | null;
```

Defined in: packages/rxdb-plugin-board/dist/entities/board.entity.d.ts:7

---

### id \{#id\}

```ts
readonly id: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:31

Unique identifier of the entity
Auto-generated UUID used as the primary key

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`id`](../../rxdb/classes/EntityBase.md#id)

---

### remove \{#remove\}

```ts
remove: () => Promise<Board>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Delete

#### Returns

`Promise`&lt;`Board`&gt;

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`remove`](../../rxdb/classes/EntityBase.md#remove)

---

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

---

### save \{#save\}

```ts
save: () => Promise<Board>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`Board`&gt;

#### Remarks

This entry does not hold a transaction executor and re-enters the adapter queue.
Waiting on this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead.
See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction) for complete positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

---

### title \{#title\}

```ts
title: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/board.entity.d.ts:6

---

### updatedAt \{#updatedat\}

```ts
readonly updatedAt: Date;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:41

Update time
Automatically set to the current time when the entity is created or updated

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedAt`](../../rxdb/classes/EntityBase.md#updatedat)

---

### updatedBy? \{#updatedby\}

```ts
readonly updatedBy?: `${string}-${string}-${string}-${string}-${string}` | null;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:51

Updater ID
Records the user ID that last updated this entity

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`updatedBy`](../../rxdb/classes/EntityBase.md#updatedby)
