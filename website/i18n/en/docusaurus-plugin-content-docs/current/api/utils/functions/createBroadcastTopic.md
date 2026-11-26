# createBroadcastTopic()

```ts
function createBroadcastTopic<T>(event): BroadcastTopic<T>;
```

Defined in: [packages/utils/src/@browser/broadcast-channel-pool.ts:53](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/broadcast-channel-pool.ts#L53)

Creates a BroadcastChannel topic.

## Type Parameters

| Type Parameter                    | Default type |
| --------------------------------- | ------------ |
| <a id="type-parameter-t"></a> `T` | `unknown`    |

## Parameters

| Parameter | Type     | Description  |
| --------- | -------- | ------------ |
| `event`   | `string` | Channel name |

## Returns

[`BroadcastTopic`](../interfaces/BroadcastTopic.md)&lt;`T`&gt;

The message stream, a send method, and an explicit close method

## Remarks

Semantics are **fully identical** to the native `BroadcastChannel`:

- Calling twice with the same `event` in the same realm yields two **independent participants** that receive each other's messages;
- **A sender does not receive its own messages** (natively, no self-delivery to the sending object);
- Cross-realm (other tabs / workers) delivery works as usual.

UTL-009: the original implementation reused one native channel instance per **channel name** in the pool, so two topics in the same realm shared the same sending object — and since the native channel does not self-deliver, **A could never receive B's messages**. Two independent modules could not communicate through this public abstraction.

The fix is not "add local fan-out" (that would introduce self-echo, a public semantic change), but **stop sharing the sending object**: each topic holds its own channel. This restores same-realm delivery without changing the "does the sender receive its own message" semantics.

Two more things were fixed along the way:

- Previously the last unsubscribe would `close()` and delete the cache, after which `emit()` on the same topic would **throw synchronously**. This is not a hypothetical risk — the reason `removeEventListener` is mandatory in `RxDBTabsGateway.init()` is documented in a comment as exactly "a leftover listener would throw when emit is called after the topic was collected, and bubble up into the save path" — **downstream had already added a defensive coupling for it**. Now emit no longer throws.
- Channel ownership is no longer tied to the observer count; use explicit `close()` instead.
