# clearRestoringMarker()

```ts
function clearRestoringMarker(storage): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L48)

Clears the restoring marker after restore finishes (successful switch or failed cleanup), re-enabling writes on every page.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |

## Returns

`void`
