# getFingerprintPrimitive()

```ts
function getFingerprintPrimitive<T>(value): Fingerprint[];
```

Defined in: [packages/rxdb/src/repository/fingerprint.utils.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/fingerprint.utils.ts#L21)

Value-type fingerprint computation.
Used by queries that return primitive values such as count.

## Type Parameters

| Type Parameter                                                                              |
| ------------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`Fingerprint`](../type-aliases/Fingerprint.md) |

## Parameters

| Parameter | Type         | Description              |
| --------- | ------------ | ------------------------ |
| `value`   | `T` \| `T`[] | The value to fingerprint |

## Returns

[`Fingerprint`](../type-aliases/Fingerprint.md)[]

The fingerprint array.
