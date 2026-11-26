# getEntityType()

```ts
function getEntityType(metadata): EntityType;
```

Defined in: [packages/rxdb/src/rxdb-utils.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-utils.ts#L75)

Retrieves the entity class from entity metadata.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../type-aliases/EntityMetadata.md) | The entity metadata (obtained via [getEntityMetadata](getEntityMetadata.md) or `SchemaManager`) |

## Returns

[`EntityType`](../type-aliases/EntityType.md)

The entity type

## Throws

RxDBError when the metadata has no back-reference to an entity class

## Remarks

**The input was narrowed from `T | InstanceType<T> | EntityMetadata` to just `EntityMetadata`.**
The `ENTITY_TYPE` slot is written exactly once in the whole repository, by `entity-manager.ts`, onto the **metadata object** —
never onto classes or instances. That means the `T | InstanceType<T>` branches of the old signature
would only ever get `undefined` no matter what was passed (suppressed by `!`). After the narrowing, misuse is blocked at compile time.
