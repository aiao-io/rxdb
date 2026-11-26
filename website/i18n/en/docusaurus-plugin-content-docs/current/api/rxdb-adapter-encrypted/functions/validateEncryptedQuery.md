# validateEncryptedQuery()

```ts
function validateEncryptedQuery(
   metadata, 
   args, 
   resolveEntity?, 
   normalizeField?
): void;
```

Defined in: [packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-encrypted/src/validate-encrypted-query.ts#L17)

Maps RxDB query parameters to the generic encrypted-query validator.

`resolveEntity` is used for relation paths, `normalizeField` for field aliases introduced by the adapter itself.
Dotted paths that cannot be resolved fail-closed; plain unencrypted fields are unaffected.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) |
| `args` | \{ `groupBy?`: readonly `string`[]; `orderBy?`: readonly [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[]; `projection?`: readonly `string`[]; `where?`: [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md); \} |
| `args.groupBy?` | readonly `string`[] |
| `args.orderBy?` | readonly [`OrderBy`](../../rxdb/interfaces/OrderBy.md)&lt;`string`&gt;[] |
| `args.projection?` | readonly `string`[] |
| `args.where?` | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md) |
| `resolveEntity?` | [`EncryptedEntityResolver`](../type-aliases/EncryptedEntityResolver.md) |
| `normalizeField?` | `EncryptedFieldPathNormalizer` |

## Returns

`void`

## Throws

[EncryptedQueryError](../classes/EncryptedQueryError.md) The query hits encrypted columns or a cross-layer path cannot be resolved reliably