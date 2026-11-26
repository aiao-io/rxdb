# formatEntityFieldValue()

```ts
function formatEntityFieldValue(
   type, 
   value, 
   format?
): string;
```

Defined in: [packages/rxdb-model/src/entity-value.utils.ts:247](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-value.utils.ts#L247)

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

Dates are displayed in the local format, arrays are joined with a comma plus a space, and JSON-like values are serialized as JSON strings.
`format` only affects the display form: currency/percentage/rating/duration/date display modes
