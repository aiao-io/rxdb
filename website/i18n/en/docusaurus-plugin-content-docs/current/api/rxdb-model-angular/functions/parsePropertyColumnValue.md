# parsePropertyColumnValue()

```ts
function parsePropertyColumnValue(type, raw): unknown;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:128

Parses the string value entered in an input-editor back to the property's original type

Call this function in the cellChanged event handler to convert user input into the correct JS type before saving.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `string` | The property type |
| `raw` | `unknown` | The raw value entered in the editor |

## Returns

`unknown`

The parsed property value
