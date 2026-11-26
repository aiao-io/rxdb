# HttpNumericConfig

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:494](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L494)

The six numeric options — all overridable, all defaulted.

## Properties

### conditionalCacheSize \{#conditionalcachesize\}

```ts
conditionalCacheSize: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:512](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L512)

Entry cap for the conditional-request response cache. Default `256`; only in effect when `conditionalRequests` is `true`.

#### Remarks

One page / one chunk each takes one entry, so the cap should be sized by the **total pages of concurrently active queries**, not by the number of entities. Too small and the hottest first pages get evicted repeatedly during pagination, degrading to no cache at all (never producing wrong results).

---

### idChunkSize \{#idchunksize\}

```ts
idChunkSize: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:498](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L498)

ids per `findByIds` chunk. Default `100` (matches `SUPABASE_IN_CHUNK_SIZE`)

---

### maxEmptyPages \{#maxemptypages\}

```ts
maxEmptyPages: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:500](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L500)

Tolerance for consecutive empty pages in token mode. Default `3`; `0` = no tolerance for empty pages

---

### maxPages \{#maxpages\}

```ts
maxPages: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:502](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L502)

Total page cap for a single `fetchMetadata`. Default `1000`; hitting the cap **throws rather than truncates**

---

### pageSize \{#pagesize\}

```ts
pageSize: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:496](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L496)

Rows per page, passed through as the handler's `ctx.limit`. Default `1000` (matches `SUPABASE_PAGE_SIZE`)

---

### requestTimeoutMs \{#requesttimeoutms\}

```ts
requestTimeoutMs: number;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:504](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L504)

Timeout cap for a **single** HTTP request (milliseconds). Default `30000`
