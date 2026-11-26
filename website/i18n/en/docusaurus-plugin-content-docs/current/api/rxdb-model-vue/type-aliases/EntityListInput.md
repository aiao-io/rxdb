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

Inputs that the list can update with the host, synced via `syncInput`; `load` and write callbacks are only read at construction time.

## Type Parameters

| Type Parameter                                                                    | Default type                          |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](EntityInstance.md) | [`EntityInstance`](EntityInstance.md) |
