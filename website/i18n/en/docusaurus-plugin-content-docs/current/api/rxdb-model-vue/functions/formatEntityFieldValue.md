# formatEntityFieldValue()

```ts
function formatEntityFieldValue(
   type, 
   value, 
   format?
): string;
```

Defined in: packages/rxdb-model/dist/entity-value.utils.d.ts:40

Formats a field value as a display string

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `string` | Field type |
| `value` | `unknown` | Field value |
| `format?` | [`FieldFormat`](../../rxdb/type-aliases/FieldFormat.md) | Field semantic annotation (optional) |

## Returns

`string`

The formatted string

## Remarks

Dates are displayed in locale format, arrays are joined with comma + space, and JSON-like values are serialized as JSON strings.
`format` only affects the display shape: currency/percentage/rating/duration/date display modes
