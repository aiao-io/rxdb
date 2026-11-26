---
sidebar_label: "PersistedStateEntry⟨T⟩"
---

# PersistedStateEntry`<T>`

Defined in: [packages/utils/src/@browser/persisted-state.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L59)

A persisted state entry for one `namespace + name`.

## Remarks

The same `namespace + name` is **always the same object** within a [PersistedStateRegistry](../classes/PersistedStateRegistry.md), so writes by any holder are immediately visible to the others, and there is no "two stale copies overwriting each other's on-disk data".

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | The state value type |

## Properties

### storageKey \{#storagekey\}

```ts
readonly storageKey: string;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L61)

This state's key in `localStorage` (escaped).

## Methods

### get() \{#get\}

```ts
get(): T;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:68](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L68)

Reads the current value.

#### Returns

`T`

The current value in memory; the reference stays stable between two [PersistedStateEntry.set](#set) calls and can be used directly as the snapshot for React's `useSyncExternalStore`.

***

### persistError() \{#persisterror\}

```ts
persistError(): Error | undefined;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L89)

The most recent persistence failure; cleared automatically after a successful write to disk.

#### Returns

`Error` \| `undefined`

The failure reason, or `undefined`

#### Remarks

Quota exceeded, circular references, `BigInt`, etc. can all make the disk write fail while the in-memory value updates normally —
only this field lets callers know the data did not reach disk (RAN-010).

***

### set() \{#set\}

```ts
set(next): void;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L79)

Writes and synchronously persists to disk, then notifies all subscribers.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `next` | `T` | The new value |

#### Returns

`void`

#### Remarks

**Disk write failures do not throw**: the in-memory value updates normally, and the failure is exposed to callers via [PersistedStateEntry.persistError](#persisterror)
(RAN-010). Subscribers are notified whether or not the write reached disk —
a change to `persistError` is itself a state change subscribers care about.

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [packages/utils/src/@browser/persisted-state.ts:96](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/persisted-state.ts#L96)

Subscribes to changes of this state.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | () => `void` | Called after the value or `persistError` changes; receives no arguments — call `get()` again in the callback |

#### Returns

The unsubscribe function; calling it repeatedly is idempotent

() => `void`
