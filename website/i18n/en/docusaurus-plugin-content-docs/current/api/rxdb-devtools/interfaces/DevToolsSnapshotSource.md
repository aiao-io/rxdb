# DevToolsSnapshotSource

Defined in: [provider/types.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L61)

The materialization source of snapshots, implemented by whoever holds the storage-global exclusive lock.

## Methods

### capture() \{#capture\}

```ts
capture(signal): Promise<DevToolsSnapshotCaptureResult>;
```

Defined in: [provider/types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L73)

Materializes the metadata and committed logical files inside the storage-global exclusive lock.

#### Parameters

| Parameter | Type          | Description                                                                                                                    |
| --------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `signal`  | `AbortSignal` | The abort signal; once aborted (or after aborting) it should stop waiting as soon as possible and reclaim temporary resources. |

#### Returns

`Promise`&lt;[`DevToolsSnapshotCaptureResult`](../type-aliases/DevToolsSnapshotCaptureResult.md)&gt;

A complete batch of records, or a report of epoch invalidation.

#### Remarks

The implementation must finish materialization and sort by `(logicalPath, id)` **before releasing the lock**; sorting outside the lock would re-expose an already-consistent batch to concurrent writers. Both waiting for the lock and materialization must respond to `signal`: the 15-second end-to-end deadline and explicit cancellation both interrupt through it.
