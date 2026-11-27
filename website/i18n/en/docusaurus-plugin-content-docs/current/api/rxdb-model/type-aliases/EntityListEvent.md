---
sidebar_label: 'EntityListEvent⟨T⟩'
---

# EntityListEvent`<T>`

```ts
type EntityListEvent<T> =
  | {
      query: unknown;
      type: 'queryChanged';
    }
  | {
      page: number;
      pageSize: number;
      type: 'pageChanged';
    }
  | {
      records: readonly T[];
      type: 'recordsChanged';
    }
  | {
      selectedIds: readonly string[];
      type: 'selectionChanged';
    }
  | {
      type: 'loadStarted';
    }
  | {
      records: readonly T[];
      type: 'loadFinished';
    }
  | {
      record: T;
      type: 'created';
    }
  | {
      record: T;
      type: 'updated';
    }
  | {
      ids: readonly string[];
      type: 'deleted';
    }
  | {
      type: 'statusChanged';
    };
```

Defined in: [packages/rxdb-model/src/entity-list/headless.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-list/headless.ts#L25)

Event emitted when a list action happens or the data source advances state.

## Type Parameters

| Type Parameter                                                                    | Default type                          |
| --------------------------------------------------------------------------------- | ------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityInstance`](EntityInstance.md) | [`EntityInstance`](EntityInstance.md) |
