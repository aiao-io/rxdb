# writeRestoringMarker()

```ts
function writeRestoringMarker(storage): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L42)

Restoring marker: all pages pause writes based on it (state source of the US-534 restoring write gate).

## Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |

## Returns

`void`
