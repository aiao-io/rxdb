# EncryptedEntityResolver

```ts
type EncryptedEntityResolver = (entityName, namespace?) => 
  | EncryptedAwareEntity
  | undefined;
```

Defined in: [packages/rxdb-adapter-encrypted/src/metadata-validation.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/metadata-validation.ts#L63)

Resolves relation target metadata by entity name and optional namespace. Returning `undefined` makes cross-entity queries fail-closed.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `entityName` | `string` |
| `namespace?` | `string` |

## Returns

  \| [`EncryptedAwareEntity`](../interfaces/EncryptedAwareEntity.md)
  \| `undefined`