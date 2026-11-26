# commitRowMove()

```ts
function commitRowMove(move, hooks): Promise<boolean>;
```

Defined in: packages/rxdb-model/dist/entity-list/manual-order-list.d.ts:91

Coordinates persisting one row drag and drop

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `move` | [`RowMoveEvent`](../interfaces/RowMoveEvent.md) | The drag and drop result read from the table |
| `hooks` | [`RowMoveCommitHooks`](../interfaces/RowMoveCommitHooks.md) | UI hooks |

## Returns

`Promise`&lt;`boolean`&gt;

`true` when the persistence succeeded; `false` when dragging is not allowed or the persistence failed, in which case the table has already been restored to its original order

## Remarks

When not allowed, nothing is written and the table is restored directly (drag and drop events triggered programmatically are rejected as well). On success the table is not modified; it is refreshed by the live query based on the re-queried database result. On failure it is explicitly restored, and the next drag and drop works as usual.
