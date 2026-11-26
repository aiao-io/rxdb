# isOpfsAccessHandleBusy()

```ts
function isOpfsAccessHandleBusy(fileName): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts:165](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/opfs-open-retry.ts#L165)

Whether the database file under the OPFS root is currently held by a synchronous access handle in another context.

## Parameters

| Parameter  | Type     | Description            |
| ---------- | -------- | ---------------------- |
| `fileName` | `string` | The database file name |

## Returns

`Promise`&lt;`boolean`&gt;

`false` when the handle can be opened (and is closed right away) or the file does not exist; `true` when it is held (`NoModificationAllowedError`)

## Remarks

`createSyncAccessHandle()` is only available inside a dedicated Worker; the OPFS VFS itself also only runs in a Worker.
