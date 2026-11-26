# DevToolsChunkSource

Defined in: [provider/types.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L134)

The byte source of a chunked transfer; the inverse of [DevToolsChunkSink](DevToolsChunkSink.md).

## Remarks

The shape is `read(offset, length)` rather than `Promise<Uint8Array>` or an async iterator, for
reasons symmetric to the sink side and equally structural: handing over a whole array asks the
implementation to read the entire file into memory first, and the constraint of "never caching
a whole file in the renderer or main process" would quietly disappear in some refactor if it
rested on discipline alone. Reading on demand keeps the sender holding only one chunk at any
moment.

`length` is supplied by the state machine, always ≤ 256 KiB, and `offset` always equals the
number of bytes read so far — the implementation does not need to track progress itself, nor
should it assume the caller will re-read a range.

## Properties

### totalBytes \{#totalbytes\}

```ts
readonly totalBytes: number;
```

Defined in: [provider/types.ts:136](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L136)

Total byte count; used for the `totalBytes` of `TRANSFER_START` and for quota pre-checks.

## Methods

### close() \{#close\}

```ts
close(): Promise<void>;
```

Defined in: [provider/types.ts:158](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L158)

Releases the handles held by this read.

#### Returns

`Promise`&lt;`void`&gt;

Resolves once the release completes; rejections are swallowed by the caller (there is no second
recovery path).

#### Remarks

Must be idempotent: normal completion, cancellation, timeout, and dispose all trigger it. The
sink side distinguishes terminal states with `commit` / `discard` because it has the decision
of whether temporary artifacts should be promoted; the read side has nothing to promote, so
there is only one exit and no terminal path can be missed.

---

### read() \{#read\}

```ts
read(offset, length): Promise<Uint8Array<ArrayBufferLike>>;
```

Defined in: [provider/types.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L146)

Reads `[offset, offset + length)`.

#### Parameters

| Parameter | Type     | Description                                                 |
| --------- | -------- | ----------------------------------------------------------- |
| `offset`  | `number` | Starting offset, equal to the number of bytes already read. |
| `length`  | `number` | Number of bytes requested, always ≤ 256 KiB and \> 0.       |

#### Returns

`Promise`&lt;`Uint8Array`&lt;`ArrayBufferLike`&gt;&gt;

Exactly `length` bytes. A length mismatch is treated as an implementation error and the
transfer ends with `operation_failed` — if a short read were accepted as a normal result, the
peer would receive a silently truncated file.
