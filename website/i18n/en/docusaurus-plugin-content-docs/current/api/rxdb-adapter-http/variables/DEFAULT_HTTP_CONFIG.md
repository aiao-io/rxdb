# DEFAULT_HTTP_CONFIG

```ts
const DEFAULT_HTTP_CONFIG: HttpNumericConfig;
```

Defined in: [packages/rxdb-adapter-http/src/config.ts:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/config.ts#L20)

Defaults for the six numeric options.

## Remarks

`pageSize` / `idChunkSize` match the supabase adapter's `SUPABASE_PAGE_SIZE` (1000) and `SUPABASE_IN_CHUNK_SIZE` (100) — under the same metadata contract there's no reason for the two adapters to differ, and a difference would only turn "switching adapters changes pagination behavior" into something that needs investigating.

`conditionalCacheSize` only takes effect when `conditionalRequests: true`, but its default is still given in full: it determines the cache hit rate; too small just wastes requests, never produces wrong results.
