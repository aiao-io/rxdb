---
sidebar_label: 'PersistedState⟨T⟩'
---

# PersistedState`<T>`

Defined in: [rxdb-vue/src/use-persisted-state.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-persisted-state.ts#L55)

The persisted state of a given `namespace + name`.

## Type Parameters

| Type Parameter                    | Description      |
| --------------------------------- | ---------------- |
| <a id="type-parameter-t"></a> `T` | State value type |

## Properties

### persistError \{#persisterror\}

```ts
readonly persistError: ComputedRef<Error | undefined>;
```

Defined in: [rxdb-vue/src/use-persisted-state.ts:71](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-persisted-state.ts#L71)

The most recent persistence failure; cleared automatically after a successful write.

#### Remarks

Quota exceeded, circular references, `BigInt` and the like all make the write fail while the in-memory value updates normally — only this field lets the caller know the data was not persisted.

---

### value \{#value\}

```ts
readonly value: Ref<T>;
```

Defined in: [rxdb-vue/src/use-persisted-state.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/use-persisted-state.ts#L63)

Read-write state reference; always the **same** `Ref` for the same `namespace + name`.

#### Remarks

Writing persists synchronously and notifies all holders of the same key. It has `shallowRef` semantics: mutating fields of an object in place triggers **neither** reactivity **nor** persistence; you must assign a new value as a whole.
