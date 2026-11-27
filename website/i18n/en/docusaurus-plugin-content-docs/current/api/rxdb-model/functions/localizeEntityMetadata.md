# localizeEntityMetadata()

```ts
function localizeEntityMetadata(metadata, i18n?): EntityMetadata;
```

Defined in: [packages/rxdb-model/src/localized-metadata.ts:29](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/localized-metadata.ts#L29)

Clones the display metadata and resolves the entity, property, and relation copy, keeping the original entity declaration and storage contract unchanged.

## Parameters

| Parameter  | Type                                                          | Description                                         |
| ---------- | ------------------------------------------------------------- | --------------------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | The entity metadata declared by the database.       |
| `i18n?`    | [`ModelI18n`](../interfaces/ModelI18n.md)                     | The component runtime that can inspect the catalog. |

## Returns

[`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md)

Metadata with localized display names; the original reference is kept when no copy is matched.

## Remarks

The catalog lives in rxdb-model, keyed as entity.namespace.name.displayName, property.field, or relation.field.
