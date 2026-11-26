# handle_rxdb_change()

```ts
function handle_rxdb_change<T>(adapter, event): Promise<void>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/handle\_rxdb\_change.ts:257](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/handle_rxdb_change.ts#L257)

Handles SQLite change events, converting row changes triggered by update_hook into RxDB entity events.

Designed as fire-and-forget: called synchronously by update_hook, its internal async queries do not block the caller. Failures are reported through [RxDBAdapterSqliteBase.emitChangeError](../classes/RxDBAdapterSqliteBase.md#emitchangeerror) (degrading to `console.error` when there is no listener); this path has no caller, so throwing would only become an unhandled rejection (SQLC-012). Under high-frequency workloads event handling may pile up, but since SqliteClient's internal queue guarantees serial execution, no concurrency problems arise.

## Type Parameters

| Type Parameter                                                                                    |
| ------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

## Parameters

| Parameter | Type                                                           |
| --------- | -------------------------------------------------------------- |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `event`   | [`SqliteChangeEvent`](../interfaces/SqliteChangeEvent.md)      |

## Returns

`Promise`&lt;`void`&gt;
