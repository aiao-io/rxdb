---
sidebar_label: "EntityMutationsOptions⟨T⟩"
---

# EntityMutationsOptions`<T>`

Defined in: [packages/rxdb/src/entity/entity.utils.ts:452](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L452)

Parameters of [getEntityMutations](../functions/getEntityMutations.md)

## Remarks

Previously it was not exported, and its fields were snake_case: `getEntityMutations` itself is on the public surface, so outside the package you had to either copy the structure or write `Parameters<typeof getEntityMutations>[0]` just to name this object — this round exports the type as well, and the fields are now camelCase, consistent with the other interfaces in the repo.

## Type Parameters

| Type Parameter | Default type | Description |
| ------ | ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityType`](../type-aliases/EntityType.md) | [`EntityType`](../type-aliases/EntityType.md) | Root entity type |

## Properties

### needRemoveEntities \{#needremoveentities\}

```ts
needRemoveEntities: object[];
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:461](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L461)

Entities to be removed

#### Remarks

Same source as getNeedRemoveEntities: it holds the Junctions on the other side of the relation, not root entities of type `T`.

***

### needSaveEntities \{#needsaveentities\}

```ts
needSaveEntities: InstanceType<T>[];
```

Defined in: [packages/rxdb/src/entity/entity.utils.ts:454](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.utils.ts#L454)

Entities to be written (whether each is an insert or an update is decided by its own [getEntityStatus](../functions/getEntityStatus.md))
