# commitRowMove()

```ts
function commitRowMove(move, hooks): Promise<boolean>;
```

Defined in: [packages/rxdb-model/src/entity-list/manual-order-list.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/manual-order-list.ts#L142)

Coordinates persisting a single row drag-drop

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `move` | [`RowMoveEvent`](../interfaces/RowMoveEvent.md) | The drag-drop result read from the table |
| `hooks` | [`RowMoveCommitHooks`](../interfaces/RowMoveCommitHooks.md) | UI hooks |

## Returns

`Promise`&lt;`boolean`&gt;

`true` when persisted successfully; `false` when dragging is not allowed or persisting failed, in which case the table has already restored its original order

## Remarks

When not allowed, zero writes happen and the table is restored directly (drag-drop events triggered programmatically are also rejected). On success the table is not changed;
it is refreshed by the result the live query re-reads from the database. On failure it is explicitly restored, and the next drag-drop works as usual.
