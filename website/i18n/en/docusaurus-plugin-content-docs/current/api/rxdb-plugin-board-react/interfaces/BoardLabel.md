# BoardLabel

Defined in: packages/rxdb-plugin-board/dist/entities/board-label.entity.d.ts:9

`BoardLabel` — board-level label definition: a name unique within the board plus a color; tasks reference labels many-to-many (US-536).

## Remarks

The unique constraint `(boardId, name)` compares exactly and preserves case (`normalized` is false); duplicate names within the same board and same names across different boards both get deterministic storage-layer semantics: the former is rejected, the latter allowed.

## Extends

- [`EntityBase`](../../rxdb/classes/EntityBase.md)

## Properties

### boardId \{#boardid\}

```ts
boardId: `${string}-${string}-${string}-${string}-${string}`;
```

Defined in: packages/rxdb-plugin-board/dist/entities/board-label.entity.d.ts:10

***

### color \{#color\}

```ts
color: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/board-label.entity.d.ts:12

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

### name \{#name\}

```ts
name: string;
```

Defined in: packages/rxdb-plugin-board/dist/entities/board-label.entity.d.ts:11

***

### remove \{#remove\}

```ts
remove: () => Promise<BoardLabel>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:97

Deletes the entity.

#### Returns

`Promise`&lt;`BoardLabel`&gt;

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
save: () => Promise<BoardLabel>;
```

Defined in: packages/rxdb/dist/entity/entity-base.d.ts:110

Saves the entity.

#### Returns

`Promise`&lt;`BoardLabel`&gt;

#### Remarks

This entry point does not hold a transaction executor and re-enters the adapter queue. Awaiting this method inside a transaction callback waits for the current transaction to finish; use [TransactionExecutor.getRepository](../../rxdb/interfaces/TransactionExecutor.md#getrepository) instead. See [RxDBAdapterLocalBase.transaction](../../rxdb/classes/RxDBAdapterLocalBase.md#transaction) for complete positive and negative examples.

#### Inherited from

[`EntityBase`](../../rxdb/classes/EntityBase.md).[`save`](../../rxdb/classes/EntityBase.md#save)

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
