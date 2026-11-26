---
sidebar_position: 2
---

# HTTP QueryCache protocol specification

> An integration spec for backends in **any language** (Node / Go / Python / Java / …).
> You do not need to understand RxDB internals — implement the REST endpoints below and the RxDB frontend can treat your API as the **remote source of truth** for its QueryCache.

## Positioning

This protocol corresponds to RxDB's `SyncType.QueryCache`:

- **The remote (your backend) is the authoritative source of truth**; reads and writes all defer to you;
- the client SQLite acts only as a **row cache** and never keeps rows the remote does not have;
- query filters travel as a JSON **`RuleGroup`**, **not SQL** — the database structure is never exposed to the client.

An "entity" maps to one table / resource on your backend; a record is a JSON object with **at least**:

| field       | type   | description                                   |
| :---------- | :----- | :-------------------------------------------- |
| `id`        | string | primary key, unique across the database       |
| `createdAt` | string | **ISO 8601** time string, the creation time   |
| `updatedAt` | string | **ISO 8601** time string, the freshness basis |

Other fields are determined by your entity definition; the client sends and receives them as-is.

:::warning `createdAt` is a **framework column**, not a business field
Client entities always extend `EntityBase`, whose `createdAt` is `NOT NULL` on the local table,
and QueryCache does not fill a default for you when landing rows. If a row lacks it, **none of the batch is written**.
For the full rules (which columns may be omitted, why defaults are not filled in) see
[Sync strategy · Column contract of remote rows](../collaboration/sync.md#column-contract-for-remote-rows).
:::

## General conventions

- **URL** = `baseUrl` prefix + relative path; below, `:entity` is the entity's resource path segment
  (defaults to the entity name; the client can configure a mapping such as `Recipe → recipes`).
- **`Content-Type: application/json`** for both request and response bodies.
- **Authentication**: the client injects headers (`Authorization: Bearer …` etc.) before every request; your backend validates as usual.
- **Timestamps**: all time fields are ISO 8601 strings, not Unix timestamps.
- **`id` containing `/` or special characters is `encodeURIComponent`ed by the client**; the backend decodes with standard URL decoding.

## Endpoint overview

The standard template (the default shape of the client's `createRestHandlers()`) has seven operations, **two required and five optional**:

| operation        | method  | path               | required | request body                                | response body                                 |
| :--------------- | :------ | :----------------- | :------: | :------------------------------------------ | :-------------------------------------------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata` |   yes    | `{ where, offset, limit, pageToken? }`      | `[{id,updatedAt}]` or `{rows,nextPageToken?}` |
| `findByIds`      | `POST`  | `:entity/by-ids`   |   yes    | `{ ids: string[] }`                         | array of full rows `[…]`                      |
| `create`         | `POST`  | `:entity`          |    no    | full row data (adopt the `id` when present) | **the full row after the write**              |
| `update`         | `PATCH` | `:entity/:id`      |    no    | partial fields                              | **the full row after the update**             |
| `delete`         | `POST`  | `:entity/delete`   |    no    | `{ ids: string[] }`                         | anything (response body discarded)            |
| `version`        | `GET`   | (custom)           |    no    | —                                           | `"x.y.z"` or `{ "version": "x.y.z" }`         |
| `isTableExisted` | `HEAD`  | (custom)           |    no    | —                                           | status code only (2xx / 404)                  |

Write entry points that are not configured simply do not exist: a read-only backend that does not implement `create` / `update` / `delete` gets **immediate rejection** from the corresponding client methods, not a request doomed to fail.

`version` and `isTableExisted` say "custom" in the path column, meaning **neither handler is produced by default**:
the template gives them no default path; only after configuring `templates.version.path` / `templates.isTableExisted.path` do the `GET` / `HEAD` above become the effective default methods. The first five operations have well-known shapes in REST; these two do not — guessing one for integrators would be inventing an endpoint that does not exist: `HEAD :entity` against a collection that does not support HEAD returns `405`, and `405` is neither 2xx nor 404, which lands exactly in the "throw" branch and turns a probe that could have been answered into a failure.

Beyond the seven operations there is one optional **non-entity-level** endpoint — [change notifications](#change-notifications-optional) (SSE): it belongs to no entity, and one connection covers every entity the client subscribes to.

---

## 1. fetchMetadata (required)

Pulls a batch of **metadata** (freshness comparison only) and returns the `{ id, updatedAt }` list matching the filter.

```http
POST /v1/recipes/metadata
Content-Type: application/json

{
  "where": { "combinator": "and", "rules": [
    { "field": "status", "operator": "=", "value": "published" }
  ]},
  "offset": 0,
  "limit": 1000
}
```

### Request body fields

| field       | type      | description                                                                         |
| :---------- | :-------- | :---------------------------------------------------------------------------------- |
| `where`     | RuleGroup | filter conditions; structure in "RuleGroup" below                                   |
| `offset`    | number    | start offset of this page (positive integer, `0` for the first page)                |
| `limit`     | number    | rows per page (positive integer, from the client's `pageSize`, default 1000)        |
| `pageToken` | string?   | token-shaped pagination position; **absent** for the first page or the offset shape |

**Response body — one of two shapes**; the client locks its pagination mode to **the first page's return shape**:

**Shape A (offset)**: returns an array.

```json
[
  { "id": "11111111-1111-4111-8111-111111111111", "updatedAt": "2026-08-01T00:00:00.000Z" },
  { "id": "22222222-2222-4222-8222-222222222222", "updatedAt": "2026-08-02T00:00:00.000Z" }
]
```

**Shape B (token)**: returns an object.

```json
{
  "nextPageToken": "eyJvZmZzZXQiOjEwMDB9",
  "rows": [{ "id": "11111111-1111-4111-8111-111111111111", "updatedAt": "2026-08-01T00:00:00.000Z" }]
}
```

### Pagination semantics (the backend must follow)

| shape | last-page detection                | backend guarantee                                                                                                                                      |
| :---- | :--------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------- |
| A     | `rows.length < limit` (short page) | returning fewer than `limit` rows **must** mean the last page; do not return a short page early due to rate limiting / timeouts / server-side max-rows |
| B     | `nextPageToken` absent             | each page's token is echoed back to you verbatim (opaque); you only need to guarantee "equal token → same page"                                        |

**Common guarantees of both shapes:**

- **Stable cross-page ordering**: within one query, concatenating the pages in the same order yields the complete result with no duplicates and no gaps.
- **Snapshot consistency**: the pages of one `fetchMetadata` should be based on the same data snapshot, to avoid duplicates / omissions when data changes mid-pagination.
- **If either guarantee cannot be met → use the token shape** (the client cannot detect short-page truncation on its own).

> Mid-query **shape switching**, a non-advancing token, consecutive empty pages, or hitting the total page cap all make the client **throw rather than return a truncated result** —
> deliberately: better to fail than to silently return "half the data".

---

## 2. findByIds (required)

Pulls **full rows** in batches by id. The client chunks by `idChunkSize` (default 100) and merges.

```http
POST /v1/recipes/by-ids
Content-Type: application/json

{ "ids": ["11111111-1111-4111-8111-111111111111", "22222222-2222-4222-8222-222222222222"] }
```

**Response body**: an array whose elements are **full rows** — not just the business fields, but every column the local table builds as `NOT NULL`, including `EntityBase`'s `createdAt` / `updatedAt`.
Which columns may be omitted, and why the client does not fill them in for you, see
[Sync strategy · Column contract of remote rows](../collaboration/sync.md#column-contract-for-remote-rows).

```json
[
  {
    "id": "11111111-1111-4111-8111-111111111111",
    "title": "Pasta",
    "status": "published",
    "createdAt": "2026-07-20T09:30:00.000Z",
    "updatedAt": "2026-08-01T00:00:00.000Z"
  }
]
```

Rows returned by one request **must have identical key sets**: the client generates one bulk INSERT from the first row's keys, and keys missing from later rows bind as `undefined` (NULL in the database). SQLite-family adapters reject the whole batch before landing it.

:::note Missing ids are legal
When **some ids** in a chunk do not exist (the remote really deleted them), return an array with **fewer** rows than the requested id count — the client does not retry or pad empty objects. But a **whole-chunk failure** (e.g. one id triggering an error) should return non-2xx.
:::

---

## 3. create (optional)

```http
POST /v1/recipes
Content-Type: application/json

{ "title": "Risotto", "status": "draft" }
```

- **Request body**: the new row data from the client. **When it carries `id`, you must adopt it** (see the warning below); only generate one when it is absent.
- **Response body**: **the full row after the write** — the same contract as §2; `createdAt` / `updatedAt` are finalized by the server, and the full row must be returned, not an echo of the input.

```json
{
  "createdAt": "2026-08-23T12:00:00.000Z",
  "id": "99999999-9999-4999-8999-999999999999",
  "status": "draft",
  "title": "Risotto",
  "updatedAt": "2026-08-23T12:00:00.000Z"
}
```

- **`id` already exists**: return `409`; do **not** silently overwrite that row. A normal replay never gets here — before sending `create`, the client probes the remote once with `fetchMetadata`, and switches to `update` when the same `id` already exists.

:::warning If the client provides `id`, you must use it
`id` and timestamps have different ownership. `updatedAt` is the freshness basis: the client's clock is untrusted, and you must re-finalize it;
`id` is mere identity, and it does not matter who makes it — **but during offline creation only the client can**: at that moment the cable is down,
the row has already entered the local cache, been referenced by the UI, and been recorded in the outbound queue. If you mint a different `id` when the replay connects,
the local row will never match the remote one and becomes an orphan the remote has never seen; the next metadata pull will clean it up as an orphan —
and everything the user wrote offline is gone.

The other side of the same argument: **the receipt must be the row after persistence, not an echo of the input**. If you echo back a row that never actually landed,
the local side again keeps a row the remote does not have. Adopting the `id` means "really write it to the database", not "copy it back verbatim".
:::

## 4. update (optional)

```http
PATCH /v1/recipes/99999999-9999-4999-8999-999999999999
Content-Type: application/json

{ "status": "published" }
```

- **Request body**: partial fields (only the fields to change).
- **Response body**: the full row after the update (same as `create`) — even if `createdAt` was not changed this time, include its **original value**;
  the client overwrites the local cache with this whole response row and does no field-level merge.

## 5. delete (optional)

```http
POST /v1/recipes/delete
Content-Type: application/json

{ "ids": ["11111111-1111-4111-8111-111111111111"] }
```

:::note POST by default, not DELETE + body
Bulk delete must put the ids in the body, and `DELETE` request bodies are dropped outright by many proxies / gateways / server frameworks —
a "delete these 3 rows" request would then arrive looking like "delete the whole collection". The client therefore defaults to
`POST :entity/delete` + `{ ids }`. You can also agree with the client to use real `DELETE`, but that needs explicit configuration.
:::

## 6. version (optional)

```http
GET /v1/meta/version
```

Respond `200` with the version **string** or `{ "version": string }`, one of the two:

```json
"1.4.2"
```

or

```json
{ "version": "1.4.2" }
```

Unimplemented: the client method throws "unsupported" and does **not** fall back to the client package version.

## 7. isTableExisted (optional)

This request only exists when `templates.isTableExisted.path` is configured; the path and the method are both yours. The `HEAD /v1/recipes` below is what it looks like after configuring the path as `:entity`, not the default behavior:

```http
HEAD /v1/recipes
```

The client decides by **status code** only:

| status code               | conclusion                                               |
| :------------------------ | :------------------------------------------------------- |
| 2xx                       | the table exists                                         |
| 404                       | the table does not exist                                 |
| other / transport failure | throw ("unknown" and "absent" must stay distinguishable) |

Unimplemented: the client reuses the `fetchMetadata` `limit: 1` probe.

---

## Conditional requests (optional)

Applies only to the two read endpoints (`fetchMetadata` / `findByIds`); a backend that **does not implement them is fully compliant** — the client has the feature off by default
(`conditionalRequests: false`): no conditional headers are sent, and a received `304` is treated as a non-2xx error.

Semantics when the backend does implement them:

| direction              | convention                                                                                                                                                                      |
| :--------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| on a `2xx` response    | include an `ETag` header whose value changes with the response body content (weak or strong validators are both fine; the client echoes it back verbatim and does not parse it) |
| the client's next call | for the **same request** (same URL + same body), send `If-None-Match: <previous ETag>`                                                                                          |
| content unchanged      | return `304` with **no body**                                                                                                                                                   |
| content changed        | return `200` + full body + a **new `ETag`**                                                                                                                                     |
| unrecognized ETag      | return `200` + full body (safe degradation; the client does not error over it)                                                                                                  |

:::warning `304` means "the copy you hold is still valid", not "zero rows"
On `304` the client **restores the parsed result of the last `200`**, not an empty set. The backend must therefore guarantee: whenever the content
changed, it must **not** return `304`. QueryCache decides which local rows became orphans from `fetchMetadata`'s id set; one
wrong `304` gets living remote rows deleted as orphans.
:::

The client-side switch, deduplication, and copy semantics are in the [adapter doc's conditional requests section](./http.md).

---

## Change notifications (optional)

The seven endpoints above are all **client asks, backend answers**: when remote rows change, the client cannot know until its next query. This section lets
the backend poke the client — **only a poke, no data**.

A backend that **does not implement it is fully compliant**. The consequence is today's behavior: the client only discovers remote
changes when it initiates a query, and freshness is decided by the client's `staleTime`. **That is not a fault** — just "things changed by
others become visible at my next query".

### Endpoint

| item                   | convention                                                                                     |
| :--------------------- | :--------------------------------------------------------------------------------------------- |
| method / path          | `GET`, path configured by the client (`changeFeed.url`), **entity-independent**                |
| `Content-Type`         | `text/event-stream` ([SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html))    |
| other response headers | `Cache-Control: no-cache`; usually also `X-Accel-Buffering: no` behind proxies                 |
| direction              | one-way, server → client; the client **sends nothing** on this connection                      |
| coverage               | one connection covers **all entities** the client subscribes to, not one connection per entity |

### Event body

Push with the **default event type** — write only `data:`, do **not** write an `event:` field. The client listens on `onmessage`;
events carrying a custom `event:` name are never received.

```text
data: {"entity":"Recipe","namespace":"public","clientId":"c-9f3a"}

data: {"entity":"Tag"}

```

(Each event ends with a **blank line** — SSE's framing rule.)

`data:` is a one-line JSON object:

| field       | type   | required | description                                                                                               |
| :---------- | :----- | :------: | :-------------------------------------------------------------------------------------------------------- |
| `entity`    | string |   yes    | **the client entity name** (e.g. `Recipe`) — not the table name, nor the resource path segment in the URL |
| `namespace` | string |    no    | defaults to `"public"`                                                                                    |
| `clientId`  | string |    no    | identifier of the client that initiated this change, for self-echo suppression, see below                 |

An unrecognized `entity` is **silently ignored** by the client: the broadcast goes to all subscribers, most of whom do not care about the entity
you pushed; treating "someone else's entity" as an error would only create noise in normal operation.

:::warning Do **not** put row data in events
The protocol says a notification only carries an entity name. Two reasons, neither about performance: one, the broadcast targets **all** subscribers, and
pushing row data on a multi-tenant backend means sending A's rows to B; two, "does this row belong to a `where` some client currently holds" is only
answerable by the server, and the server does not know which queries clients hold. On receiving a notification the client re-queries by itself — that path has
full permission checks and filter conditions.
:::

### `clientId`: save the initiating writer one re-fetch

The writer already has the response of its own `create` / `update`; it does not need to be notified again. When the event carries the initiator's
`clientId`, the client skips it if it recognizes itself.

**This requires the backend to attribute a write to some client**, and the client does not send it automatically — the app must inject
`rxdb.context.clientId` through the `auth` hook into the header of write requests, and the backend echoes it into the broadcast.

Omitting `clientId` is fully compliant, at the cost of one extra fetch by the initiator; **getting it wrong** is what hurts: filling in someone else's id makes that client
drop a real change as its own echo. When unsure, leave it out.

### A successful connection = full invalidation (no replay of missed events needed)

The client marks **all subscribed entities** invalid on **every connection** (first connection and every reconnect treated the same). Implications:

- changes that happened while disconnected do **not** need to be replayed;
- `Last-Event-ID` / event replay does **not** need to be implemented — the client does not send this header;
- the `id:` field may be omitted.

The cost is one round of re-fetches per reconnect. So the backend only has to do one thing: **allow the client to reconnect at any time**, without
punitive rate limiting of frequent reconnects from the same origin. The client has its own exponential backoff (default starting at 1s, capped at 30s).

Long connections are easily cut by idle timeouts behind proxies; sending a comment keep-alive line every 15–30 seconds is recommended:

```text
:keep-alive

```

### Authentication: `EventSource` cannot carry headers

The browser's `EventSource` **cannot set custom request headers**, so the `Authorization` header injected by the client's `auth` hook
**does not apply** to this connection (it applies as usual to the seven endpoints above). Two available routes:

- **Cookie** — the client sets `withCredentials: true`, and the browser sends same-origin / cross-origin cookies;
- **Ticket on the URL** — the app concatenates a one-time token into `changeFeed.url` itself (note the URL will appear in logs).

Design this connection's authentication around one of the two above; do not count on the `Authorization` header.

### Cross-origin

This connection is `GET` with no custom headers, a **simple request**, so there is no preflight. It still needs:

| scenario                         | required response headers                                                                                          |
| :------------------------------- | :----------------------------------------------------------------------------------------------------------------- |
| cross-origin                     | `Access-Control-Allow-Origin`                                                                                      |
| cross-origin + `withCredentials` | `Access-Control-Allow-Origin` **echoing the specific Origin** (not `*`) + `Access-Control-Allow-Credentials: true` |

### What happens when the endpoint does not exist

If the client configured `changeFeed` and you did not implement the endpoint, the connection fails, and the client **keeps retrying with backoff**.
This affects no query: `EventSource` exposes no status code, so the client **cannot tell** "endpoint not implemented" / "auth failed" /
"really offline" apart — it therefore does not translate this connection's liveness into network errors: no `NetworkOfflineError`, no
offline degradation, only a diagnostic callback (`changeFeed.onUnavailable`) for the app to handle.

The conclusion for the backend is: **do not let clients configure it if it is not implemented**, otherwise you will see a 404 endpoint being knocked on
repeatedly; and when investigating, the frontend side has only one line in the diagnostic callback, no exception.

### Minimal implementation (`node:http`)

```js
const clients = new Set();

// GET /changes
function subscribe(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Access-Control-Allow-Origin': req.headers.origin ?? '*'
  });
  res.write(':ok\n\n');
  clients.add(res);
  const keepAlive = setInterval(() => res.write(':keep-alive\n\n'), 20000);
  req.on('close', () => {
    clearInterval(keepAlive);
    clients.delete(res);
  });
}

// Call after any write has been persisted
function broadcast(entity, clientId) {
  const frame = `data:${JSON.stringify({ entity, clientId })}\n\n`;
  for (const res of clients) {
    res.write(frame);
  }
}
```

The client-side switches, diagnostic callbacks, and reconnect parameters are in the [adapter doc](./http.md).

---

## Cross-origin (CORS)

The protocol itself is transport-agnostic; nothing in this section is a "protocol requirement". But a browser frontend is almost never same-origin with the API,
and cross-origin default behavior **silently** changes the observable results of the sections above — so the backend must explicitly configure three things.

### 1. Preflight: non-simple requests send `OPTIONS` first

Among the seven endpoints, only `version`'s `GET` and `isTableExisted`'s `HEAD` can fall into "simple requests";
`POST :entity/metadata`, `POST :entity/by-ids`, `POST :entity`, `PATCH :entity/:id`, and
`POST :entity/delete` all send an `OPTIONS` preflight first. The preflight **does not appear on `fetch`'s observable surface**:
the browser sends and receives it itself; scripts get neither the request nor the response, and on failure the frontend only sees a
network error with no details.

The preflight response must include:

| response header                | value                                                 |
| :----------------------------- | :---------------------------------------------------- |
| `Access-Control-Allow-Origin`  | echo `Origin` (or `*`)                                |
| `Access-Control-Allow-Methods` | at least `GET, HEAD, POST, PATCH, OPTIONS`            |
| `Access-Control-Allow-Headers` | at least `content-type, authorization, if-none-match` |

**None** of the three request headers is in the CORS safelist: the safelist only allows three MIME types for `Content-Type`,
and `application/json` is not among them; `Authorization` was never a safelisted header; neither is `If-None-Match`.
Miss any one and the endpoint is blocked at the preflight stage — the request never goes out.

### 2. Error responses also need the cross-origin header

`4xx` / `5xx` must also carry `Access-Control-Allow-Origin`. Without it, the browser turns a **successfully delivered**
`409` into a network error, the client throws `NetworkOfflineError` and degrades offline —
the "non-2xx does not degrade" convention in the [error semantics](#error-semantics-what-the-backend-needs-to-know) table is quietly overturned by cross-origin configuration.

### 3. `ETag` must be explicitly exposed, otherwise conditional requests silently never work

Cross-origin responses expose only seven response headers to scripts by default, and `ETag` is **not among them**. Without

```http
Access-Control-Expose-Headers: ETag
```

the client reads `ETag` as `null` — it concludes "this response has no ETag", drops the cache entry, and
the next request naturally carries no `If-None-Match`, so the backend always returns `200`.

**Nothing errors anywhere along this path**: no exception, no warning, not one console line; functionality is completely normal,
conditional requests just never hit. It shows up as wasted bandwidth rather than a fault — which is why it is nearly impossible to catch during
integration testing. Same-origin deployments can omit this header; cross-origin it is the single switch deciding whether conditional requests work at all.

The full browser reproduction is in `apps/dev-rxdb-http` (frontend 4300 / backend 4301, deliberately cross-origin).

---

## RuleGroup JSON structure

`where` is a recursive filter tree — **leaves are rules, non-leaves are combinations**:

```json
{
  "combinator": "and", // "and" | "or"
  "rules": [
    { "field": "status", "operator": "=", "value": "published" },
    {
      "combinator": "or",
      "rules": [
        { "field": "price", "operator": "<=", "value": 10 },
        { "field": "tag", "operator": "in", "value": ["sale", "new"] }
      ]
    }
  ]
}
```

**Rule shapes** (five categories by `operator`):

| `operator`                                                                     | `value` shape                    | description                           |
| :----------------------------------------------------------------------------- | :------------------------------- | :------------------------------------ |
| `=` `!=` `<` `>` `<=` `>=`                                                     | scalar                           | equality / inequality / comparison    |
| `contains` `notContains` `startsWith` `notStartsWith` `endsWith` `notEndsWith` | string                           | string matching                       |
| `null` `notNull`                                                               | **no `value`**                   | null checks                           |
| `in` `notIn`                                                                   | array                            | set containment                       |
| `between` `notBetween`                                                         | `[min, max]` two-element array   | closed interval                       |
| `exists` `notExists`                                                           | **no `value`**, optional `where` | relation existence (relation queries) |

**Translation guide**: you only need to map each `field` to a column name, each `operator` to your own query condition,
and `and` / `or` to AND / OR. `field` values are **trusted column names** (from the client's entity definitions), not user input.

---

## Error semantics (what the backend needs to know)

The client classifies responses by status code and transport result; the backend needs no specific error format, but should know these consequences:

| scenario                                                            | client behavior                                                              |
| :------------------------------------------------------------------ | :--------------------------------------------------------------------------- |
| network failure / timeout                                           | throws `NetworkOfflineError` (may degrade to the local cache)                |
| non-2xx response                                                    | throws an error with a numeric `status` (**no degradation**, fails directly) |
| invalid metadata (missing `id`/`updatedAt` or illegal time strings) | throws `HttpInvalidMetadataError`                                            |
| write receipt not an object (`null` / array / scalar)               | throws `HttpHandlerContractError`                                            |

:::tip Do not mask "no data" with 5xx
"The remote does not have this data" should appear as "empty array / 404", not `500`. Using 500 for a business empty state
makes the client treat an expected empty result as a fault.
:::

---

## End-to-end example (curl)

With `baseUrl = https://api.example.com/v1` and resource `recipes`:

```bash
# Fetch metadata for status=published (offset shape, first page)
curl -X POST 'https://api.example.com/v1/recipes/metadata' \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <token>' \
  -d '{
    "where": { "combinator": "and", "rules": [
      { "field": "status", "operator": "=", "value": "published" }
    ]},
    "offset": 0,
    "limit": 1000
  }'

# Fetch full rows by id
curl -X POST 'https://api.example.com/v1/recipes/by-ids' \
  -H 'Content-Type: application/json' \
  -d '{"ids":["11111111-1111-4111-8111-111111111111"]}'

# Create
curl -X POST 'https://api.example.com/v1/recipes' \
  -H 'Content-Type: application/json' \
  -d '{"title":"Risotto","status":"draft"}'

# Update
curl -X PATCH 'https://api.example.com/v1/recipes/99999999-9999-4999-8999-999999999999' \
  -H 'Content-Type: application/json' \
  -d '{"status":"published"}'

# Bulk delete
curl -X POST 'https://api.example.com/v1/recipes/delete' \
  -H 'Content-Type: application/json' \
  -d '{"ids":["11111111-1111-4111-8111-111111111111"]}'
```

## Acceptance checklist

Before finishing the integration, check yourself against this list (each item corresponds to a hard contract on the client side):

- [ ] `fetchMetadata` keeps the first page's return shape (array or object) **consistent for the whole query**;
- [ ] in the offset shape, short pages only appear on the true last page;
- [ ] in the token shape, `nextPageToken` advances page by page, and the last page **omits** the field;
- [ ] every `metadata` entry carries a legal ISO 8601 `updatedAt`;
- [ ] `create` / `update` return the **persisted** full row (server-finalized `updatedAt`);
- [ ] `create` **adopts** the `id` in the request body (offline-created rows match the remote through it), and returns `409` on collision rather than overwriting;
- [ ] `findByIds` returns **fewer** rows than requested for missing ids, not `500`;
- [ ] `delete` uses `POST` and reads `ids` from the body (or explicitly agrees with the client on real `DELETE`);
- [ ] if conditional requests are implemented: once the content changes, **never** return `304` again (`304` means "the copy the client holds is still valid");
- [ ] if [change notifications](#change-notifications-optional) are implemented: events use the **default type** (write only `data:`, not `event:`), the payload carries only the entity name **without row data**, and frequent client reconnects are not punitively rate-limited (events during a disconnection need not be replayed);
- [ ] if the frontend is cross-origin: the preflight allows `content-type` / `authorization` / `if-none-match`, error responses also carry the cross-origin header, and `ETag` is exposed with `Access-Control-Expose-Headers: ETag` (missing the last one makes conditional requests **silently** fail, see [Cross-origin (CORS)](#cross-origin-cors)).

---

:::note Difference from Full / Filter sync
This protocol **only** covers `SyncType.QueryCache`. The bidirectional sync (Full / Filter) that needs offline writes, undo/redo, conflict resolution, and branch
semantics is a different, more complex change-stream protocol, out of scope for this page.
:::
