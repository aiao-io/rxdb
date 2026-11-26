---
sidebar_label: "Store⟨T⟩"
---

# Store`<T>`

Defined in: [store.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L24)

Writable reactive store, deduplicated by reference.

## Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

## Implements

- [`ReadableStore`](../interfaces/ReadableStore.md)&lt;`T`&gt;

## Constructors

### Constructor

```ts
new Store<T>(initial): Store<T>;
```

Defined in: [store.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L38)

Creates the store.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `initial` | `T` | The initial value. |

#### Returns

`Store`&lt;`T`&gt;

## Properties

### changes$ \{#changes\}

```ts
readonly changes$: Observable<T>;
```

Defined in: [store.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L27)

Replays the current value and pushes subsequent changes.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`changes$`](../interfaces/ReadableStore.md#changes)

## Accessors

### value \{#value\}

#### Get Signature

```ts
get value(): T;
```

Defined in: [store.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L30)

Synchronous snapshot of the current value.

##### Returns

`T`

Synchronous snapshot of the current value.

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`value`](../interfaces/ReadableStore.md#value)

## Methods

### set() \{#set\}

```ts
set(next): void;
```

Defined in: [store.ts:47](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L47)

Writes the new value; no notification when it shares the same reference as the current value.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `next` | `T` | The new value. |

#### Returns

`void`

***

### subscribe() \{#subscribe\}

```ts
subscribe(listener): () => void;
```

Defined in: [store.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L65)

Subscribes to subsequent changes.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `listener` | (`value`) => `void` | Change callback. |

#### Returns

An unsubscribe function.

() => `void`

#### Implementation of

[`ReadableStore`](../interfaces/ReadableStore.md).[`subscribe`](../interfaces/ReadableStore.md#subscribe)

***

### update() \{#update\}

```ts
update(project): void;
```

Defined in: [store.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-admin/src/store.ts#L56)

Computes the next value from the current one.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `project` | (`current`) => `T` | A pure function. |

#### Returns

`void`
