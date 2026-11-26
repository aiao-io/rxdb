# getFingerprintByEntities()

```ts
function getFingerprintByEntities<T>(entities): Fingerprint[];
```

Defined in: [packages/rxdb/src/repository/fingerprint.utils.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/fingerprint.utils.ts#L44)

Computes the fingerprints of multiple entities.

## Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter  | Type                        | Description                                         |
| ---------- | --------------------------- | --------------------------------------------------- |
| `entities` | `InstanceType`&lt;`T`&gt;[] | The array of entities whose fingerprints to compute |

## Returns

[`Fingerprint`](../type-aliases/Fingerprint.md)[]

The fingerprint array
