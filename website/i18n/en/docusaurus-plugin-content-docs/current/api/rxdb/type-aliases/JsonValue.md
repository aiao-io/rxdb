# JsonValue

```ts
type JsonValue = 
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | {
[key: string]: JsonValue;
};
```

Defined in: [packages/rxdb/src/entity/entity-value.utils.ts:296](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-value.utils.ts#L296)

A JSON-serializable value.

## Remarks

The upper bound of the type of [FieldValidationError.value](../interfaces/FieldValidationError.md#value): the error object
must survive a direct `JSON.stringify` and a trip over the network, so `Date` / `bigint` / `Uint8Array` are always
normalized to strings first, and values that cannot be converted safely are simply omitted.
