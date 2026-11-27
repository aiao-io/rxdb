# isStorageNotFoundError()

```ts
function isStorageNotFoundError(error): boolean;
```

Defined in: [packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-storage/src/filesystem/storage-filesystem.ts#L181)

Checks whether an error means "target not found".

## Parameters

| Parameter | Type      |
| --------- | --------- |
| `error`   | `unknown` |

## Returns

`boolean`

## Remarks

Accepts both `DOMException` and plain objects with the same structure: errors
restored across IPC are not `DOMException` instances, and judging by
`instanceof` alone would mistake "file not found" for a real fault and trigger
an unnecessary rollback.
