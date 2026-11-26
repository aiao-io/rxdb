---
sidebar_label: "UseOptions⟨T⟩"
---

# UseOptions`<T>`

```ts
type UseOptions<T> = T | (() => T);
```

Defined in: [rxdb-angular/src/hooks.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/hooks.ts#L19)

Query options: a static value or a factory function called on each evaluation.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Remarks

Kept same-named and same-shaped as the React side's `UseOptions` (`query-options.ts` of `@aiao/rxdb-react`) — cross-framework API symmetry requires same feature, same API; the `export` was previously missing here, so consumers could not annotate types for their own wrappers (RAN-015).
