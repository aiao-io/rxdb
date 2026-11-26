---
sidebar_label: "RxDBInput⟨T⟩"
---

# RxDBInput`<T>`

```ts
type RxDBInput<T> = 
  | RxDBSource<T>
  | Ref<T | undefined>
  | undefined;
```

Defined in: [rxdb-vue/src/rxdb-vue.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/rxdb-vue.ts#L33)

Database forms accepted by `provideRxDB` (Vue superset).

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` *extends* [`RxDB`](../../rxdb/classes/RxDB.md) |

## Remarks

Two more forms are accepted beyond the cross-framework [RxDBSource](RxDBSource.md):

- `Ref<T | undefined>` — a reactive reference held by the caller, who decides when to fill it in.
  This is a Vue-specific form, and the reason it supported async readiness before the other two frameworks.
- `undefined` — a not-ready-yet placeholder.

Both belong to the **caller**; the provider does not take over their lifecycle. See [provideRxDB](../variables/provideRxDB.md).
