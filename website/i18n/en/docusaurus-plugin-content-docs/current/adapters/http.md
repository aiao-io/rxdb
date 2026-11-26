# HTTP adapter

`@aiao/rxdb-adapter-http` lets **your own REST API** serve as the QueryCache's remote source of truth:
the local SQLite acts only as a row cache, and reads and writes defer to the remote. It suits apps that already have a backend API and do not want to expose the database structure to the client.

:::tip Backend integrators, read the protocol spec
If you are **implementing a backend** (Node / Go / Python …) to integrate with the RxDB frontend, see
[HTTP QueryCache protocol specification](/adapters/http-protocol.md) — a language-agnostic endpoint + JSON contract you can implement without reading any TS source.
:::

:::warning v1 supports `SyncType.QueryCache` only
This package has **no** Full / Filter sync: `pullChanges` / `mergeChanges` / `getChangeCount` all throw
`HttpChangelogUnsupportedError` — never returning an empty array or `0` to pretend "the remote has no changes".
Entities that need offline writes, undo/redo, and conflict resolution should use a local adapter + Supabase instead.
:::

## Installation

```bash npm2yarn
npm install @aiao/rxdb @aiao/rxdb-adapter-http
```

No runtime dependencies: requests are issued by the package's built-in transport using the global `fetch`.

## Two slots, each in its place

QueryCache needs two adapters; this package occupies only the **remote** one:

| slot     | who does it                           | responsibility                                                      |
| :------- | :------------------------------------ | :------------------------------------------------------------------ |
| `remote` | `@aiao/rxdb-adapter-http`             | `fetchMetadata` / `findByIds` + optional `create`/`update`/`delete` |
| `local`  | any SQLite adapter (**you register**) | row cache: `getMetadataByIds` / `upsertMany` / `deleteByIds`        |

This package **neither owns nor creates** any local storage — it does not `new` SQLite and does not open OPFS / IndexedDB.
Which database the local cache lands in, and with which engine, is entirely decided by the adapter you register.
Plugins with `inject: ['adapter:local']` (search, graph queries, etc.) therefore bind to your SQLite, never to this package.

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Product],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite' },
    remote: { adapter: 'http' }
  }
});

rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db));
rxdb.adapter('http', db => new RxDBAdapterHttp(db, { baseUrl: 'https://api.example.com', handlers }));
```

## handlers: protocol mapping only, no requests

`handlers` translate core's calls into HTTP request descriptions and parse response bodies back into data.
**Requests are issued by the adapter** — auth injection, status-code extraction, error classification, pagination, chunking, and timeouts all live inside the package.
A handler never touches the network, so it cannot bypass these guarantees.

```typescript
import type { HttpHandlers } from '@aiao/rxdb-adapter-http';

const handlers: HttpHandlers = {
  // Required: fetch only { id, updatedAt } for freshness comparison
  onFetchMetadata: {
    request: ctx => ({
      url: `${ctx.entityName}/metadata`,
      method: 'POST',
      body: { where: ctx.where, offset: ctx.offset, limit: ctx.limit }
    }),
    parse: body => body as { id: string; updatedAt: string }[]
  },
  // Required: fetch full rows by id
  onFindByIds: {
    request: ctx => ({ url: `${ctx.entityName}/rows`, method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  },
  // Optional: the write entry points only exist when configured
  onCreate: { request: ctx => ({ url: ctx.entityName, method: 'POST', body: ctx.data }), parse: body => body },
  onUpdate: {
    request: ctx => ({ url: `${ctx.entityName}/${ctx.id}`, method: 'PATCH', body: ctx.data }),
    parse: body => body
  },
  onDelete: { request: ctx => ({ url: ctx.entityName, method: 'DELETE', body: { ids: ctx.ids } }) }
};
```

`where` is handed to you as a JSON **`RuleGroup`** as-is — this package generates no SQL; how the server translates it is up to you.

:::tip Write handlers decide write capability
Without `onCreate` / `onUpdate` / `onDelete` configured, the corresponding methods **do not exist** on the adapter,
and `repo.create(...)` fails fast on the spot (`Remote adapter does not support create`) — nothing is written into the local cache.
Read-only integrators simply leave the three out.
:::

### REST template: for when you do not want to hand-copy this boilerplate

The vast majority of REST backends map identically: resource path + fixed body shape.
`createRestHandlers()` collects it into a factory that **still produces plain `HttpHandlers`** —
the adapter is unchanged; pagination, chunking, single emission, and error classification all work as before.

```typescript
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';

rxdb.adapter(
  'http',
  db =>
    new RxDBAdapterHttp(db, {
      baseUrl: 'https://api.example.com/v1',
      handlers: createRestHandlers({
        resources: { Recipe: 'recipes' }, // entities not listed use the entity name as the path segment
        templates: {
          version: { path: 'meta/version' }, // override: provide an object
          delete: null // disable: read-only backends make repo.delete() fail fast
        }
      })
    })
);
// fetchMetadata → POST  https://api.example.com/v1/recipes/metadata
// update        → PATCH https://api.example.com/v1/recipes/{id}
```

| operation        | method  | default path       | produced by default      |
| :--------------- | :------ | :----------------- | :----------------------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata` | yes (cannot be disabled) |
| `findByIds`      | `POST`  | `:entity/by-ids`   | yes (cannot be disabled) |
| `create`         | `POST`  | `:entity`          | yes                      |
| `update`         | `PATCH` | `:entity/:id`      | yes                      |
| `delete`         | `POST`  | `:entity/delete`   | yes                      |
| `version`        | `GET`   | —                  | no                       |
| `isTableExisted` | `HEAD`  | —                  | no                       |

Request body shapes: `fetchMetadata` sends `{ where, offset, limit, pageToken }`; `findByIds` and `delete` send `{ ids }`;
`create` / `update` send the caller-provided data directly. `version` / `isTableExisted` are **not produced by default** —
`/version` and the probe endpoint have no well-known shape, and guessing one for you would be inventing a non-existent endpoint. These two operations **have no default path**;
without an explicit `templates.version.path` / `templates.isTableExisted.path`, the handler is not produced at all:
`version()` throws unsupported, and `isTableExisted()` falls back to an `onFetchMetadata` `limit: 1` probe.
The `HEAD` in `isTableExisted`'s method column only takes effect **after a path is given**.

:::warning Template validation happens at construction
Empty paths, paths containing whitespace / `?` / `#`, illegal methods, mismatched placeholder sets, or disabling `fetchMetadata` or `findByIds`,
all throw `HttpConfigError` on the spot. Placeholders must match **exactly**: an `update` missing `:id` would `PATCH` the whole collection,
and any template missing `:entity` would share one URL across all entities — both degradations can get a 2xx on the wire,
and you cannot see it by looking at response codes after the fact.
:::

`delete` defaults to `POST :entity/delete` rather than `DELETE :entity` + body: `DELETE` request bodies are dropped outright by many proxies,
gateways, and server frameworks, and a "delete these 3 rows" request would then arrive at the server as `DELETE /recipes`.
Explicitly override `templates.delete` for real `DELETE`.

`resources` values may contain `/` (`v1/recipes` is legal) — they come from your config and are constants;
whereas `:id` values come from remote rows and are `encodeURIComponent`ed before being joined into the URL.

### `updatedAt` must be an ISO 8601 string

The `updatedAt` returned by `onFetchMetadata.parse` is normalized to UTC + 3-digit milliseconds (`2026-08-23T10:00:00.000Z`) before reaching core.
Valid ISO strings with a timezone offset or missing milliseconds are canonicalized first; **strings missing a timezone designator, non-ISO strings, or strings that are not real instants throw `HttpInvalidMetadataError`** —
no silent pass-through, because core parses both sides into instants for freshness comparison, and a string without a timezone designator parses in the local timezone, so the same response points at different instants on different machines.

## Pagination: finish all pages, or throw

`onFetchMetadata.parse` has two return shapes, and **must not switch mid-query**:

| shape                     | termination criterion                  | server requirement                                                                          |
| :------------------------ | :------------------------------------- | :------------------------------------------------------------------------------------------ |
| `Metadata[]`              | `rows.length < limit` is the last page | no early short pages due to rate limiting / timeouts / max-rows; stable cross-page ordering |
| `{ rows, nextPageToken }` | `nextPageToken === undefined`          | the token must advance                                                                      |

Servers that cannot meet either guarantee **must** use the token shape — short-page truncation is undetectable on the client side.

:::note `pageToken` is an opaque string, not a `findByCursor` cursor
The adapter only compares it for "equal / not equal / `undefined`", never parsing its internals. Core's
[`findByCursor`](/model-query/findByCursor.md) uses "cursor" for keyset anchors made of **entity instances**; that cursor is compiled into `where` rule groups
inside the Repository, and the adapter never sees it. The two are unrelated.
:::

:::warning `request()` must encode the pagination position into the URL or body
The offset shape encodes `ctx.offset`; the token shape encodes `ctx.pageToken`. The adapter only decides whether to keep paging from the returned row count and the token,
**and cannot check whether the request carried the position**. Missing it means the remote returns the first page every time, paging never advances,
until `maxPages` caps out and throws — and the error message points at the page cap, not the missing parameter.
:::

When paging is unsafe, throw **`HttpPaginationError` instead of returning half a result**; `reason` distinguishes four causes:
`shape_switch` / `page_token_not_advancing` / `empty_page_limit` / `max_pages`.
Returning partial metadata would make the absent ids count as "deleted on the remote", erasing living rows from the local cache.

### `findByIds` chunking

`findByIds` splits the id list into chunks of `idChunkSize` (default 100) and sends them **serially**, merging into one result in chunk order:

- **A chunk rejecting rejects the whole `findByIds`**, throwing that chunk's error. A failed chunk **must not** be treated as an empty chunk and merged onward — the missing chunk's ids would be judged "deleted on the remote" in the next comparison round.
- **A chunk returning fewer rows than its id count is legal** (the remote really deleted those rows): no retry, no empty-object padding. It is a different thing from "this chunk's request failed"; keeping the two apart is the point of the chunking loop.
- After all chunks merge, **emit exactly once and then `complete`** — emitting per chunk would leave the caller's `forkJoin` with only the last chunk, and the full rows pulled by the earlier chunks would be lost on the spot (and those rows are exactly the data meant for the local cache).
- A non-array response body throws `HttpHandlerContractError` (`findByIds`'s `parse` must produce an array of rows).

## Configuration

```typescript
new RxDBAdapterHttp(db, {
  baseUrl: 'https://api.example.com',
  handlers,
  auth: () => ({ Authorization: `Bearer ${getToken()}` }),
  headers: { 'X-App': 'catalog' },
  pageSize: 1000,
  idChunkSize: 100,
  maxEmptyPages: 3,
  maxPages: 1000,
  requestTimeoutMs: 30000,
  conditionalRequests: false,
  conditionalCacheSize: 256
});
```

| field                  | default | meaning                                                                                          |
| :--------------------- | :------ | :----------------------------------------------------------------------------------------------- |
| `pageSize`             | `1000`  | rows per page, passed through as the handler's `ctx.limit`                                       |
| `idChunkSize`          | `100`   | ids per `findByIds` chunk                                                                        |
| `maxEmptyPages`        | `3`     | consecutive empty pages tolerated in the token shape; the N+1th throws; `0` = tolerate none      |
| `maxPages`             | `1000`  | total page cap per `fetchMetadata`; hitting it **throws**                                        |
| `requestTimeoutMs`     | `30000` | timeout bound of a **single** request                                                            |
| `conditionalCacheSize` | `256`   | entry cap of the conditional-request response cache; only effective when the feature below is on |

All six numeric values must be finite positive integers (`maxEmptyPages` may be `0`), otherwise **construction** throws `HttpConfigError` naming the field and the actual value.

`auth` is called **before every request goes out**; when its returned headers conflict with `headers`, `auth` wins;
when `auth` throws, the request is not sent.

## Conditional requests: stop re-sending unchanged pages

Off by default. When enabled, `fetchMetadata` / `findByIds` remember the last `200`'s `ETag` and parsed result,
and the next identical request asks with `If-None-Match`; a remote `304` reuses that result directly.

```typescript
new RxDBAdapterHttp(db, { baseUrl, handlers, conditionalRequests: true });
```

**Why it is explicitly opt-in.** It only pays off when the remote really sends `ETag` and honors `If-None-Match`, and the adapter has no way to probe that.
With the feature off, behavior is **verbatim identical** to versions without it: no conditional headers, no deduplication of concurrency, `304` treated as an error response as before.

**A 304 returns the previous result, not an empty set.** This is a hard constraint: QueryCache decides which rows are orphans from `fetchMetadata`'s id set,
and treating a 304 as "zero rows" would delete living remote rows as orphans. The cache therefore cannot be stale by definition — the remote never returns 304 once it considers the content changed.

**What is cached is responses, not rows.** Row caching belongs to core and lands through the local adapter; this package is structurally isolated from it. This response cache:

- is keyed by request fingerprint (method + url + body); each page of pagination / chunk of chunking takes its own entry
- is bounded, LRU with `conditionalCacheSize` entries; sizing it too small only lowers the hit rate, never producing wrong results
- lives with the adapter instance and is cleared on `disconnect()`
- deduplicates concurrent calls with the same fingerprint via **single-flight**, so there is no hole where "the later one gets a 304 before the earlier one has backfilled". Deduplication only merges simultaneous reads: reads initiated after a `create` / `update` / `delete` request settles (success or failure) or after a change notification reports invalidation are never merged into earlier in-flight requests — the remote is asked again
- gives every caller an **independent copy**: mutating the returned value in place neither pollutes the cache nor leaks into later 304 hits or other callers in the same single-flight batch. Whether objects are shared is the same answer with or without the feature

:::warning Switch users via `disconnect()` / `connect()`
The auth header is **not** part of the request fingerprint — otherwise every token rotation would invalidate the whole cache, i.e. the feature would do nothing.
The cost: swapping tokens on the same adapter instance may read a previous identity's responses. Rebuild the connection when switching users.
:::

## Change notifications: let remote changes come to you

Off by default. When enabled, the adapter keeps an [SSE](/adapters/http-protocol.md#change-notifications-optional) long connection open; when the remote pushes an
**entity name**, the adapter calls core's invalidation report, making the queries hung on that entity re-fetch per their own strategies.

```typescript
new RxDBAdapterHttp(db, {
  baseUrl,
  handlers,
  changeFeed: {
    url: 'changes', // relative to baseUrl, or an absolute URL
    withCredentials: true, // carry cookies cross-origin (EventSource cannot carry an auth header)
    reconnectBaseDelayMs: 1000,
    reconnectMaxDelayMs: 30000,
    onOpen: report => console.info('[change feed] open', report.url),
    onUnavailable: report => console.warn('[change feed]', report.reason, report.message),
    onNotification: report => console.debug('[change feed]', report.entity, report.suppressed)
  }
});
```

| field                  | default | meaning                                                                                                                                                   |
| :--------------------- | :------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `url`                  | —       | notification endpoint, relative to `baseUrl` or an absolute URL; **required**                                                                             |
| `withCredentials`      | `false` | passed through to `EventSource`, carries cookies cross-origin                                                                                             |
| `reconnectBaseDelayMs` | `1000`  | starting delay of the exponential backoff                                                                                                                 |
| `reconnectMaxDelayMs`  | `30000` | backoff cap, must be `>=` the starting value                                                                                                              |
| `onOpen`               | (none)  | fires once per successful connect (every reconnect included) with `{ url }`, after that round of full invalidation; synchronous calls, exceptions dropped |
| `onUnavailable`        | (none)  | diagnostic callback when the channel is unavailable, see below                                                                                            |
| `onNotification`       | (none)  | fires once per **readable** notification received, see below                                                                                              |

**Leaving the whole `changeFeed` out equals off** — no connection, no behavioral difference at all. The parameters nest inside `changeFeed`
rather than lying flat so that a dead configuration like "configured `onUnavailable` but never enabled the channel" is illegal at the type level.

**`url` must already compose into a resolvable address at construction**, otherwise `HttpConfigError` is thrown on the spot — empty strings and
half-absolute addresses like a bare `https://` both count. Why not wait until connect to report it: the URL is a constant over the channel's life, and handing it to
backoff retry would only produce a connection that errors every 30 seconds and never recovers. Only connection faults that can actually improve go through reconnect.

**Notifications carry an entity name only, no row data.** The broadcast targets all subscribers; pushing row data on a multi-tenant backend is privilege leakage.
And "does this row belong to my current `where`" is only answerable by the server. On notification the adapter does exactly one thing: tell core
"this entity is dirty". Re-fetching still goes through the original path with auth and filter conditions.

**Connecting means full invalidation.** On every successful connection — first connection and every reconnect **treated the same** — the adapter reports one
invalidation per subscribed entity. This is not conservatism; it is necessary: nobody replays the changes that happened while disconnected, and at the moment
you connect you know nothing about that window. The cost is one round of re-fetches per reconnect.

**Your own changes do not come back around.** When an event carries `clientId` equal to this machine's `rxdb.context.clientId`, it is dropped outright.
Neither side having a `clientId` does **not** count as self-echo — that is "the server did not report", not "it was me". To make it work, inject
`rxdb.context.clientId` into write requests through `auth`, and have the backend echo it into the broadcast.

**Only `onNotification` can count "how many were suppressed".** Suppression happens inside the package: dropped notifications never report
invalidation to core, and from the outside event stream it looks identical to "never received". Working backwards from "broadcasts from the backend − invalidations
in core" would count the ones never received during a disconnection as suppressed too — presenting a real fault as a normal suppression, which is exactly what
you were investigating. This callback fires **before the drop**, and `suppressed` marks whether this one will reach invalidation:

```typescript
interface HttpChangeFeedNotificationReport {
  url: string; // channel URL
  entity: string; // entity name from the notification
  namespace: string; // resolved namespace
  clientId?: string; // originator echoed by the server; absent means the server did not report one
  suppressed: boolean; // true = judged as self-echo, this one will not trigger invalidation
}
```

The field set is exactly these five — **structurally it cannot carry row data**, so this outlet is not a back door around "notifications carry entity names only".
Unreadable events do not come here (they go to `onUnavailable`'s `malformed-message`); the full invalidation round after a successful connection does not come here
either, since it is not a received notification. Callback exceptions are swallowed: a broken diagnostic outlet must not take the invalidation report down with it.

:::warning `EventSource` cannot carry custom headers
The `auth` hook **does not apply** to this connection (it applies as usual to normal requests). Cross-origin authentication can only go through cookies
(`withCredentials: true`) or by putting a ticket in `url`.
:::

**The channel's liveness does not affect queries.** Connect fails, connects and drops, payload unreadable — `fetchMetadata` / `findByIds` all work verbatim
as before: this connection **throws nothing**, produces no `NetworkOfflineError`, and does **not** participate in `offlineFallback` decisions
— that degradation watches **query request** failures, and a broken notification connection may simply mean the backend never implemented the endpoint. The only
outlet is `onUnavailable`:

| `reason`              | triggered by                                      | afterwards                                                                                                                                                                                                               |
| :-------------------- | :------------------------------------------------ | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `unsupported-runtime` | runtime has no global `EventSource` (e.g. Node)   | **no retry** — retrying any number of times cannot conjure a constructor                                                                                                                                                 |
| `connection-error`    | connection failed / dropped                       | when `retryInMs` has a value, back off and reconnect by it; `undefined` means `readyState === 0` — the browser's own reconnect is on its way, and opening another now means two connections receiving the same broadcast |
| `malformed-message`   | event body is not valid JSON, or `entity` missing | connection stays, only this one is dropped                                                                                                                                                                               |

Callbacks report **facts**, not conclusions: `EventSource` exposes no status code, so "endpoint not implemented" / "auth failed" / "really offline"
coincide completely on the client side; guessing one would send people to fix an already-correct server in the half of cases you guess wrong.

### Runtime start and stop

Configuring `changeFeed` enables it by default; no extra start call is needed. To switch it at runtime (e.g. give users a "realtime sync" checkbox):

```typescript
const adapter = await rxdb.getAdapter('http');

adapter.stopChangeFeed(); // close the connection and cancel the pending backoff reconnect
adapter.startChangeFeed(); // reconnect; connecting triggers a round of full invalidation
adapter.changeFeedEnabled; // boolean
```

**`changeFeedEnabled` is the intent of "should it run", not "is it connected right now".** The cable is unplugged and it stays `true`;
reconnects are retried with backoff by the adapter itself. For the connection's actual liveness, use `onOpen` (reports connect) and `onUnavailable` (reports faults; except `malformed-message`, where the connection is still up).

**Without `changeFeed` configured, both methods throw `HttpUnsupportedOperationError`** rather than silently doing nothing —
the same stance as `version()` without `onVersion`. Calling them when there is no channel to switch is a missing configuration, not a no-op.

**`disconnect()` does not change this bit.** Disconnecting is a lifecycle event, not the caller changing its mind, so a later `connect()`
restores your last choice: a channel manually `stopChangeFeed()`ed is not quietly resurrected by a reconnect.
Calling `startChangeFeed()` on a `disconnect()`ed adapter throws `HttpDisconnectedError` (leaving a live SSE on a disconnected adapter is a real bug);
`stopChangeFeed()` does not check connection state — both paths end the same way, and idempotent stopping is not a fallback.

## Errors and offline fallback

The discriminator is the **class name** (`instanceof`); `code` only assists.

| situation                               | throws                                      | `isNetworkError` | `offlineFallback`           |
| :-------------------------------------- | :------------------------------------------ | :--------------- | :-------------------------- |
| non-2xx response (401/409/…)            | `HttpResponseError` (with numeric `status`) | `false`          | no fallback, rethrown as-is |
| 2xx but non-JSON body                   | `HttpInvalidResponseError`                  | `false`          | no fallback                 |
| cannot reach the remote (fetch rejects) | core's `NetworkOfflineError`                | `true`           | fallback when cached        |
| single-request timeout                  | core's `NetworkOfflineError`                | `true`           | fallback when cached        |
| cancelled by `disconnect()`             | `HttpDisconnectedError`                     | `false`          | **no fallback**             |

Transport failures are deliberately **not** wrapped in this package's error classes: the first criterion of `isNetworkError` is `instanceof NetworkOfflineError`,
and wrapping would silently disable fallback. Conversely, business errors must carry a numeric `status`, otherwise a 401 would be swallowed by `offlineFallback` as a cache hit.

## Lifecycle

| member              | behavior                                                                                                                                                                                                                                      |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `connect()`         | **sends no probe request**; scans registered entities and fails fast on bigint / binary fields; only creates the long connection when `changeFeed` is configured and not switched off by `stopChangeFeed()`, and only after validation passes |
| `disconnect()`      | cancels in-flight requests (through the error channel), closes the notification connection, and stops reconnects (**does not** change `changeFeedEnabled`); **already-sent write requests are not rolled back** — HTTP has no transactions    |
| `version()`         | returns the **remote server's** version; needs `onVersion`; throws when not configured, never falling back to this package's version number                                                                                                   |
| `isTableExisted(E)` | `2xx` → `true`, `404` → `false`, other status codes and transport failures → throw                                                                                                                                                            |

### Unsupported field types

Entities declaring `PropertyType.bigint` or `PropertyType.binary` make `connect()` throw
`HttpUnsupportedWireTypeError` on the spot. This package defines no wire codec for the two types — `JSON.stringify` would
lose `7n` and collapse `Uint8Array` into `{"0":1,…}`. bigint / binary entities using only local adapters can coexist with entities synced through this package.

### Operations unsupported in v1

`getRepository` / `saveMany` / `removeMany` / `mutations` all throw `HttpUnsupportedOperationError`.
This does not affect QueryCache batch writes — `EntityManager` routes QueryCache batches through remote-then-local
without touching these members. `SyncType.Full` entities in the same database also keep using their own local adapters.

The four branch-sync members — `pullChangesBatch` / `pushBranches` / `branchExists` / `pullBranches` — **do not even implement a throwing method**
(the properties are absent): their call sites feature-detect, and absence falls back to members that throw just the same. Writing a version that returns `[]` / `false` would make Full-sync and branch sync believe the remote is genuinely empty.

## Further reading

- [Sync strategy · QueryCache quick start](/collaboration/sync.md#querycache-quick-start) — `localCacheFirst`, `offlineFallback`, `syncStaleTime`
- [Adapter overview](/adapters/README.md)
