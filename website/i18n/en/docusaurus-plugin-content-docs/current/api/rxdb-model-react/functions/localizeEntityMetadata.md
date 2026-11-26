# localizeEntityMetadata()

```ts
function localizeEntityMetadata(metadata, i18n?): EntityMetadata;
```

Defined in: packages/rxdb-model/dist/localized-metadata.d.ts:11

Clones the display metadata and resolves the entity, property, and relation copy, leaving the original entity declaration and storage contract unchanged.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The entity metadata declared by the database. |
| `i18n?` | [`ModelI18n`](../interfaces/ModelI18n.md) | The component runtime that can inspect the catalog. |

## Returns

[`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)

The metadata with localized display names; the original reference is kept when no copy matches.

## Remarks

The catalog lives in rxdb-model with keys entity.namespace.name.displayName, property.field, or relation.field.
