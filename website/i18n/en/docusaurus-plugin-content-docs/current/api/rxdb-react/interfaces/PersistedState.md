---
sidebar_label: 'PersistedState⟨T⟩'
---

# PersistedState`<T>`

Defined in: [rxdb-react/src/use-persisted-state.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-persisted-state.ts#L35)

The persisted state for a given `namespace + name`.

## Type Parameters

| Type Parameter                    | Description      |
| --------------------------------- | ---------------- |
| <a id="type-parameter-t"></a> `T` | State value type |

## Properties

### persistError \{#persisterror\}

```ts
readonly persistError: Error | undefined;
```

Defined in: [rxdb-react/src/use-persisted-state.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-persisted-state.ts#L58)

The most recent persistence failure; cleared automatically after a successful write to disk.

#### Remarks

Quota exceeded, circular references, `BigInt`, etc. all make the disk write fail while the in-memory value still updates — this field is the only way callers can tell that the data did not reach disk.

---

### setValue \{#setvalue\}

```ts
readonly setValue: (next) => void;
```

Defined in: [rxdb-react/src/use-persisted-state.ts:50](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-persisted-state.ts#L50)

Writes the value and persists it to disk, then notifies all holders of the same key.

#### Parameters

| Parameter | Type |
| --------- | ---- |
| `next`    | `T`  |

#### Returns

`void`

#### Remarks

Function identity is stable across renders, so it can be used directly in dependency arrays. A failed disk write **does not throw**: the in-memory value updates as usual and the failure is exposed via [PersistedState.persistError](#persisterror).

---

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [rxdb-react/src/use-persisted-state.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-react/src/use-persisted-state.ts#L42)

Render snapshot of the current value.

#### Remarks

Has **snapshot** semantics: mutating object fields in place neither triggers a re-render nor reaches disk; the whole value must be written via [PersistedState.setValue](#setvalue).
