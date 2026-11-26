# normalizeUpdateEntity()

```ts
function normalizeUpdateEntity(metadata, entity): EntityData;
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:302](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L302)

Normalizes update data and filters out readonly fields.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata |
| `entity` | [`EntityData`](../type-aliases/EntityData.md) | The update data submitted by the user |

## Returns

[`EntityData`](../type-aliases/EntityData.md)

The writable fields keyed by database column names.
