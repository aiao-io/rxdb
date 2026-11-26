# validateFTSRegistrationAgainstEncryptedColumns()

```ts
function validateFTSRegistrationAgainstEncryptedColumns(args): void;
```

Defined in: [packages/rxdb-adapter-encrypted/src/metadata-validation.ts:337](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/metadata-validation.ts#L337)

Rejects registering encrypted columns into an FTS index.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | \{ `entity`: [`EncryptedAwareEntity`](../interfaces/EncryptedAwareEntity.md); `ftsColumns`: readonly `string`[]; \} |
| `args.entity` | [`EncryptedAwareEntity`](../interfaces/EncryptedAwareEntity.md) |
| `args.ftsColumns` | readonly `string`[] |

## Returns

`void`

## Throws

[EncryptedConfigurationError](../classes/EncryptedConfigurationError.md) code is fixed to `encrypted_fts_forbidden`