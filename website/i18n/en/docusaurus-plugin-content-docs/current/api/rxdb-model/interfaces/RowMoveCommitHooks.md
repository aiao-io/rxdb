# RowMoveCommitHooks

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L118)

Hooks for interacting with the UI when a row drag-and-drop is committed to storage

## Properties

### enabled \{#enabled\}

```ts
readonly enabled: boolean;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L120)

Whether the list allows drag-and-drop ordering at the moment of the drop (the verdict of [canReorderEntityList](../functions/canReorderEntityList.md))

## Methods

### reorder() \{#reorder\}

```ts
reorder(move): Promise<unknown>;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L122)

Commit the reorder to storage, typically `repository.reorder(move.id, { prevId, nextId })`

#### Parameters

| Parameter | Type                              |
| --------- | --------------------------------- |
| `move`    | [`RowMoveEvent`](RowMoveEvent.md) |

#### Returns

`Promise`&lt;`unknown`&gt;

---

### restore() \{#restore\}

```ts
restore(): void;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L124)

Restore the table rows to the most recently committed order

#### Returns

`void`

---

### setError() \{#seterror\}

```ts
setError(error): void;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L128)

Show (or clear with `null`) the commit error

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `error`   | `unknown` |

#### Returns

`void`

---

### setPending() \{#setpending\}

```ts
setPending(pending): void;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L126)

Reorder-in-progress state change

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `pending` | `boolean` |

#### Returns

`void`
