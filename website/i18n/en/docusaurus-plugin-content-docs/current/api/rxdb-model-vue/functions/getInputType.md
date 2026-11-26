# getInputType()

```ts
function getInputType(fieldType, operator, enumOptions?, operatorRegistry?): string;
```

Defined in: packages/rxdb-model/dist/query-builder/utils/value-input.d.ts:14

Determines the input control type for the query condition value based on the field type and operator.

## Parameters

| Parameter           | Type                                                 | Description                                                   |
| ------------------- | ---------------------------------------------------- | ------------------------------------------------------------- |
| `fieldType`         | `string`                                             | Field type (such as 'string', 'number', 'date', 'enum', etc.) |
| `operator`          | `string`                                             | Operator key (such as 'between', 'in', 'null', etc.)          |
| `enumOptions?`      | `unknown`[]                                          | The field's enum option list                                  |
| `operatorRegistry?` | [`OperatorRegistry`](../classes/OperatorRegistry.md) | Operator registry (defaults to the global default registry)   |

## Returns

`string`

Input control type identifier (such as 'string', 'number', 'boolean', 'date', 'range', 'array', 'enum', 'enum-array', 'subquery', 'uuid', 'none')
