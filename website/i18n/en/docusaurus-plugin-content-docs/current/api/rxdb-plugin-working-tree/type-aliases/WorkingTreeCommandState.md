---
sidebar_label: 'WorkingTreeCommandState⟨T⟩'
---

# WorkingTreeCommandState`<T>`

```ts
type WorkingTreeCommandState<T> =
  WorkingTreeIdleState | WorkingTreeLoadingState | WorkingTreeSuccessState<T> | WorkingTreeErrorState;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L100)

Observable state of a command: **no empty** (§4).

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Remarks

Used by `enable()` / `commit()` / `discard()` / `restore()` and `isEnabled()`. `isEnabled()`
is a read, yet it does not use the query state: `boolean` has no "empty" shape, and giving it an empty would only be a fabrication.
`restore()` likewise goes through command: `restoredCount: 0` is a **no-op result** of writing nothing (FR-042),
same shape as `discard()`'s `discardedCount: 0`, not "there is no content here".
