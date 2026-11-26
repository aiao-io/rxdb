# RowMoveCommitHooks

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:68

Hooks for interacting with the UI when committing a row drag-and-drop

## Properties

### enabled \{#enabled\}

```ts
readonly enabled: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:70

Whether the list allows drag reordering at the moment of the drop (the conclusion of [canReorderEntityList](../functions/canReorderEntityList.md))

## Methods

### reorder() \{#reorder\}

```ts
reorder(move): Promise<unknown>;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:72

Commit the reorder, usually `repository.reorder(move.id, { prevId, nextId })`

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

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:74

Restore the table rows to the most recently committed order

#### Returns

`void`

---

### setError() \{#seterror\}

```ts
setError(error): void;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:78

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

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:76

Reorder-in-progress state change

#### Parameters

| Parameter | Type      |
| --------- | --------- |
| `pending` | `boolean` |

#### Returns

`void`
