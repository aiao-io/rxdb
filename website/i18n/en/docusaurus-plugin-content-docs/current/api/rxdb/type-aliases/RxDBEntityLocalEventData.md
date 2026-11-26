---
sidebar_label: 'RxDBEntityLocalEventData⟨T⟩'
---

# RxDBEntityLocalEventData`<T>`

```ts
type RxDBEntityLocalEventData<T> =
  | RxDBEntityLocalNewEventData<T>
  | RxDBEntityLocalCreatedEventData<T>
  | RxDBEntityLocalUpdatedEventData<T>
  | RxDBEntityLocalRemovedEventData<T>;
```

Defined in: [packages/rxdb/src/rxdb-events.ts:278](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L278)

RxDB entity local event data union type

## Type Parameters

| Type Parameter                                                            | Default type                  |
| ------------------------------------------------------------------------- | ----------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](EntityType.md) | [`EntityType`](EntityType.md) |
