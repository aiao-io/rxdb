# getInputType()

```ts
function getInputType(fieldType, operator, enumOptions?, operatorRegistry?): string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/value-input.d.ts:14

Determines the input control type for a query condition value based on the field type and the operator.

## Parameters

| Parameter           | Type                                                 | Description                                                     |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `fieldType`         | `string`                                             | The field type (e.g. 'string', 'number', 'date', 'enum', etc.)  |
| `operator`          | `string`                                             | The operator key (e.g. 'between', 'in', 'null', etc.)           |
| `enumOptions?`      | `unknown`[]                                          | The field's enum option list                                    |
| `operatorRegistry?` | [`OperatorRegistry`](../classes/OperatorRegistry.md) | The operator registry (defaults to the global default registry) |

## Returns

`string`

The input control type identifier (e.g. 'string', 'number', 'boolean', 'date', 'range', 'array', 'enum', 'enum-array', 'subquery', 'uuid', 'none')
