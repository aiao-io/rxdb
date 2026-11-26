# WRITE_ENTRANCES

```ts
const WRITE_ENTRANCES: readonly [
  'crud',
  'domain_recompute',
  'remote_entity_apply',
  'cleanup_expired',
  'projection_rewrite',
  'metadata_only_prefetch',
  'query_cache_maintenance',
  'raw_write',
  'bulk_write',
  'notify_external_update',
  'unknown'
];
```

Defined in: [packages/rxdb/src/trusted-write/write-entrance.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/trusted-write/write-entrance.ts#L28)

Identities of the registered write entrances.

## Remarks

**Not** a one-to-one match with the matrix in spec.md: matrix row 4 "only updates `remoteId` / sync watermark / audit timestamp" is not an entrance but **what gets written** (`pull()` writes entities and advances the watermark within the same round trip), and it is inferred from `columns` and `operation`; conversely, `unknown` is an entrance but not a row of the matrix. Forcing an 11-by-11 pairing would require inventing a caller for "metadata-only writes" that does not exist.

`unknown` must be registered: fail-closed needs a value that **can be judged**; without it, unregistered callers could only slip in as type assertions, and no judgment runs on that path at all.
