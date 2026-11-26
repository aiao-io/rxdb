# parseEntityFieldValue()

```ts
function parseEntityFieldValue(type, raw): unknown;
```

Defined in: packages/rxdb-model/dist/entity-value.utils.d.ts:20

Parses a raw value into the target value of the given field type

## Parameters

| Parameter | Type      | Description    |
| --------- | --------- | -------------- |
| `type`    | `string`  | The field type |
| `raw`     | `unknown` | The raw value  |

## Returns

`unknown`

The parsed value

## Remarks

Empty values (null / undefined / empty string) all return null; unrecognized types are returned as-is
