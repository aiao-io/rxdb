# CONFLICT_DETECTED_EVENT

```ts
const CONFLICT_DETECTED_EVENT: "CONFLICT_DETECTED";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:129](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L129)

A conflict was detected during sync.

## Remarks

It only reports the detection — it does not mean sync stops there; how the conflict is handled is decided by the conflict strategy. The part that needs human intervention emits a separate [CONFLICT\_PENDING\_EVENT](CONFLICT_PENDING_EVENT.md).
