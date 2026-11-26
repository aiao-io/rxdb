---
sidebar_label: "AngularHeadlessOptions⟨T⟩"
---

# AngularHeadlessOptions`<T>`

```ts
type AngularHeadlessOptions<T> = T | Signal<T> | (() => T);
```

Defined in: [packages/rxdb-model-angular/src/headless/bindings.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model-angular/src/headless/bindings.ts#L38)

An Angular input can be a plain snapshot, a signal, or a getter that returns a snapshot.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |
