# encodeRxDBChangePatch()

```ts
function encodeRxDBChangePatch(metadata, patch, resolveEntityMetadata?): Record<string, unknown> | null;
```

Defined in: [packages/rxdb/src/system/change-codec.ts:302](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/change-codec.ts#L302)

Re-encodes an entity's field change bundle (`patch`) per column type, so it remains valid JSON when persisted / crossing the network.

## Parameters

| Parameter                | Type                                                                                      | Description                                                                                                                                                                                                           |
| ------------------------ | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `metadata`               | [`EntityMetadata`](../type-aliases/EntityMetadata.md)                                     | The entity metadata, used to look up the actual type of each key                                                                                                                                                      |
| `patch`                  | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; \| `null` \| `undefined`            | The field-level change; `null` / `undefined` are passed through directly as `null`                                                                                                                                    |
| `resolveEntityMetadata?` | [`RxDBChangeEntityMetadataResolver`](../type-aliases/RxDBChangeEntityMetadataResolver.md) | When `key` is a foreign key with no mapping declared on the metadata, used to look up the counterpart entity's `id` field type in reverse (e.g. many-to-many junction tables only declare the local-side foreign key) |

## Returns

`Record`&lt;`string`, `unknown`&gt; \| `null`

## Remarks

Only `bigint` / `binary` types are encoded, and **encrypted columns (`encrypted: true`) are always skipped**
— inside the encryption package the value is already an `ArrayBuffer`; wrapping it in another envelope would make the receiver treat it as
an encoded value and decode it once more, ending up with a blob of bytes anyway.

The return value is a shallow copy of `patch`; the original object is never modified, so the input stays usable inside the transaction context.
