# readRestoringMarker()

```ts
function readRestoringMarker(storage): boolean;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L45)

Whether any page is restoring (writes pause while the marker exists).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |

## Returns

`boolean`
