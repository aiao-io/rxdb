---
sidebar_label: "WorkingTreeEmptyState⟨T⟩"
---

# WorkingTreeEmptyState`<T>`

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L74)

The call succeeded, and the result is a **semantically meaningful empty**.

## Remarks

`value` is still there: empty is a refinement of success, not a replacement. Dropping the value makes the three revisions inside an empty `status()` unreadable, forcing the caller to query again just to get them — and what the second query returns may no longer be the same moment of the database.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Properties

### phase \{#phase\}

```ts
readonly phase: "empty";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L76)

The discriminant

***

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L79)

The return value as-is, except it is empty
