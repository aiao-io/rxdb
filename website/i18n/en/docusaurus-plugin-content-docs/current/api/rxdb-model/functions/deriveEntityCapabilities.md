# deriveEntityCapabilities()

```ts
function deriveEntityCapabilities(metadata, context?): EntityCapabilities;
```

Defined in: [packages/rxdb-model/src/entity-capabilities.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-capabilities.ts#L47)

Derives UI capabilities from entity metadata.

## Parameters

| Parameter  | Type                                                                                         | Description                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `metadata` | `Pick`&lt;[`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md), `"permissions"`&gt; | Entity metadata (only its `permissions` are read)                                              |
| `context?` | [`EntityCapabilityContext`](../interfaces/EntityCapabilityContext.md)                        | Instance-side context, see [EntityCapabilityContext](../interfaces/EntityCapabilityContext.md) |

## Returns

[`EntityCapabilities`](../interfaces/EntityCapabilities.md)

Three capabilities; operations that are not declared count as `'both'`, i.e. available.

## Example

```typescript
const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice), {
  readOnly: rxdb.readOnly
});
```
