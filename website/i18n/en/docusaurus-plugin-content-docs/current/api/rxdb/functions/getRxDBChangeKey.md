# getRxDBChangeKey()

```ts
function getRxDBChangeKey<T>(change): string;
```

Defined in: [packages/rxdb/src/sync-contract/VersionManager.utils.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/VersionManager.utils.ts#L9)

Constructs the unique key of a business entity (used for the deletes/updates/inserts Maps).

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`IRxDBChange`](../interfaces/IRxDBChange.md) |

## Parameters

| Parameter | Type | Description             |
| --------- | ---- | ----------------------- |
| `change`  | `T`  | The RxDBChange instance |

## Returns

`string`

Format: "namespace:entity:entityId"
