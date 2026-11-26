# getFingerprintByEntity()

```ts
function getFingerprintByEntity<T>(entity): Fingerprint[];
```

Defined in: [packages/rxdb/src/repository/fingerprint.utils.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/fingerprint.utils.ts#L30)

Computes the fingerprint of a single entity.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `entity` | `InstanceType`&lt;`T`&gt; \| `null` \| `undefined` | The entity whose fingerprint to compute |

## Returns

[`Fingerprint`](../type-aliases/Fingerprint.md)[]

The fingerprint array
