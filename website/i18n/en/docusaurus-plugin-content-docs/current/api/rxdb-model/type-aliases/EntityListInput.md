---
sidebar_label: 'EntityListInput⟨T⟩'
---

# EntityListInput`<T>`

```ts
type EntityListInput<T> = Pick<
  EntityListControllerOptions<T>,
  'query' | 'sorts' | 'page' | 'pageSize' | 'records' | 'capabilities'
>;
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L68)

Inputs the list can update with the host, synced via `syncInput`; `load` and the write callbacks are read only at construction.

## Type Parameters

| Type Parameter                                                                    | Default type                          |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](EntityInstance.md) | [`EntityInstance`](EntityInstance.md) |
