# assertOptionalNonNegativeSafeInteger()

```ts
function assertOptionalNonNegativeSafeInteger(value, errorMessage): number | undefined;
```

Defined in: [packages/rxdb/src/repository/number-validation.utils.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/number-validation.utils.ts#L11)

Validates an optional non-negative safe integer, without giving the default value any domain semantics.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `value` | `number` \| `undefined` | The value to validate |
| `errorMessage` | `string` | Error message used when validation fails |

## Returns

`number` \| `undefined`

The original value, including `undefined`.

## Throws

[RxDBError](../classes/RxDBError.md) When the provided value is not a non-negative safe integer.
