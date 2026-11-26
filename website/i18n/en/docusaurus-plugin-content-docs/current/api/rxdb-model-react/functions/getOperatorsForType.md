# getOperatorsForType()

```ts
function getOperatorsForType(type, operators?): OperatorDefinition[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:47

Gets the operators applicable to a field type

## Parameters

| Parameter    | Type                                                          | Description                                                               |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `type`       | [`PropertyType`](../type-aliases/PropertyType.md)             | The field type                                                            |
| `operators?` | [`OperatorDefinition`](../interfaces/OperatorDefinition.md)[] | List of operator definitions (defaults to the built-in DEFAULT_OPERATORS) |

## Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of operators applicable to this field type
