---
sidebar_label: "WorkingTreeSuccessState⟨T⟩"
---

# WorkingTreeSuccessState`<T>`

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L58)

The call succeeded, `value` is its return value.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Properties

### phase \{#phase\}

```ts
readonly phase: "success";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L60)

The discriminant

***

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/async-state.ts#L63)

The return value as-is; conflicts with `CommitResult.ok === false` also land here
