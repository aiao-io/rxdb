---
sidebar_label: 'RxDBEntityRemoteEventData⟨T⟩'
---

# RxDBEntityRemoteEventData`<T>`

```ts
type RxDBEntityRemoteEventData<T> =
  RxDBEntityRemoteCreatedEventData<T> | RxDBEntityRemoteUpdatedEventData<T> | RxDBEntityRemoteRemovedEventData<T>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:317](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L317)

Union type of RxDB entity remote event data

## Type Parameters

| Type Parameter                                                            | Default type                  |
| ------------------------------------------------------------------------- | ----------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](EntityType.md) | [`EntityType`](EntityType.md) |
