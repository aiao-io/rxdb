# describeEntityFields()

```ts
function describeEntityFields(metadata, resolve): EntityFieldsDescriptor;
```

Defined in: [packages/rxdb/src/entity/entity-field.utils.ts:556](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-field.utils.ts#L556)

Generates the complete field descriptor of an entity.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | Entity metadata that has completed `transitionMetadata()` |
| `resolve` | [`EntityMetadataResolver`](../type-aliases/EntityMetadataResolver.md) | Relation target resolver; returns `undefined` throws immediately, no guessing the primary key type (D7) |

## Returns

[`EntityFieldsDescriptor`](../interfaces/EntityFieldsDescriptor.md)

A strictly JSON-safe field descriptor; the `fields` order is always `propertyMap` → `computedPropertyMap` → `relationMap`, keeping Map insertion order within each group (INV-6).

## Throws

[EntityRelationResolutionError](../classes/EntityRelationResolutionError.md) The relation target lacks a primary key or its primary key type is unsupported.

## Throws

[RxDBError](../classes/RxDBError.md) The relation target is not registered.
