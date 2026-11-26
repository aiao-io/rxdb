# transitionMetadata()

```ts
function transitionMetadata(metadataOptions, options?): EntityMetadata;
```

Defined in: [packages/rxdb/src/entity/metadata-transition.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/metadata-transition.ts#L104)

Converts metadata options (metadataOptions) into entity metadata (metadata).

The function performs the following operations:
1. Collects all metadata options on the entity's prototype chain
2. Creates the property map, relation map, and index map
3. Handles entity inheritance relations
4. Sets the display name, default value properties, foreign key relations, and foreign key names
5. Adds helper methods such as isForeignKey

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadataOptions` | [`EntityMetadataOptions`](../interfaces/EntityMetadataOptions.md) | Entity metadata options, containing the basic configuration of the entity |
| `options?` | \| [`EntityType`](../type-aliases/EntityType.md) \| [`EntityMetadataOptions`](../interfaces/EntityMetadataOptions.md) \| [`AbstractEntityType`](../type-aliases/AbstractEntityType.md) \| [`EntityMetadataOptions`](../interfaces/EntityMetadataOptions.md)[] | Optional target class, used to obtain metadata on the prototype chain |

## Returns

[`EntityMetadata`](../type-aliases/EntityMetadata.md)
