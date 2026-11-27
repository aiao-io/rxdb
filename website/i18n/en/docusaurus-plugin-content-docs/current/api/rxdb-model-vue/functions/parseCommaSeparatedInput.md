# parseCommaSeparatedInput()

```ts
function parseCommaSeparatedInput(text, fieldType): unknown[];
```

Defined in: packages/rxdb-model/dist/query-builder/utils/value-input.d.ts:30

Parses a comma-separated string into an array.
Returns a number array when fieldType is 'number', otherwise a string array.

## Parameters

| Parameter   | Type     | Description                                                                                    |
| ----------- | -------- | ---------------------------------------------------------------------------------------------- |
| `text`      | `string` | Comma-separated string                                                                         |
| `fieldType` | `string` | Field type; when 'number', each item is parsed as a number and invalid values are filtered out |

## Returns

`unknown`[]

The parsed array (blank items are filtered out)
