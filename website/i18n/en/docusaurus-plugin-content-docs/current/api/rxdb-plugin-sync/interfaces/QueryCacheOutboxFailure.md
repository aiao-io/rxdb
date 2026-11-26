# QueryCacheOutboxFailure

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L83)

One replay failure.

## Remarks

Appears in [QueryCacheOutboxResult.failures](QueryCacheOutboxResult.md#failures):
a replay round is **not aborted by a single-row failure** — failed rows stay in
the queue for the next round, and successful rows advance the waterline as usual.

## Properties

### entityId \{#entityid\}

```ts
entityId: string | null;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L85)

The entity id that failed; `null` for whole-batch failures (e.g. metadata probe failure)

---

### error \{#error\}

```ts
error: Error;
```

Defined in: [packages/rxdb-plugin-sync/src/query-cache-outbox.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/query-cache-outbox.ts#L87)

The failure cause, passed through unchanged, never wrapped
