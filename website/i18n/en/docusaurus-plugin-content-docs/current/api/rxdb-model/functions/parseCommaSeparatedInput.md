# parseCommaSeparatedInput()

```ts
function parseCommaSeparatedInput(text, fieldType): unknown[];
```

Defined in: [packages/rxdb-model/src/query-builder/utils/value-input.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/value-input.ts#L96)

Parses a comma-separated string into an array.
Returns an array of numbers when fieldType is 'number', otherwise an array of strings.

## Parameters

| Parameter   | Type     | Description                                                                                        |
| ----------- | -------- | -------------------------------------------------------------------------------------------------- |
| `text`      | `string` | The comma-separated string                                                                         |
| `fieldType` | `string` | The field type; when 'number', each item is parsed as a number and invalid values are filtered out |

## Returns

`unknown`[]

The parsed array (blank items are filtered out)
