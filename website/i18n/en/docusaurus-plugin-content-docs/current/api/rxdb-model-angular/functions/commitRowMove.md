# commitRowMove()

```ts
function commitRowMove(move, hooks): Promise<boolean>;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:91

Coordinates persisting a row drag-and-drop move

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `move` | [`RowMoveEvent`](../interfaces/RowMoveEvent.md) | The drag-and-drop result read from the table |
| `hooks` | [`RowMoveCommitHooks`](../interfaces/RowMoveCommitHooks.md) | UI hooks |

## Returns

`Promise`&lt;`boolean`&gt;

`true` when the write succeeded; `false` when the drag is not allowed or the write failed, in which case the table has already been restored to its original order

## Remarks

When not allowed, nothing is written and the table is restored immediately (programmatically triggered drag events are rejected the same way). On success the table is left unchanged and refreshed by the live query re-reading the database; on failure it is explicitly restored, and the next drag works as usual.
