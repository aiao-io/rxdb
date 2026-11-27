# DEVTOOLS_MAX_REQUEST_TOMBSTONES

```ts
const DEVTOOLS_MAX_REQUEST_TOMBSTONES: 4096;
```

Defined in: [v2/constants.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/v2/constants.ts#L54)

Per-session cap on terminal request ID tombstones.

## Remarks

"Terminal IDs must not be reused" has to be implemented with **bounded** tombstones. An unbounded set would let a long session's memory grow
monotonically with the request count, and that growth is completely invisible in functional tests. Once the cap is reached, new registrations return
`session_budget_exhausted`, and the panel re-handshakes for a new session.

This is also the **total number of distinct request IDs a single session can admit**: admission counts in-flight requests against the watermark,
reserving a terminal slot for every admitted ID (see `#admit` in `session.ts`).
