# Supabase transport failure error type migration

The error type thrown by `@aiao/rxdb-adapter-supabase` when it **cannot reach the remote** changed: it used to be the package's own `SupabaseDataError`, now it is core's `NetworkOfflineError`.

This is a **breaking change** affecting all code that catches network failures by `SupabaseDataError`. What it buys: the `offlineFallback` of `QueryCacheRepository` actually works on this adapter for the first time — before this, when the network was down you got an exception, not the cache.

## Why it had to change

Offline degradation is gated by core's [`isNetworkError`](https://github.com/aiao-io/rxdb/blob/main/packages/rxdb/src/repository/network-error.ts), and its **default verdict is "not a network error"**: anything it does not recognize is judged `false` and rethrown as-is.

`SupabaseDataError` missed all five of its criteria — not a `NetworkOfflineError` instance, no numeric `status`, `code` is `'DATA_ERROR'`, `name` is not in `NETWORK_ERROR_NAMES`, and it is not a `TypeError`. So the promise "with QueryCache configured, reads hit the cache when offline" never held on supabase, **without an error or a warning** — it just looked like the query failed.

The adapter is the only layer that knows "this time it is unreachable vs. rejected", so the classification duty falls to it.

## Behavior changes

| Scenario                                                                | Before                | After                 |
| ----------------------------------------------------------------------- | --------------------- | --------------------- |
| Network down / DNS failure / connection refused                         | `SupabaseDataError`   | `NetworkOfflineError` |
| 401 / 403 (RLS rejection)                                               | `SupabaseDataError`   | `SupabaseDataError`   |
| 409 (unique constraint conflict)                                        | `SupabaseDataError`   | `SupabaseDataError`   |
| 502 / 503 (remote failure)                                              | `SupabaseDataError`   | `SupabaseDataError`   |
| Configuration errors (entity not configured, unsupported property type) | `SupabaseConfigError` | `SupabaseConfigError` |

The criterion is the **HTTP status code, not the error message**: on fetch failure postgrest-js does not reject; it catches the `TypeError` and returns `{ error, data: null, status: 0 }`. Therefore `status === 0` ⇒ the connection was never established; any non-zero status ⇒ the connection works, and 401 / 403 / 502 are all **answers** from the remote, not offline.

Grouping 502 and 503 on the "answer from the remote" side is deliberate: the request reached the remote and got a status code; the local cache is not necessarily closer to the truth than the remote's error, and silent degradation would dress up a recoverable server failure as a normal result.

Affected are all public methods that go through `classify_postgrest_error` — `SupabaseRepository`'s `find` / `count` / `create` / `update` / `remove`, `SupabaseTreeRepository`'s descendant and ancestor queries, and the adapter's `fetchMetadata` / `findByIds` / change pull and merge.

## How to update

Change "catching network failures by error class" to "deciding with `isNetworkError`":

```typescript
// Before — when offline, NetworkOfflineError hits no branch and becomes an unhandled rejection
try {
  await repo.find({ where: { status: 'active' } });
} catch (e) {
  if (e instanceof SupabaseDataError) {
    toast(e.message);
  }
}

// After
import { isNetworkError } from '@aiao/rxdb';

try {
  await repo.find({ where: { status: 'active' } });
} catch (e) {
  if (isNetworkError(e)) {
    toast('You are offline; showing the local cache');
  } else if (e instanceof SupabaseDataError) {
    toast(e.message);
  }
}
```

Use `isNetworkError` rather than `e instanceof NetworkOfflineError`: the former is core's single authoritative verdict on "what counts as offline", and it also covers other adapters and future criteria.

If you just want both classes to count as failures with one toast and do not distinguish offline, catch the base class instead — `SupabaseSyncError` covers every error in this package but does **not** cover `NetworkOfflineError` (it comes from core), so in that case do not narrow the type inside `catch`:

```typescript
catch (e) {
  toast(e instanceof Error ? e.message : String(e));
}
```

## Retries on the write path

Write operations (`executeTransaction` / `mergeChanges` / batch upserts and deletes) retry **transient failures** up to 3 times before throwing, with a backoff of 150ms × attempt number. "Transient" is recognized by the error message — connection broken, gateway timeout, upstream connection failure, temporarily unavailable, and so on; deterministic failures like RLS rejection and constraint conflicts throw on the first attempt without retrying.

Classification happens **after retries are exhausted** and only looks at the **last** response: three failures to connect (`status === 0`) → `NetworkOfflineError`; the last attempt got a status code (even a 504) → `SupabaseDataError`. The write path's error typing is therefore exactly consistent with the read path, at the cost of at most about 450ms extra latency before throwing. Existing catch branches need no changes for the retries.

## What about `SupabaseNetworkError`

The `SupabaseNetworkError` exported by this package is marked `@deprecated` and **kept only so the published public API is not broken**. It was never thrown inside the adapter, and it cannot represent offline — `isNetworkError` does not recognize it either.

If your code catches it, that branch never fired before and never will; delete it.

## See also

- [Switching adapters and migrating data](./adapters.md)
- [v0 → 1.0 upgrade](./v1.md)
