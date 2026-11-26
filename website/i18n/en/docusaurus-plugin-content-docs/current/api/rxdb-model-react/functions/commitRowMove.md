# commitRowMove()

```ts
function commitRowMove(move, hooks): Promise<boolean>;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:91

Coordinates persisting a single row drag-and-drop

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `move` | [`RowMoveEvent`](../interfaces/RowMoveEvent.md) | The drag-and-drop result read from the table |
| `hooks` | [`RowMoveCommitHooks`](../interfaces/RowMoveCommitHooks.md) | UI hooks |

## Returns

`Promise`&lt;`boolean`&gt;

`true` when the move was persisted successfully; `false` when dragging is not allowed or persisting failed, in which case the table has been restored to its original order

## Remarks

When not allowed, nothing is written and the table is restored directly (programmatically triggered drag events are rejected too). On success the table is left unchanged and refreshed by the live query re-querying the database; on failure it is restored explicitly, and the next drag works as usual.
