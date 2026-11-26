# validateQueryAgainstEncryptedColumns()

```ts
function validateQueryAgainstEncryptedColumns(args): void;
```

Defined in: [packages/rxdb-adapter-encrypted/src/metadata-validation.ts:289](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/metadata-validation.ts#L289)

Rejects filtering, ordering, grouping or explicit projection over encrypted columns.

Relation paths must be fully resolvable by `resolveEntity`; dotted paths that cannot be decided fail-closed.
Adapters can use `normalizeField` to restore SQL aliases back to logical property paths.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `args` | \{ `entity`: [`EncryptedAwareEntity`](../interfaces/EncryptedAwareEntity.md); `group?`: readonly `string`[]; `normalizeField?`: `EncryptedFieldPathNormalizer`; `order?`: readonly `object`[]; `projection?`: readonly `string`[]; `resolveEntity?`: [`EncryptedEntityResolver`](../type-aliases/EncryptedEntityResolver.md); `where?`: `ParsedWhere`; \} |
| `args.entity` | [`EncryptedAwareEntity`](../interfaces/EncryptedAwareEntity.md) |
| `args.group?` | readonly `string`[] |
| `args.normalizeField?` | `EncryptedFieldPathNormalizer` |
| `args.order?` | readonly `object`[] |
| `args.projection?` | readonly `string`[] |
| `args.resolveEntity?` | [`EncryptedEntityResolver`](../type-aliases/EncryptedEntityResolver.md) |
| `args.where?` | `ParsedWhere` |

## Returns

`void`

## Throws

[EncryptedQueryError](../classes/EncryptedQueryError.md) An encrypted column was hit, or a cross-layer path cannot be resolved reliably