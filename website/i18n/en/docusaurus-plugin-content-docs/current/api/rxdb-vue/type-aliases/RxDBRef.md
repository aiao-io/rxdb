---
sidebar_label: "RxDBRef⟨T⟩"
---

# RxDBRef`<T>`

```ts
type RxDBRef<T> = Readonly<Ref<T | undefined>>;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L38)

The read-only database reference returned by the injector; `undefined` means the database is not ready yet.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |
