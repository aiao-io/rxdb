# DevToolsSnapshotCaptureResult

```ts
type DevToolsSnapshotCaptureResult =
  | {
      outcome: 'captured';
      records: readonly DevToolsSnapshotRecord[];
    }
  | {
      outcome: 'invalidated';
    };
```

Defined in: [provider/types.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/types.ts#L56)

Result of a single snapshot materialization.

## Remarks

`invalidated` means lock ownership was lost or the capture epoch changed during materialization. The caller **must start over from scratch
with a new `snapshotId`**, and must never stitch together the records of two attempts.
