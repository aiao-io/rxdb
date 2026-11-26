---
sidebar_label: 'EntityUpdateData⟨T⟩'
---

# EntityUpdateData`<T>`

```ts
type EntityUpdateData<T> = Omit<Partial<InstanceType<T>>, 'id'> & object;
```

Defined in: [packages/rxdb/src/entity/entity.interface.ts:246](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity.interface.ts#L246)

Entity update data type
Represents the data structure passed when updating an entity

## Type Parameters

| Type Parameter                                                            |
| ------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](EntityType.md) |

## Type Declaration

### id

```ts
id: EntityStaticType<T, 'idType'>;
```
