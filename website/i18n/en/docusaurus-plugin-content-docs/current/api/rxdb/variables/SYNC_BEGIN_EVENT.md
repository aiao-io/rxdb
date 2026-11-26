# SYNC_BEGIN_EVENT

```ts
const SYNC_BEGIN_EVENT: 'SYNC_BEGIN';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:99](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L99)

A sync round started.

## Remarks

The granularity is the **whole sync round**; per-repository progress has its own [REPOSITORY\_SYNC\_BEGIN\_EVENT](REPOSITORY_SYNC_BEGIN_EVENT.md) family. Any number of REPOSITORY_SYNC_* events can be interleaved within one SYNC round.
