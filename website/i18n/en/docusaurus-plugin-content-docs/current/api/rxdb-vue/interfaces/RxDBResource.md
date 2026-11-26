---
sidebar_label: 'RxDBResource⟨T⟩'
---

# RxDBResource`<T>`

Defined in: [rxdb-vue/src/hooks.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L77)

The reactive resource returned by the basic query hooks.

## Remarks

**This is a `reactive` object, not a set of `Ref`s.**
It must be held as a whole, or destructured via `toRefs()`:

```typescript
const user = useGet(User, 'user-1'); // ✅ Hold it as a whole
const { value } = toRefs(useGet(User, 'user-1')); // ✅ toRefs first, then destructure
const { value } = useGet(User, 'user-1'); // ❌ One-time snapshot, never updates afterwards
```

The same package's [InfiniteScrollResource](InfiniteScrollResource.md) has `ComputedRef` members and is destructuring-safe; the differing shapes are a historical contract (RVU-008) — don't extrapolate between the two.

### State combinations

| Phase                                  | isLoading | hasValue | isEmpty       | error       | value                  |
| -------------------------------------- | --------- | -------- | ------------- | ----------- | ---------------------- |
| Before first subscription              | `true`    | `false`  | `undefined`   | `undefined` | `defaultValue`         |
| Data received                          | `false`   | `true`   | whether empty | `undefined` | new value              |
| Error                                  | `false`   | `false`  | `undefined`   | error       | previous value         |
| Options changed, new round in progress | `true`    | `false`  | `undefined`   | `undefined` | previous value (stale) |
| Completed without any next             | `false`   | `false`  | `undefined`   | `undefined` | previous value (stale) |

Key point: `value` **keeps the old value** during a re-query (stale-while-revalidate), but `hasValue` drops back to `false` synchronously — the old value is no longer claimed to belong to the new query conditions (RVU-003). To judge "the current value is trustworthy", look at `hasValue`, not `value !== defaultValue`.

### Lifecycle

- **Provider**: `provideRxDB()` must have been called on the component invoking the hook or on one of its ancestors, otherwise it throws.
- **SSR**: there is no `window` on the server, so the subscription is skipped and the resource stays in its initial `isLoading: true` state; client hydration is a brand-new setup, which starts querying normally.
- **Cleanup**: the subscription is attached to the current effect scope and unsubscribed automatically when the scope is destroyed (component unmount); late emissions arriving afterwards are all dropped.

## Type Parameters

| Type Parameter                    | Description        |
| --------------------------------- | ------------------ |
| <a id="type-parameter-t"></a> `T` | Query result type. |

## Properties

### error \{#error\}

```ts
readonly error: Error | undefined;
```

Defined in: [rxdb-vue/src/hooks.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L86)

The current round's error; cleared on success or when a re-query starts. Non-`Error` payloads are wrapped into real `Error`s.

---

### hasValue \{#hasvalue\}

```ts
readonly hasValue: boolean;
```

Defined in: [rxdb-vue/src/hooks.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L99)

Whether `value` belongs to the **current** query conditions. Drops back to `false` as soon as a re-query starts, and only becomes `true` when a next arrives.

---

### isEmpty \{#isempty\}

```ts
readonly isEmpty: boolean | undefined;
```

Defined in: [rxdb-vue/src/hooks.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L95)

Whether the result is empty: arrays by `length === 0`, single entities by `== null`. `undefined` means this round has no conclusion yet (loading, error, or completed without a next).

---

### isLoading \{#isloading\}

```ts
readonly isLoading: boolean;
```

Defined in: [rxdb-vue/src/hooks.ts:90](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L90)

Whether a query round is in progress (from the subscription entry until the first next / error / complete).

---

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [rxdb-vue/src/hooks.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-vue/src/hooks.ts#L82)

The query result; the hook's `defaultValue` before subscription and on error, and the previous round's value during a re-query (judge trustworthiness together with `hasValue`).
