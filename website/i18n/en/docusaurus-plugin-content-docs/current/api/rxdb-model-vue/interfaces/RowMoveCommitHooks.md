# RowMoveCommitHooks

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:68

Hooks that interact with the UI when a row drag and drop is committed to storage

## Properties

### enabled \{#enabled\}

```ts
readonly enabled: boolean;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:70

Whether the list allows drag-and-drop reordering at the moment of the drop (the conclusion of [canReorderEntityList](../functions/canReorderEntityList.md))

## Methods

### reorder() \{#reorder\}

```ts
reorder(move): Promise<unknown>;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:72

Commits the reorder to storage, usually `repository.reorder(move.id, { prevId, nextId })`

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `move` | [`RowMoveEvent`](RowMoveEvent.md) |

#### Returns

`Promise`&lt;`unknown`&gt;

***

### restore() \{#restore\}

```ts
restore(): void;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:74

Restores the table rows to the most recently committed order

#### Returns

`void`

***

### setError() \{#seterror\}

```ts
setError(error): void;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:78

Shows (or clears with `null`) the commit error

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `error` | `unknown` |

#### Returns

`void`

***

### setPending() \{#setpending\}

```ts
setPending(pending): void;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:76

Reports the change of the in-progress reorder state

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `pending` | `boolean` |

#### Returns

`void`
