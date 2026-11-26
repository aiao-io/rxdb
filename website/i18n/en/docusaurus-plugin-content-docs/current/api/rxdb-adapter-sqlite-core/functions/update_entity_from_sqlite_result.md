# update_entity_from_sqlite_result()

```ts
function update_entity_from_sqlite_result<T>(adapter, EntityType, sqliteSuccessResult): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction\_sqlite\_result.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction_sqlite_result.ts#L174)

Updates the entity cache.
Only updates entities that already exist; delegates to transaction_sqlite_result.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter             | Type                                                           |
| --------------------- | -------------------------------------------------------------- |
| `adapter`             | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `EntityType`          | `T`                                                            |
| `sqliteSuccessResult` | [`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)  |

## Returns

`Promise`&lt;`void`&gt;
