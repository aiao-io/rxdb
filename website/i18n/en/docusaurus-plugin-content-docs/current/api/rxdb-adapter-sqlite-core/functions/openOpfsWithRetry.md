# openOpfsWithRetry()

```ts
function openOpfsWithRetry<T>(open, options): Promise<T>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L56)

Opens an OPFS database; retries on a backoff sequence when the open fails with code `SQLITE_CANTOPEN`, or when creating a new VFS hits a temporary handle that has not been closed.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `open` | () => `Promise`&lt;`T`&gt; | One complete open (creates a new VFS and connection each time) |
| `options` | [`OpfsOpenRetryOptions`](../interfaces/OpfsOpenRetryOptions.md) | See [OpfsOpenRetryOptions](../interfaces/OpfsOpenRetryOptions.md) |

## Returns

`Promise`&lt;`T`&gt;

The result of `open`

## Throws

[RxDBAdapterSqliteError](../classes/RxDBAdapterSqliteError.md) When retries are exhausted and the handle is still held, or when the probe itself fails and cannot determine whether it is held; the last open error is attached to `cause`
