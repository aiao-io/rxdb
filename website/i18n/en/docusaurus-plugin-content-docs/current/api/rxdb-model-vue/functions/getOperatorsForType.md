# getOperatorsForType()

```ts
function getOperatorsForType(type, operators?): OperatorDefinition[];
```

Defined in: packages/rxdb-model/dist/query-builder/models/operator.interface.d.ts:47

Gets the operators applicable to a field type

## Parameters

| Parameter    | Type                                                          | Description                                                                     |
| ------------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `type`       | [`PropertyType`](../type-aliases/PropertyType.md)             | Field type                                                                      |
| `operators?` | [`OperatorDefinition`](../interfaces/OperatorDefinition.md)[] | Operator definition list (defaults to the built-in operators DEFAULT_OPERATORS) |

## Returns

[`OperatorDefinition`](../interfaces/OperatorDefinition.md)[]

Array of operators applicable to this field type
