# rxdb-adapter-http

RxDB HTTP adapter — lets **your own REST API** serve as the remote source of truth for the QueryCache.

Used as a **remote** adapter for RxDB: the local SQLite only serves as a row cache, and both reads and writes defer to the remote.
Fits scenarios where you already have a backend API and don't want to expose your database structure to clients.

> ⚠️ **v1 only supports `SyncType.QueryCache`.** `pullChanges` / `mergeChanges` / `getChangeCount`
> always throw `HttpChangelogUnsupportedError` — they **never** return an empty array or `0` to pretend "no remote changes".
> For entities that need offline writes, undo/redo and conflict resolution, use a local adapter + Supabase instead.

## Features

- ✅ **Transport lives in the package** — `fetch`, auth injection, status-code extraction and error classification are all done by the adapter; handlers only do protocol mapping and never touch the network
- ✅ **Pagination** — both offset (short-page termination) and token (`nextPageToken` termination) shapes; the four degradations — shape switch mid-query / token not advancing / consecutive empty pages / hitting the page cap — each fail fast
- ✅ **Chunked `findByIds`** — split by `idChunkSize` and merged; one failed chunk fails the whole call, never silently swallowed as an empty chunk
- ✅ **Single-emission contract** — `fetchMetadata` / `findByIds` both "assemble everything, emit once" and then `complete`; per-page / per-chunk emission would leave core's `forkJoin` with only the last piece
- ✅ **REST template factory** — `createRestHandlers()` replaces boilerplate handlers with one line; all template validation happens **at construction time**
- ✅ **Error classification anchored to core** — transport failures and timeouts throw core's `NetworkOfflineError` (`offlineFallback` can degrade), HTTP response errors carry a numeric `status` (no degradation)
- ✅ **Per-request timeout** — 30s by default; on timeout throws `NetworkOfflineError` rather than a bare `AbortError`
- ✅ **Structural isolation** — never `new`s any local storage, never implements `upsertMany` / `deleteByIds` / `rawQuery`

## When to use

- You already have a REST / JSON API and want it wired into RxDB's reactive queries
- The remote is authoritative and clients only need a structured row cache
- You don't want to expose SQL or your database structure to clients (request bodies are JSON `RuleGroup`, not SQL)

Not suitable: offline writes, Full / Filter bidirectional sync, branch and working-tree semantics — use the Supabase adapter for those.

## Installation

```bash
pnpm add @aiao/rxdb @aiao/rxdb-adapter-http
# Local adapter for the row cache (pick one of the two as needed)
pnpm add @aiao/rxdb-adapter-wa-sqlite
# The full QueryCache read/write path spans three plugin packages — miss one and connect() throws
pnpm add @aiao/rxdb-plugin-history @aiao/rxdb-plugin-sync @aiao/rxdb-plugin-querycache
```

> peerDependencies: `@aiao/rxdb`, `rxjs` ^7.8. No runtime dependencies; requests go through the global `fetch`.

## Exports

- `RxDBAdapterHttp` — the remote adapter main class
- `ADAPTER_NAME` — constant `'http'`
- `createRestHandlers` — REST resource URL template factory, produces plain `HttpHandlers`
- `HttpAdapterOptions` / `HttpHandlers` / `HttpRequestSpec` / `HttpNumericConfig` / `HttpAuthHook` and other config and handler types
- `RestHandlersOptions` / `RestOperation` / `RestOperationTemplate` / `RestPlaceholder` — template factory types
- Change push types: `HttpChangeFeedOptions`, `HttpChangeFeedUnavailableReport` / `HttpChangeFeedUnavailableHook`,
  `HttpChangeFeedNotificationReport` / `HttpChangeFeedNotificationHook`
- Diagnostics types: `HttpEtagUnreadableReport` / `HttpEtagUnreadableHook`, `HttpResponseType`
- `DEFAULT_HTTP_CONFIG` — defaults for the six numeric options
- Error types: `HttpAdapterError` (base class), `HttpConfigError`, `HttpResponseError`, `HttpInvalidResponseError`,
  `HttpRequestBuildError`, `HttpPaginationError`, `HttpInvalidMetadataError`, `HttpHandlerContractError`,
  `HttpDisconnectedError`, `HttpChangelogUnsupportedError`, `HttpUnsupportedWireTypeError`,
  `HttpUnsupportedOperationError`
- Discriminant strings for error causes: `HttpRequestBuildFailure` (`HttpRequestBuildError.reason`),
  `HttpPaginationFailure` (`HttpPaginationError.reason`)

> ⚠️ There are no functions like `createRxDatabase()` / `createHttpAdapter()`; see `rxdb.adapter()` below for registration.

## Quick start

### 1. Two slots, each filled by the right party

QueryCache needs two adapters; this package only occupies the **remote** one:

| Slot     | Who does it                            | Responsibility                                                      |
| :------- | :------------------------------------- | :------------------------------------------------------------------ |
| `remote` | `@aiao/rxdb-adapter-http`              | `fetchMetadata` / `findByIds` + optional `create`/`update`/`delete` |
| `local`  | any SQLite adapter (**you register**)  | Row cache: `getMetadataByIds` / `upsertMany` / `deleteByIds`        |

The read engine itself is a third thing, which you also install — and it's more than one package: the read path for `SyncType.QueryCache` lives in
`@aiao/rxdb-plugin-querycache`, the offline-write outbox lives in `@aiao/rxdb-plugin-sync`, which in turn
`inject: ['plugin:history']` — if any of the three packages is missing, `connect()` rejects with `RxDBMissingPluginError`
instead of silently degrading to local queries. See the table in
[History and sync split](/migration/history-sync-plugins.md).

This package **neither holds nor creates** any local storage — no `new` SQLite, no OPFS / IndexedDB.
Plugins with `inject: ['adapter:local']` (search, graph queries, etc.) therefore bind to the SQLite you registered, never to this package.

```typescript
import { RxDB, SyncType } from '@aiao/rxdb';
import { createRestHandlers, RxDBAdapterHttp } from '@aiao/rxdb-adapter-http';
import { RxDBAdapterWaSqlite } from '@aiao/rxdb-adapter-wa-sqlite';
import { rxDBPluginHistory } from '@aiao/rxdb-plugin-history';
import { rxDBPluginQueryCache } from '@aiao/rxdb-plugin-querycache';
import { rxDBPluginSync } from '@aiao/rxdb-plugin-sync';

const rxdb = new RxDB({
  dbName: 'catalog',
  entities: [Product],
  sync: {
    type: SyncType.QueryCache,
    local: { adapter: 'wa-sqlite' },
    remote: `{ adapter: 'http' }`
  }
});

// Pass the plugin factory functions themselves, don't call them. Registration order is free; ordering is guaranteed by `inject`
rxdb.use(rxDBPluginHistory);
rxdb.use(rxDBPluginSync);
rxdb.use(rxDBPluginQueryCache);

rxdb.adapter('wa-sqlite', db => new RxDBAdapterWaSqlite(db));
rxdb.adapter(
  'http',
  db =>
    new RxDBAdapterHttp(db, {
      baseUrl: 'https://api.example.com/v1',
      handlers: createRestHandlers({ resources: { Product: 'products' } }),
      auth: () => ({ Authorization: `Bearer ${getToken()}` })
    })
);
```

### 2A. REST templates (recommended starting point)

`createRestHandlers()` folds the "resource path + fixed body shape" boilerplate into a single factory,
and what comes out is still plain `HttpHandlers` — **the adapter hasn't changed a line**; pagination, chunking, the emission contract and error classification all work exactly as before.

Default templates:

| Operation        | Method  | Path               | Default output          |
| :--------------- | :------ | :----------------- | :---------------------- |
| `fetchMetadata`  | `POST`  | `:entity/metadata` | yes (cannot be disabled) |
| `findByIds`      | `POST`  | `:entity/by-ids`   | yes (cannot be disabled) |
| `create`         | `POST`  | `:entity`          | yes                     |
| `update`         | `PATCH` | `:entity/:id`      | yes                     |
| `delete`         | `POST`  | `:entity/delete`   | yes                     |
| `version`        | `GET`   | —                  | no                      |
| `isTableExisted` | `HEAD`  | `:entity`          | no                      |

```typescript
createRestHandlers({
  resources: { Product: 'products' }, // entities not listed here use their entity name as the path segment
  templates: {
    version: { path: 'meta/version' }, // override: pass an object
    delete: null // disable: a read-only backend makes repo.delete() fail fast
  }
});
```

Template validation happens **at construction time**: empty path / path containing whitespace, `?`, `#` / illegal method / placeholder-set mismatch / disabling a required handler,
all throw `HttpConfigError` on the spot. Placeholders must **match exactly** — an `update` missing `:id` would `PATCH` the whole collection,
and any template missing `:entity` would make every entity share one URL; both degradations can look like a 2xx on the wire, and inspecting the response code after the request goes out won't reveal them.

> `delete` defaults to `POST :entity/delete` rather than `DELETE :entity` + body: many proxies,
> gateways and server frameworks simply drop the body of a DELETE request, so a "delete these 3 rows" request would reach the server disguised as "delete the whole collection".
> If you need a real `DELETE`, override it explicitly.

### 2B. Handwritten handlers

Write them by hand when the backend shape is irregular. A handler only does protocol mapping: it produces the request description and parses the response body, **never touching the network**.

```typescript
import type { HttpHandlers } from '@aiao/rxdb-adapter-http';

const handlers: HttpHandlers = {
  onFetchMetadata: {
    request: ctx => ({
      url: `${ctx.entityName}/metadata`,
      method: 'POST',
      body: `{ where: ctx.where, offset: ctx.offset, limit: ctx.limit }`
    }),
    parse: body => body as { id: string; updatedAt: string }[]
  },
  onFindByIds: {
    request: ctx => ({ url: `${ctx.entityName}/rows`, method: 'POST', body: { ids: ctx.ids } }),
    parse: body => body as unknown[]
  }
};
```

`where` is handed to you as-is in the shape of a JSON **`RuleGroup`** — this package generates no SQL; how the server translates it is up to you.
If `onCreate` / `onUpdate` / `onDelete` are not configured, the corresponding methods **don't exist** on the adapter, and `repo.create(...)` fails fast on the spot.

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

| Field                  | Default | Meaning                                                                 |
| :--------------------- | :------ | :---------------------------------------------------------------------- |
| `pageSize`             | `1000`  | rows per page, passed through as the handler's `ctx.limit`              |
| `idChunkSize`          | `100`   | ids per `findByIds` chunk                                               |
| `maxEmptyPages`        | `3`     | tolerance for consecutive empty pages in token mode; `0` = no tolerance |
| `maxPages`             | `1000`  | total page cap per `fetchMetadata`; hitting the cap **throws**          |
| `requestTimeoutMs`     | `30000` | timeout cap for a **single** request                                    |
| `conditionalCacheSize` | `256`   | entry cap for the conditional-request response cache; only in effect when the switch below is on |

All six numeric values must be finite positive integers (`maxEmptyPages` may be `0`); otherwise **construction time** throws `HttpConfigError` carrying the field name and the actual value.

`changeFeed` (SSE change notifications) doesn't exist by default and turns on when configured; it is an **experimental** capability, outside the 1.0 compatibility promise, and the protocol currently has only one implementation — the reference backend.
Connection liveness is reported as facts through three diagnostic callbacks: `onOpen` (every time the channel connects, including every reconnect, reported after that connection's full invalidation),
`onUnavailable` (can't connect, dropped, or a message can't be parsed), `onNotification` (a parseable notification was received); all three are called synchronously,
and errors thrown by callbacks are always discarded and never affect the channel. `changeFeedEnabled` is only the on/off intent — it stays `true` when the network is down. For "is it connected right now",
look at whichever of `onOpen` and `onUnavailable` arrived last (except for `malformed-message`, where the connection is still alive).

```typescript
new RxDBAdapterHttp(db, {
  baseUrl,
  handlers,
  changeFeed: {
    url: 'changes',
    onOpen: () => showFeedStatus('connected'),
    onUnavailable: report => {
      // unparseable is just that one message; the connection is still alive
      if (report.reason !== 'malformed-message') showFeedStatus('reconnecting', report.message);
    }
  }
});
```

`auth` is called before every request goes out, and wins over `headers` on conflict; if `auth` throws, the request is not sent.

### Conditional requests (`conditionalRequests`, off by default)

When enabled, `fetchMetadata` / `findByIds` send `If-None-Match` to reuse the last `200` parsed result, and on a `304` hit they **return that result** —
not an empty set (treating 304 as an empty set is exactly the phantom-orphan problem this package exists to prevent). Concurrent calls with the same request fingerprint are **single-flight** deduplicated,
so there is no window where "the later one got a 304 while the earlier one hasn't backfilled yet". Deduplication only merges reads at the same moment: reads issued after a `create` / `update` / `delete`
request settles (success or failure alike) or after a change-notification invalidation is reported, never merge with earlier in-flight requests and always ask the remote again.

```typescript
new RxDBAdapterHttp(db, { baseUrl, handlers, conditionalRequests: true });
```

Four key points:

- **Must be explicitly enabled.** It only pays off when the remote actually sends `ETag` and honors `If-None-Match`, which the adapter has no way to probe.
  When off, behavior is **character-for-character identical** to a version without this feature: no conditional headers, no deduplication, 304 still treated as an error.
- **What's cached is the response, not the rows.** The row cache belongs to core via the local adapter; this package doesn't touch it. The response cache lives per adapter instance,
  is bounded by `conditionalCacheSize` (LRU), and is cleared on `disconnect()`. Pagination / chunks are keyed per **page / per chunk**.
- **Of the three header groups, only the handler group enters the request fingerprint.** `HttpRequestSpec.headers` (what the handler supplies per request) **does** enter —
  splitting projections by tenant / language on the same URL is safe, and the two projections each get their own entry. The adapter-level `headers` (constant per instance)
  and what the auth hook produces **do not**: the former would just prefix every key with the same segment, the latter would invalidate everything on every token rotation.
- **Switching users must go through `disconnect()` / `connect()`.** That's the price of auth headers not entering the fingerprint: swapping the token directly on the same instance
  will read responses from the previous identity.

## Errors and offline degradation

The discriminant is the **class name** (`instanceof`); `code` is only auxiliary.

| Situation                                | Thrown                                      | `isNetworkError` | `offlineFallback`              |
| :--------------------------------------- | :------------------------------------------ | :--------------- | :----------------------------- |
| Non-2xx response (401/409/…)              | `HttpResponseError` (with numeric `status`) | `false`          | no degradation, rethrown as-is |
| 2xx but the body is not JSON              | `HttpInvalidResponseError`                  | `false`          | no degradation                 |
| Request failed to build before being sent | `HttpRequestBuildError` (with `reason`)     | `false`          | **no degradation**             |
| Can't reach the remote (fetch rejects)    | core's `NetworkOfflineError`                | `true`           | degrades when a cache exists   |
| Single request timeout                    | core's `NetworkOfflineError`                | `true`           | degrades when a cache exists   |
| `disconnect()` cancels on purpose         | `HttpDisconnectedError`                     | `false`          | **no degradation**             |

Transport failures are deliberately **not** wrapped in this package's error classes: the first criterion of `isNetworkError` is `instanceof NetworkOfflineError`,
and wrapping would silently disable degradation.

Conversely, `HttpRequestBuildError` exists precisely to **not** be wrapped as a transport failure: a body containing a bigint, an illegal header,
a `GET` with a body, a URL that can't be assembled, a primary key that isn't a non-empty string — among these five local problems, the errors thrown by `JSON.stringify` and `fetch`
are bare `TypeError`s, **exactly the same type** as a genuine failure to reach the remote. Without separating them out, one dirty record would be silently swapped for a stale cache by `offlineFallback`,
and never reported again. `reason` takes `'body'` / `'headers'` / `'method'` / `'url'` / `'id'`.

## Limitations

- **bigint / binary fields**: `connect()` throws `HttpUnsupportedWireTypeError` on the spot — this package defines no wire codec for these two types
- **`getRepository` / `saveMany` / `removeMany` / `mutations`**: always throw `HttpUnsupportedOperationError`;
  QueryCache bulk writes don't go through them (they take core's remote-then-local)
- **`rawQuery`, branch members (`pushBranches` / `branchExists` / `pullBranches`)**: not implemented
- **`updatedAt`** must be an ISO 8601 string with a timezone designator; ones with an offset or missing milliseconds are canonicalized to UTC + 3-digit milliseconds, and timezone-less or invalid strings throw `HttpInvalidMetadataError`.
  metadata, `findByIds` rows and `create` / `update` receipts go through the same gate (the latter two land whole rows in the local cache); rows and receipts without `updatedAt` are not checked

## Docs

- [HTTP adapter full documentation](https://rxdb.aiao.io/docs/adapters/http)
- [Adapters overview](https://rxdb.aiao.io/docs/adapters)

## License

MIT

## Classes

| Class | Description |
| ------ | ------ |
| [HttpAdapterError](classes/HttpAdapterError.md) | Base class for HTTP adapter errors. |
| [HttpChangelogUnsupportedError](classes/HttpChangelogUnsupportedError.md) | v1 does not support changelog / branch sync (US-212 AC#10, #26). |
| [HttpConfigError](classes/HttpConfigError.md) | Configuration validation failed at construction time (US-212 AC#31). |
| [HttpDisconnectedError](classes/HttpDisconnectedError.md) | Adapter disconnected: request canceled by `disconnect()`, or a duck called after disconnect (US-212 AC#24, #34). |
| [HttpHandlerContractError](classes/HttpHandlerContractError.md) | A handler's `parse` returned a shape that violates the contract. |
| [HttpInvalidMetadataError](classes/HttpInvalidMetadataError.md) | The remote returned metadata that violates the contract (US-212 AC#14). |
| [HttpInvalidResponseError](classes/HttpInvalidResponseError.md) | Response status is 2xx but the body is not valid JSON (US-212 AC#12). |
| [HttpPaginationError](classes/HttpPaginationError.md) | A degraded handler / remote was detected during pagination (US-212 AC#7). |
| [HttpRequestBuildError](classes/HttpRequestBuildError.md) | The request failed to build **before being sent** (US-212 AC#12 / #34). |
| [HttpResponseError](classes/HttpResponseError.md) | The remote returned a non-2xx response (US-212 AC#12). |
| [HttpUnsupportedOperationError](classes/HttpUnsupportedOperationError.md) | This adapter does not support the operation (US-212 AC#24, AC#32). |
| [HttpUnsupportedWireTypeError](classes/HttpUnsupportedWireTypeError.md) | The entity declares a field type for which this story defines no wire codec (US-212 AC#15). |
| [RxDBAdapterHttp](classes/RxDBAdapterHttp.md) | QueryCache remote adapter backed by the user's own REST API. |

## Interfaces

| Interface | Description |
| ------ | ------ |
| [CreateContext](interfaces/CreateContext.md) | Context for the `create` write entry point. |
| [CreateHandler](interfaces/CreateHandler.md) | Protocol mapping for `create`. |
| [DeleteContext](interfaces/DeleteContext.md) | Context for the `delete` write entry point. |
| [DeleteHandler](interfaces/DeleteHandler.md) | Protocol mapping for `delete`. |
| [FetchMetadataContext](interfaces/FetchMetadataContext.md) | Context for a single-page `fetchMetadata` request. |
| [FetchMetadataHandler](interfaces/FetchMetadataHandler.md) | Protocol mapping for `fetchMetadata`. |
| [FindByIdsContext](interfaces/FindByIdsContext.md) | Context for a single-chunk `findByIds` request. |
| [FindByIdsHandler](interfaces/FindByIdsHandler.md) | Protocol mapping for `findByIds`. |
| [HttpAdapterOptions](interfaces/HttpAdapterOptions.md) | Configuration for `new RxDBAdapterHttp(rxdb, options)`. |
| [HttpChangeFeedNotificationReport](interfaces/HttpChangeFeedNotificationReport.md) | The fact when a **parseable** change notification is received (US-023 AC#24). |
| [HttpChangeFeedOpenReport](interfaces/HttpChangeFeedOpenReport.md) | The fact at the moment the change-notification channel **connects**. |
| [HttpChangeFeedOptions](interfaces/HttpChangeFeedOptions.md) | Configuration for the change-notification channel (SSE) (US-023 D5). |
| [HttpChangeFeedUnavailableReport](interfaces/HttpChangeFeedUnavailableReport.md) | The **fact** at the moment the change-notification channel becomes unavailable (US-023 AC#17). |
| [HttpEtagUnreadableReport](interfaces/HttpEtagUnreadableReport.md) | The **fact** at the moment "conditional requests are on, yet no `ETag` can be read" (US-215). |
| [HttpHandlers](interfaces/HttpHandlers.md) | The handler set for phase A. |
| [HttpNumericConfig](interfaces/HttpNumericConfig.md) | The six numeric options — all overridable, all defaulted. |
| [HttpRequestSpec](interfaces/HttpRequestSpec.md) | The request description a handler produces and **the adapter executes**. |
| [IsTableExistedHandler](interfaces/IsTableExistedHandler.md) | Protocol mapping for `isTableExisted()`. |
| [RestHandlersOptions](interfaces/RestHandlersOptions.md) | Configuration for [createRestHandlers](functions/createRestHandlers.md). |
| [RestOperationTemplate](interfaces/RestOperationTemplate.md) | Path template and method override for a single operation. |
| [UpdateContext](interfaces/UpdateContext.md) | Context for the `update` write entry point. `data` is the partial fields given by the caller, for the same reason as [CreateContext](interfaces/CreateContext.md). |
| [UpdateHandler](interfaces/UpdateHandler.md) | Protocol mapping for `update`. |
| [VersionHandler](interfaces/VersionHandler.md) | Protocol mapping for `version()`. |

## Type Aliases

| Type Alias | Description |
| ------ | ------ |
| [FetchMetadataResult](type-aliases/FetchMetadataResult.md) | Single-page parse result, returned as a **discriminated** union of two shapes. |
| [HttpAuthHook](type-aliases/HttpAuthHook.md) | auth hook: injects token / headers. |
| [HttpChangeFeedNotificationHook](type-aliases/HttpChangeFeedNotificationHook.md) | Diagnostic callback: invoked when a parseable change notification is received (whether or not suppressed). |
| [HttpChangeFeedOpenHook](type-aliases/HttpChangeFeedOpenHook.md) | Diagnostic callback: invoked when the change-notification channel connects. |
| [HttpChangeFeedUnavailableHook](type-aliases/HttpChangeFeedUnavailableHook.md) | Diagnostic callback: invoked when the change-notification channel becomes unavailable. |
| [HttpEtagUnreadableHook](type-aliases/HttpEtagUnreadableHook.md) | Diagnostic callback: invoked when conditional requests are on but no `ETag` can be read. |
| [HttpMethod](type-aliases/HttpMethod.md) | The HTTP methods a handler may produce. |
| [HttpPaginationFailure](type-aliases/HttpPaginationFailure.md) | The four causes of pagination fail-fast (US-212 AC#7). |
| [HttpRequestBuildFailure](type-aliases/HttpRequestBuildFailure.md) | The four causes of a request failing to build before being sent |
| [HttpResponseType](type-aliases/HttpResponseType.md) | The set of values of `Response.type`. |
| [RestOperation](type-aliases/RestOperation.md) | The operations expressible as templates, one-to-one with the seven fields of [HttpHandlers](interfaces/HttpHandlers.md). |
| [RestPlaceholder](type-aliases/RestPlaceholder.md) | The placeholders supported by templates — **only these two**. |

## Variables

| Variable | Description |
| ------ | ------ |
| [ADAPTER\_NAME](variables/ADAPTER_NAME.md) | Adapter registration name |
| [DEFAULT\_HTTP\_CONFIG](variables/DEFAULT_HTTP_CONFIG.md) | Defaults for the six numeric options. |

## Functions

| Function | Description |
| ------ | ------ |
| [createRestHandlers](functions/createRestHandlers.md) | Produces a full set of [HttpHandlers](interfaces/HttpHandlers.md) from REST resource URL templates (US-212 AC#27). |
