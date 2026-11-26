# normalizeUpdateEntity

```ts
const normalizeUpdateEntity: (metadata, entity) => EntityData;
```

Defined in: packages/rxdb/dist/entity/entity.utils.d.ts:132

Normalizes update data and filters out readonly fields.

## Parameters

| Parameter  | Type                                                          | Description                           |
| ---------- | ------------------------------------------------------------- | ------------------------------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata                       |
| `entity`   | [`EntityData`](../../rxdb/type-aliases/EntityData.md)         | The update data submitted by the user |

## Returns

[`EntityData`](../../rxdb/type-aliases/EntityData.md)

Writable fields keyed by database column name
