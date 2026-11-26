# parsePropertyColumnValue()

```ts
function parsePropertyColumnValue(type, raw): unknown;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:524](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L524)

Parses the string value entered in the input-editor back into the property's original type.

Call this function in the cellChanged event handler to convert user input into the correct JS type before saving.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `type` | `string` | The property type |
| `raw` | `unknown` | The raw value entered in the editor |

## Returns

`unknown`

The parsed property value
