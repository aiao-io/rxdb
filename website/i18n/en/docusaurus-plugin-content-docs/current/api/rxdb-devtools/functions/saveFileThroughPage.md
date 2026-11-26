# saveFileThroughPage()

```ts
function saveFileThroughPage(file, name): Promise<void>;
```

Defined in: [connector-providers.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/connector-providers.ts#L76)

Saves a file through the page's own download path.

## Parameters

| Parameter | Type     | Description              |
| --------- | -------- | ------------------------ |
| `file`    | `File`   | The file to save.        |
| `name`    | `string` | The suggested file name. |

## Returns

`Promise`&lt;`void`&gt;

## Remarks

The bytes neither enter the JS heap nor travel the wire — the object URL keeps the Blob backed by OPFS.
See item 2 of the OPFS provider module header.
