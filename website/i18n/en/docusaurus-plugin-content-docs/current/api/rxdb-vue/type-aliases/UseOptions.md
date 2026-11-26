---
sidebar_label: "UseOptions⟨T⟩"
---

# UseOptions`<T>`

```ts
type UseOptions<T> = T | (() => T) | Ref<T> | ComputedRef<T>;
```

Defined in: [rxdb-vue/src/hooks.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L23)

Input forms of query options: a constant, a getter, a `Ref` or a `ComputedRef`.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Remarks

RVU-011: previously a module-private alias that got inlined into a long union type in the `.d.ts`, so callers could not write named wrapper function signatures.

All three reactive forms are compared **by content**, not by reference: mutating fields of a `reactive` object in place and swapping a `ref` for a structurally equivalent new object are both correctly recognized (the former re-queries, the latter does not). The cost is that options must be serializable — functions, `Symbol`s, and class instances (except cursor entities) cause a `TypeError`. See [useRepositoryQuery](../functions/useRepositoryQuery.md) for details.

The Angular side's type of the same name is only `T | (() => T)` (a signal is itself a getter); the React side matches Angular.
