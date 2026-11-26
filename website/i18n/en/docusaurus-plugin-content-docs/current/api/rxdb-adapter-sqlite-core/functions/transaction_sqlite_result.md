# transaction_sqlite_result()

```ts
function transaction_sqlite_result<T>(
  adapter,
  EntityType,
  sqliteSuccessResult,
  forcedUpdate?,
  skipCreate?,
  mergeExternalChanges?,
  submissions?
): Promise<InstanceType<T>[]>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/transaction\_sqlite\_result.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/transaction_sqlite_result.ts#L94)

Handles a SQLite transaction result, returning an entity array

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter               | Type                                                           | Default value | Description                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `adapter`               | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) | `undefined`   | -                                                                                                                                                                                                                                                 |
| `EntityType`            | `T`                                                            | `undefined`   | -                                                                                                                                                                                                                                                 |
| `sqliteSuccessResult`   | [`SqliteSuccessResult`](../interfaces/SqliteSuccessResult.md)  | `undefined`   | -                                                                                                                                                                                                                                                 |
| `forcedUpdate?`         | `boolean`                                                      | `false`       | -                                                                                                                                                                                                                                                 |
| `skipCreate?`           | `boolean`                                                      | `false`       | Skip creating new entities (only update existing cache entries)                                                                                                                                                                                   |
| `mergeExternalChanges?` | `boolean`                                                      | `false`       | Merge database data while preserving unsaved fields                                                                                                                                                                                               |
| `submissions?`          | `SqliteWriteSubmissions`&lt;`T`&gt;                            | `undefined`   | The submission records of this write (indexed by the written entity): matched cached entities are finalized via `EntityStatus.applyWriteResult`, advancing the baseline with the returned rows and preserving new edits made after the submission |

## Returns

`Promise`&lt;`InstanceType`&lt;`T`&gt;[]&gt;
