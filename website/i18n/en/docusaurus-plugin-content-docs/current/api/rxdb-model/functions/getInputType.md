# getInputType()

```ts
function getInputType(fieldType, operator, enumOptions?, operatorRegistry?): string;
```

Defined in: [packages/rxdb-model/src/query-builder/utils/value-input.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/utils/value-input.ts#L19)

Determines the input control type for a query condition value based on the field type and operator.

## Parameters

| Parameter           | Type                                                 | Description                                                     |
| ------------------- | ---------------------------------------------------- | --------------------------------------------------------------- |
| `fieldType`         | `string`                                             | The field type (e.g. 'string', 'number', 'date', 'enum', etc.)  |
| `operator`          | `string`                                             | The operator key (e.g. 'between', 'in', 'null', etc.)           |
| `enumOptions?`      | `unknown`[]                                          | The field's list of enum options                                |
| `operatorRegistry?` | [`OperatorRegistry`](../classes/OperatorRegistry.md) | The operator registry (defaults to the global default registry) |

## Returns

`string`

The input control type identifier (e.g. 'string', 'number', 'boolean', 'date', 'range', 'array', 'enum', 'enum-array', 'subquery', 'uuid', 'none')
