# clearPendingSwitch()

```ts
function clearPendingSwitch(storage): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L39)

Clears the pending switch record after a successful read-back is written as the active position, or after a failed read-back cleans up the target.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |

## Returns

`void`
