# readPendingSwitch()

```ts
function readPendingSwitch(storage): string | null;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:36](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L36)

Pending switch database name; no record = no restore awaiting read-back.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |

## Returns

`string` \| `null`
