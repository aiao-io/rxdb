# formatAsTsv()

```ts
function formatAsTsv(clipboard): string;
```

Defined in: [packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts:227](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/vtable/table-clipboard.ts#L227)

Serializes ClipboardContent into a TSV string.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clipboard` | [`ClipboardContent`](../type-aliases/ClipboardContent.md) | The internal clipboard content |

## Returns

`string`

TSV-formatted text, with null/undefined values serialized as empty strings
