---
sidebar_label: "WorkingTreeEmptyState⟨T⟩"
---

# WorkingTreeEmptyState`<T>`

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L74)

The call succeeded, and the result is **semantically empty**.

## Remarks

`value` is still there: empty is a refinement of success, not a replacement. Dropping the value would make the three revisions of an empty `status()`
unreadable, and callers would have to query again to get them — and that second read might no longer see the database at the same moment.

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

The discriminator bit

***

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L79)

The return value as-is, except that it is empty
