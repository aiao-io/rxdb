---
sidebar_label: 'ReadableStore⟨T⟩'
---

# ReadableStore`<T>`

Defined in: [store.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L10)

A synchronous snapshot + subscription source.

## Remarks

The three framework bindings bridge it to their own reactive primitives: React's `useSyncExternalStore`, Vue's `shallowRef`, Angular's `toSignal`. `value` must keep its reference stable when the input has not changed.

## Extended by

- [`ShortcutPreferences`](ShortcutPreferences.md)

## Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-t"></a> `T` |

## Properties

### changes$ \{#changes\}

```ts
readonly changes$: Observable<T>;
```

Defined in: [store.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L14)

An observable that replays the current value and pushes subsequent changes.

---

### value \{#value\}

```ts
readonly value: T;
```

Defined in: [store.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L12)

The synchronous snapshot of the current value.

## Methods

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [store.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L20)

Subscribes to subsequent changes without replaying the current value.

#### Parameters

| Parameter  | Type                | Description          |
| ---------- | ------------------- | -------------------- |
| `listener` | (`value`) => `void` | The change callback. |

#### Returns

The unsubscribe function.

() => `void`
