# formatAsTsv()

```ts
function formatAsTsv(clipboard): string;
```

Defined in: packages/rxdb-model/dist/entity-table/vtable/table-clipboard.d.ts:34

Serializes ClipboardContent to a TSV string

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `clipboard` | [`ClipboardContent`](../type-aliases/ClipboardContent.md) | The internal clipboard content |

## Returns

`string`

TSV-format text; null/undefined values are serialized as empty strings
