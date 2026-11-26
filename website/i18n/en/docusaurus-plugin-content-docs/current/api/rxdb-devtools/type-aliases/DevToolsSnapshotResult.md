# DevToolsSnapshotResult

```ts
type DevToolsSnapshotResult = 
  | {
  outcome: "page";
  page: DevToolsSnapshotPage;
}
  | {
  outcome: "cancelled";
}
  | {
  error: DevToolsErrorPayload;
  outcome: "rejected";
};
```

Defined in: [provider/snapshot.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L74)

Result of a single snapshot request.

## Remarks

`cancelled` is its own branch rather than masquerading as `snapshot_busy`: cancellation is a deliberate local action,
and reporting it as "busy" would induce the peer to retry something it just gave up on.
