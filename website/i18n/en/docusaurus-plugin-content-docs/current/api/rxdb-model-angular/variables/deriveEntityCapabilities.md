# deriveEntityCapabilities

```ts
const deriveEntityCapabilities: (metadata, context?) => EntityCapabilities;
```

Defined in: packages/rxdb-model/dist/entity-capabilities.d.ts:37

Derives UI capabilities from entity metadata

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | `Pick`&lt;[`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md), `"permissions"`&gt; | Entity metadata (only its `permissions` are read) |
| `context?` | [`EntityCapabilityContext`](../interfaces/EntityCapabilityContext.md) | Instance-side context, see [EntityCapabilityContext](../interfaces/EntityCapabilityContext.md) |

## Returns

[`EntityCapabilities`](../interfaces/EntityCapabilities.md)

Three capabilities; undeclared operations count as `'both'`, i.e. available

## Example

```typescript
const { canCreate, canEdit, canDelete } = deriveEntityCapabilities(getEntityMetadata(Invoice), {
  readOnly: rxdb.readOnly
});
```
