# writePendingSwitch()

```ts
function writePendingSwitch(storage, dbName): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L32)

Restore complete → writes the pending switch record and reloads the whole page.

## Parameters

| Parameter | Type                                            |
| --------- | ----------------------------------------------- |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |
| `dbName`  | `string`                                        |

## Returns

`void`
