---
sidebar_label: "EntityListEvent⟨T⟩"
---

# EntityListEvent`<T>`

```ts
type EntityListEvent<T> = 
  | {
  query: unknown;
  type: "queryChanged";
}
  | {
  page: number;
  pageSize: number;
  type: "pageChanged";
}
  | {
  records: readonly T[];
  type: "recordsChanged";
}
  | {
  selectedIds: readonly string[];
  type: "selectionChanged";
}
  | {
  type: "loadStarted";
}
  | {
  records: readonly T[];
  type: "loadFinished";
}
  | {
  record: T;
  type: "created";
}
  | {
  record: T;
  type: "updated";
}
  | {
  ids: readonly string[];
  type: "deleted";
}
  | {
  type: "statusChanged";
};
```

Defined in: packages/rxdb-model/dist/entity-list/headless.d.ts:21

Event emitted when a list action happens or the data source state advances.

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`EntityInstance`](EntityInstance.md) | [`EntityInstance`](EntityInstance.md) |
