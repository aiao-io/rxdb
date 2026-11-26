# readActiveDbName()

```ts
function readActiveDbName(storage): string | null;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L26)

Current active database name; no record = first launch (show the startup selection page).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `storage` | [`BoardStorage`](../interfaces/BoardStorage.md) |

## Returns

`string` \| `null`
