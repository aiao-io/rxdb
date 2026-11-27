# SYNC_DISABLED_REASON

```ts
const SYNC_DISABLED_REASON: 'sync is disabled (RxDBSync.enabled = false)';
```

Defined in: [packages/rxdb/src/sync-contract/sync-type-utils.ts:175](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/sync-type-utils.ts#L175)

Reason phrase used when `RxDBSync.enabled` is turned off.

## Remarks

Kept separate from SYNC\_TYPE\_INELIGIBILITY: the former says "this kind of repository never has this direction" — a configuration fact; this one says "it is capable but someone turned it off" — recoverable by changing one record. Callers (and users) need to be able to tell the two apart.
