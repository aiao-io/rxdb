# validateEncryptedPropertyMetadata()

```ts
function validateEncryptedPropertyMetadata(entity): void;
```

Defined in: [packages/rxdb-adapter-encrypted/src/metadata-validation.ts:232](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/metadata-validation.ts#L232)

Validates that encrypted properties cannot participate in primary key, foreign key, index, unique, sortable, computed columns or FTS.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `entity` | [`EncryptedAwareEntity`](../interfaces/EncryptedAwareEntity.md) |

## Returns

`void`

## Throws

[EncryptedConfigurationError](../classes/EncryptedConfigurationError.md) Unsupported metadata combination