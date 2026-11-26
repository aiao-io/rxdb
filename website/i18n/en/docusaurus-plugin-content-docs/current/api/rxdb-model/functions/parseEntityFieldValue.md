# parseEntityFieldValue()

```ts
function parseEntityFieldValue(type, raw): unknown;
```

Defined in: [packages/rxdb-model/src/entity-value.utils.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-value.utils.ts#L112)

Parses a raw value into the target value of the given field type.

## Parameters

| Parameter | Type      | Description    |
| --------- | --------- | -------------- |
| `type`    | `string`  | The field type |
| `raw`     | `unknown` | The raw value  |

## Returns

`unknown`

The parsed value

## Remarks

Empty values (null / undefined / empty string) uniformly return null; unrecognized types are returned unchanged.
