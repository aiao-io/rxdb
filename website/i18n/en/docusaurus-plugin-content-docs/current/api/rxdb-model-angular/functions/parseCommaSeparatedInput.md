# parseCommaSeparatedInput()

```ts
function parseCommaSeparatedInput(text, fieldType): unknown[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/value-input.d.ts:30

Parses a comma-separated string into an array.
Returns an array of numbers when fieldType is 'number', otherwise an array of strings.

## Parameters

| Parameter   | Type     | Description                                                                                              |
| ----------- | -------- | -------------------------------------------------------------------------------------------------------- |
| `text`      | `string` | The comma-separated string                                                                               |
| `fieldType` | `string` | The field type; when it is 'number', each item is parsed as a number and invalid values are filtered out |

## Returns

`unknown`[]

The parsed array (blank items are filtered out)
