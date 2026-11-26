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

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:79

List inputs that can be updated by the host, synced via `syncInput`; `load` and write callbacks are read only at construction.

## Type Parameters

| Type Parameter                                                                    | Default type                          |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](EntityInstance.md) | [`EntityInstance`](EntityInstance.md) |
