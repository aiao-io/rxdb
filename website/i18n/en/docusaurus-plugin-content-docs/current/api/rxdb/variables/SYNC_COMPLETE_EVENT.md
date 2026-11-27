# SYNC_COMPLETE_EVENT

```ts
const SYNC_COMPLETE_EVENT: 'SYNC_COMPLETE';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L109)

One round of sync finished normally.

## Remarks

"Finished" does not mean "everything synced successfully": this round may have detected conflicts ([CONFLICT\_DETECTED\_EVENT](CONFLICT_DETECTED_EVENT.md)), and individual repositories may have failed. Check the [PullResult](../interfaces/PullResult.md) / [PushResult](../interfaces/PushResult.md) in the payload for the outcome.
