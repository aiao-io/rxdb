---
sidebar_label: 'QueryOptions⟨T⟩'
---

# QueryOptions`<T>`

```ts
type QueryOptions<T> =
  | GetQuery<T>
  | FindOneQuery<T>
  | FindOneOrFailQuery<T>
  | FindQuery<T>
  | FindAllQuery<T>
  | FindByCursorQuery<T>
  | CountQuery<T>
  | RepositoryQueryExtensions<T>[keyof RepositoryQueryExtensions<T>];
```

Defined in: [packages/rxdb/src/repository/QueryManager.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/QueryManager.interface.ts#L91)

The options union of a single query task

## Type Parameters

| Type Parameter                                                            | Description                        |
| ------------------------------------------------------------------------- | ---------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](EntityType.md) | The entity class the query targets |

## Remarks

The input type of `QueryManager.createTask()`, and also the raw material of the task-deduplication fingerprint: two
subscriptions whose `QueryOptions` structures serialize equal are merged onto the same task.

The last branch comes from the module augmentation of [RepositoryQueryExtensions](../interfaces/RepositoryQueryExtensions.md)
— custom query tasks defined by plugin packages join the union through it, which is why plugins that implement a
Repository or replace the QueryManager need this type.
