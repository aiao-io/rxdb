# performChunk()

```ts
function performChunk<T>(array, consumer): PerformChunkHandle;
```

Defined in: [packages/utils/src/@browser/perform-chunk.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/utils/src/@browser/perform-chunk.ts#L58)

Executes a task in chunks
Browser-only
Splits a large task into chunks, executing a small portion each time and then yielding the main thread until the next run

## Type Parameters

| Type Parameter | Description |
| ------ | ------ |
| <a id="type-parameter-t"></a> `T` | Array element type |

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `array` | `T`[] | The data array to process |
| `consumer` | (`data`, `index`) => `void` | Consumer function |

## Returns

[`PerformChunkHandle`](../interfaces/PerformChunkHandle.md)

Cancel handle and completion Promise

## Example

```ts
performChunk([1, 2, 3, 4, 5], (item, index) => {
  console.log(`Processing item ${item} at index ${index}`);
});
```

## Remarks

UTL-003 fixed three things:

1. **Zero-budget spinning**: the original loop condition was `idle.timeRemaining() > 0 && i < array.length`, and `didTimeout` was never read. When the browser's `{ timeout: 100 }` expires it calls back with `didTimeout: true` + `timeRemaining() === 0` — exactly the signal that "the main thread has been busy and progress must be forced" — yet the original implementation consumed **zero items** in that frame and rescheduled the next frame. With a continuously busy main thread it would spin forever (measured: 4 frames scheduled, 0 items consumed). The comment at the top of the file even said "the explicit timeout guarantees a worst-case responsiveness bound" — **the implementation contradicted its own comment**. Changed to do-while: each frame consumes **at least one item**.
2. **No channel for errors**: errors thrown by `consumer` escaped into the idle callback, becoming an unhandled global error, and the remaining chunks kept getting scheduled. Now errors go into `done` and scheduling stops.
3. **No cancellation**: once started, a long task ran to the end. Now `cancel()` is returned.

The return value is **new**; existing call sites of `performChunk(...)` need no changes.
