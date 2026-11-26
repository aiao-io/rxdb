# decodeRxDBChangePatch()

```ts
function decodeRxDBChangePatch(
   metadata, 
   patch, 
   resolveEntityMetadata?
): Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:324](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L324)

The inverse of [encodeRxDBChangePatch](encodeRxDBChangePatch.md); semantics and column filtering rules are exactly symmetric.

An absent envelope goes through the "legacy" branch: old RxDB stored `bigint` / `binary` directly as JSON,
and the reading side restores them by reflecting on the JS types.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) |
| `patch` | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; \| `null` \| `undefined` |
| `resolveEntityMetadata?` | [`RxDBChangeEntityMetadataResolver`](../type-aliases/RxDBChangeEntityMetadataResolver.md) |

## Returns

`Record`&lt;`string`, `unknown`&gt; \| `null`
