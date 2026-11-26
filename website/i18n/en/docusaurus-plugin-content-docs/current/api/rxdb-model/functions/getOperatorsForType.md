# getOperatorsForType()

```ts
function getOperatorsForType(type, operators?): OperatorDefinition[];
```

Defined in: [packages/rxdb-model/src/query-builder/models/operator.interface.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/query-builder/models/operator.interface.ts#L210)

Gets the operators applicable to a field type.

## Parameters

| Parameter | Type | Default value | Description |
| ------ | ------ | ------ | ------ |
| `type` | [`PropertyType`](../type-aliases/PropertyType.md) | `undefined` | The field type |
| `operators?` | [`OperatorDefinition`](../interfaces/OperatorDefinition.md)[] | `DEFAULT_OPERATORS` | The operator definition list (defaults to the built-in operators DEFAULT_OPERATORS) |

## Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

The array of operators applicable to the field type
