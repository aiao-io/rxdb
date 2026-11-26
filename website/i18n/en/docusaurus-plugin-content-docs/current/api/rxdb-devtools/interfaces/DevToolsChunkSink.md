# DevToolsChunkSink

Defined in: [provider/types.ts:92](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L92)

The byte sink for chunked transfers.

## Remarks

Only [commit](#commit) can promote a temporary file to a real one; every other terminal state must go through [discard](#discard). Implementations must not accumulate the whole file between `write` and `commit`.

All three methods return `Promise<void>` rather than `void`: OPFS, Node and Rust disk writes are all **asynchronous I/O**, and a synchronous signature forces the implementation either to swallow the promise (a write failure is completely invisible on the protocol, the state machine keeps advancing the offset, and the final commit produces a file that is a few chunks short) or to buffer everything in memory and write once (exactly what constraint 2 forbids). With a promise returned, the state machine can wait for this chunk to actually hit disk before acknowledging it, and a slow disk naturally keeps frames queued — **backpressure is given by this signature, not something an implementation can add on its own**.

Failures are expressed with **reject**, not an error union: there is no semantic difference for the caller to branch on, and once any chunk cannot be written, this transfer has only one path — discard + a structured error.

## Methods

### commit() \{#commit\}

```ts
commit(): Promise<void>;
```

Defined in: [provider/types.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L109)

Promotes the temporary file to the real file. Called only after a COMPLETE that passes full validation.

#### Returns

`Promise`&lt;`void`&gt;

Resolves after the target file has actually been promoted; on reject the caller moves to [discard](#discard).

---

### discard() \{#discard\}

```ts
discard(): Promise<void>;
```

Defined in: [provider/types.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L119)

Discards the temporary file and all intermediate state.

#### Returns

`Promise`&lt;`void`&gt;

Resolves after cleanup completes.

#### Remarks

Must be idempotent: cancellation, the two timeouts, write failures and dispose can all trigger it.

---

### write() \{#write\}

```ts
write(data): Promise<void>;
```

Defined in: [provider/types.ts:102](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L102)

Writes one chunk of decoded bytes.

#### Parameters

| Parameter | Type         | Description                                             |
| --------- | ------------ | ------------------------------------------------------- |
| `data`    | `Uint8Array` | The bytes of this chunk; the caller no longer holds it. |

#### Returns

`Promise`&lt;`void`&gt;

Resolves after this chunk has actually hit disk; a reject voids this transfer.

#### Remarks

The state machine guarantees **serial** calls: no next chunk arrives before the previous one resolves, so implementations need no queueing of their own.
