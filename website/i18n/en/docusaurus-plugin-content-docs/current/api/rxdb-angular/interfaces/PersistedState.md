---
sidebar_label: "PersistedState⟨T⟩"
---

# PersistedState`<T>`

Defined in: [rxdb-angular/src/use-persisted-state.ts:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-persisted-state.ts#L16)

The persisted state for a given `namespace + name`.

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | State value type |

## Properties

### persistError \{#persisterror\}

```ts
readonly persistError: Signal<Error | undefined>;
```

Defined in: [rxdb-angular/src/use-persisted-state.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-persisted-state.ts#L31)

The most recent persistence failure; cleared automatically after a successful write to disk.

#### Remarks

Quota exceeded, circular references, `BigInt`, etc. all make the disk write fail while the signal value still updates — this field is the only way callers can tell that the data did not reach disk (RAN-010).

***

### value \{#value\}

```ts
readonly value: WritableSignal<T>;
```

Defined in: [rxdb-angular/src/use-persisted-state.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-angular/src/use-persisted-state.ts#L23)

Read/write state signal; always the **same** one for a given `namespace + name`.

#### Remarks

Writes reach disk via the persistence effect and are immediately visible to all holders of the same key.
