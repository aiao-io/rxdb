# isSqlResultEmpty()

```ts
function isSqlResultEmpty(result): boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-core.utils.ts#L77)

Checks whether a sqlite result is empty

## Parameters

| Parameter | Type                                                          | Description             |
| --------- | ------------------------------------------------------------- | ----------------------- |
| `result`  | [`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md) | The SQLite query result |

## Returns

`boolean`

Whether it is an empty result
