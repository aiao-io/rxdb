# nextRestoreDbName()

```ts
function nextRestoreDbName(activeDbName, existing?): string;
```

Defined in: [packages/rxdb-plugin-board/src/board-storage.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-board/src/board-storage.ts#L51)

Generates a new database name that does not conflict with the active position.

## Parameters

| Parameter | Type | Default value |
| ------ | ------ | ------ |
| `activeDbName` | `string` \| `null` | `undefined` |
| `existing?` | readonly `string`[] | `[]` |

## Returns

`string`
