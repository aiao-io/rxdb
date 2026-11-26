# writeActiveDbName()

```ts
function writeActiveDbName(storage, dbName): void;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L29)

Writes the new database as the active position only after read-back succeeds (US-537: an interruption before the switch commits still returns to the old position).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |
| `dbName` | `string` |

## Returns

`void`
