# renameOpfsEntry()

```ts
function renameOpfsEntry(
   parent, 
   oldName, 
   newName, 
   kind
): Promise<void>;
```

Defined in: [packages/utils/src/@browser/opfs-rename.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/opfs-rename.ts#L42)

Validates an OPFS rename request; rejects it outright until the platform provides an atomic move that does not overwrite the target.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `parent` | `FileSystemDirectoryHandle` | The directory containing the source entry. |
| `oldName` | `string` | The existing source name. |
| `newName` | `string` | The requested target name. |
| `kind` | [`OpfsEntryKind`](../type-aliases/OpfsEntryKind.md) | The source entry kind. |

## Returns

`Promise`&lt;`void`&gt;

## Throws

`NotSupportedError` is thrown when the platform has no safe operation available.
