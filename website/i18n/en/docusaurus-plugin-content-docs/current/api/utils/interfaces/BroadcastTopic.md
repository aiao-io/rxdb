---
sidebar_label: "BroadcastTopic⟨T⟩"
---

# BroadcastTopic`<T>`

Defined in: [packages/utils/src/@browser/broadcast-channel-pool.ts:3](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/broadcast-channel-pool.ts#L3)

## Type Parameters

| Type Parameter | Default type |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | `unknown` |

## Properties

### close \{#close\}

```ts
close: () => void;
```

Defined in: [packages/utils/src/@browser/broadcast-channel-pool.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/broadcast-channel-pool.ts#L13)

Closes the channel held by this topic. Idempotent; after closing, `emit` is a no-op.

#### Returns

`void`

#### Remarks

UTL-009: previously the channel's lifecycle was tied to the RxJS observer count (closed on the last unsubscribe), making "who owns this resource" implicit and accidentally triggered by subscription timing. It is now **explicit ownership**.

***

### emit \{#emit\}

```ts
emit: (message) => void;
```

Defined in: [packages/utils/src/@browser/broadcast-channel-pool.ts:5](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/broadcast-channel-pool.ts#L5)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `message` | `T` |

#### Returns

`void`

***

### message$ \{#message\}

```ts
message$: Observable<T>;
```

Defined in: [packages/utils/src/@browser/broadcast-channel-pool.ts:4](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/broadcast-channel-pool.ts#L4)
