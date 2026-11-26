# HttpAdapterOptions

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:516](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L516)

Configuration for `new RxDBAdapterHttp(rxdb, options)`.

## Extends

- `Partial`&lt;[`HttpNumericConfig`](HttpNumericConfig.md)&gt;

## Properties

### auth? \{#auth\}

```ts
auth?: HttpAuthHook;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:520](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L520)

***

### baseUrl \{#baseurl\}

```ts
baseUrl: string;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:518](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L518)

Base address for relative URLs; ignored when the handler returns an absolute URL

***

### changeFeed? \{#changefeed\}

```ts
changeFeed?: HttpChangeFeedOptions;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:608](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L608)

**`Experimental`**

Enables the change-notification channel (US-023 AC#12). **Absent means off**.

#### Remarks

When off, behavior is character-for-character identical to before this story: zero extra requests, zero connections, and remote changes are discovered when the next `find()` revalidates against the remote. When on, a remote change immediately reruns the live queries subscribed to the same entity.

For the same reason as `conditionalRequests`, it must be explicitly enabled: not every backend can implement push, and the adapter can't probe it — a backend that doesn't implement the endpoint shows up as a refused connection, not as "no changes".

**When it can't connect, it doesn't degrade to polling.** Silently switching to a second-class "ask every N seconds" channel would hand the integrator a realtime with an unstatable latency bound, and when something goes wrong you couldn't tell which path it took. Not connected means not connected: back off and reconnect, reporting through [HttpChangeFeedOptions.onUnavailable](HttpChangeFeedOptions.md#onunavailable).

**A successful connection (including every reconnect) reports one invalidation per entity that goes through this adapter.** That's a correctness requirement, not an optimization: nobody re-delivers changes that happened while disconnected, and without an active invalidation the client would mistake "received no message" for "nothing changed" — and that misjudgment could persist indefinitely. The cost is one metadata round trip; with no changes, zero rows are fetched.

#### Example

```ts
new RxDBAdapterHttp(rxdb, {
  baseUrl,
  handlers,
  changeFeed: `{ url: 'changes', onUnavailable: report => myLogger.warn(report.message, report) }`
});
```

 Outside the 1.0 compatibility promise: the protocol currently has only one implementation — the reference backend — and the wire shape may adjust with a second implementation.
For the tiering basis see `requirements/versioning-policy.md` "experimental tier".

***

### conditionalCacheSize? \{#conditionalcachesize\}

```ts
conditionalCacheSize?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:512](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L512)

Entry cap for the conditional-request response cache. Default `256`; only in effect when `conditionalRequests` is `true`.

#### Remarks

One page / one chunk each takes one entry, so the cap should be sized by the **total pages of concurrently active queries**, not by the number of entities. Too small and the hottest first pages get evicted repeatedly during pagination, degrading to no cache at all (never producing wrong results).

#### Inherited from

[`HttpNumericConfig`](HttpNumericConfig.md).[`conditionalCacheSize`](HttpNumericConfig.md#conditionalcachesize)

***

### conditionalRequests? \{#conditionalrequests\}

```ts
conditionalRequests?: boolean;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:543](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L543)

Enables ETag / If-None-Match conditional requests (US-212 AC#28). Default `false`.

#### Remarks

**Must be explicitly enabled**, because it only pays off when the remote actually sends `ETag` and honors `If-None-Match`, which the adapter can't probe. When off, `fetchMetadata` / `findByIds` behave character-for-character as in phase A: no conditional headers, no deduplication of concurrency, 304 still treated as an error.

When on, what's cached is the **response** (the JSON body of the last 200), not rows — the row cache belongs to core via the local adapter, and this package doesn't touch it (AC#19). The cache lives per adapter instance, is bounded ([HttpNumericConfig.conditionalCacheSize](HttpNumericConfig.md#conditionalcachesize)), and is cleared on `disconnect()`.

Of the three header groups, only one enters the request fingerprint. [HttpRequestSpec.headers](HttpRequestSpec.md#headers) (what the handler supplies per request) **enters** — it's the only group that distinguishes projections on the same URL; leaving it out would let two tenants share one entry. [HttpAdapterOptions.headers](#headers) (constant per instance) and what the auth hook produces **do not**: the former would just prefix every key with the same segment, the latter would invalidate everything on every token rotation.

**Switching users must go through `disconnect()` / `connect()`**: that's the price of auth headers not entering the fingerprint — swapping the token directly on the same instance will read responses from the previous identity.

***

### handlers \{#handlers\}

```ts
handlers: HttpHandlers;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:519](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L519)

***

### headers? \{#headers\}

```ts
headers?: Record<string, string>;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:522](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L522)

Headers attached to all requests; on conflict with the auth hook, the auth hook wins

***

### idChunkSize? \{#idchunksize\}

```ts
idChunkSize?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:498](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L498)

ids per `findByIds` chunk. Default `100` (matches `SUPABASE_IN_CHUNK_SIZE`)

#### Inherited from

[`HttpNumericConfig`](HttpNumericConfig.md).[`idChunkSize`](HttpNumericConfig.md#idchunksize)

***

### maxEmptyPages? \{#maxemptypages\}

```ts
maxEmptyPages?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:500](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L500)

Tolerance for consecutive empty pages in token mode. Default `3`; `0` = no tolerance for empty pages

#### Inherited from

[`HttpNumericConfig`](HttpNumericConfig.md).[`maxEmptyPages`](HttpNumericConfig.md#maxemptypages)

***

### maxPages? \{#maxpages\}

```ts
maxPages?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:502](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L502)

Total page cap for a single `fetchMetadata`. Default `1000`; hitting the cap **throws rather than truncates**

#### Inherited from

[`HttpNumericConfig`](HttpNumericConfig.md).[`maxPages`](HttpNumericConfig.md#maxpages)

***

### onEtagUnreadable? \{#onetagunreadable\}

```ts
onEtagUnreadable?: HttpEtagUnreadableHook;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:577](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L577)

Called when conditional requests are on, the response is 200, yet no `ETag` can be read (US-215).

#### Remarks

Why it exists: before `conditionalRequests` is turned on, whether the remote honors `If-None-Match` is genuinely unprobeable, but after it's on, "never took effect once" is hard evidence the adapter holds in its hands — a 200 response, conditional requests on, yet no `ETag` readable. Without this callback it knows, but has no mouth: requests keep going out, the bill keeps getting paid, cache hits are zero, and there's not a single log line on the client side.

Three boundaries; miss one and this callback becomes a new problem:

- **It doesn't change the data path.** Behavior without it is character-for-character the same as before US-215 (drop the entry, return normally); with it, the same — the callback is just one extra call.
- **It doesn't guess the cause**, only reports facts (see [HttpEtagUnreadableReport](HttpEtagUnreadableReport.md)).
- **It deduplicates per cache key**, reporting each key once; `disconnect()` clears the records together with the cache, so after reconnecting with a changed backend configuration it reports again.

**Errors thrown by the callback are discarded** — not because "another channel has it covered", but because there is genuinely nowhere to go: what's being reported at that moment is precisely "this package has no output channel". A diagnostic channel must not become a new failure source, so it's better to drop. If you need to know that your own reporting failed, handle it inside the callback.

With `conditionalRequests` off it **never fires**: an off switch shouldn't make noise.

#### Example

```ts
new RxDBAdapterHttp(rxdb, {
  baseUrl,
  handlers,
  conditionalRequests: true,
  onEtagUnreadable: report => myLogger.warn(report.message, report)
});
```

***

### pageSize? \{#pagesize\}

```ts
pageSize?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:496](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L496)

Rows per page, passed through as the handler's `ctx.limit`. Default `1000` (matches `SUPABASE_PAGE_SIZE`)

#### Inherited from

[`HttpNumericConfig`](HttpNumericConfig.md).[`pageSize`](HttpNumericConfig.md#pagesize)

***

### requestTimeoutMs? \{#requesttimeoutms\}

```ts
requestTimeoutMs?: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L504)

Timeout cap for a **single** HTTP request (milliseconds). Default `30000`

#### Inherited from

[`HttpNumericConfig`](HttpNumericConfig.md).[`requestTimeoutMs`](HttpNumericConfig.md#requesttimeoutms)
