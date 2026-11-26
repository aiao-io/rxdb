# FetchMetadataHandler

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:104](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L104)

Protocol mapping for `fetchMetadata`.

## Remarks

The offset shape relies on a **server guarantee**: returning fewer than `limit` rows means the last page — a short page must not be returned early due to rate limiting, timeouts or server-side max-rows; ordering must be stable across pages; the snapshot must be consistent within one query. **Any server that fails one of these MUST use the token shape** — the adapter cannot detect short-page truncation on the client side.

## Methods

### parse() \{#parse\}

```ts
parse(body, ctx): FetchMetadataResult;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L120)

Parses the already-JSON-decoded response body. Throwing = this `fetchMetadata` fails; not swallowed, not retried

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `body` | `unknown` |
| `ctx` | [`FetchMetadataContext`](FetchMetadataContext.md) |

#### Returns

[`FetchMetadataResult`](../type-aliases/FetchMetadataResult.md)

***

### request() \{#request\}

```ts
request(ctx): HttpRequestSpec;
```

Defined in: [packages/rxdb-adapter-http/src/http.interface.ts:118](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/http.interface.ts#L118)

Produces the request description for this page. Pure function; no network.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `ctx` | [`FetchMetadataContext`](FetchMetadataContext.md) |

#### Returns

[`HttpRequestSpec`](HttpRequestSpec.md)

#### Remarks

**Must encode the pagination position into the URL or body**: `ctx.offset` for the offset shape, `ctx.pageToken` for the token shape. The adapter only decides whether to keep paging from the returned row count and token; it can't check whether the request carried the position — miss it and the remote returns the first page every time, pagination never advances until `maxPages` throws, and the error message points at the page cap, not at the parameter you forgot.

With `conditionalRequests` on, this symptom gets harder to recognize: the request fingerprint is taken from the actually-sent method + URL + body, so a missing position means all pages share one fingerprint, every page from the second on is a 304, and the replayed result is still the first page.
