# formatEntityFieldValue()

```ts
function formatEntityFieldValue(
   type, 
   value, 
   format?
): string;
```

Defined in: packages/rxdb-model/dist/entity-value.utils.d.ts:40

Formats a field value into a display string

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

Dates are displayed in local format, arrays are joined with a comma and a space, and JSON-like values are serialized to JSON strings.
`format` only affects the display form: currency / percentage / rating / duration / date display modes
