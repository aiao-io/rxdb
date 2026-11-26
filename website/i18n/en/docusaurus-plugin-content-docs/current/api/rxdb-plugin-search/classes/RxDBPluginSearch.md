# RxDBPluginSearch

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:181](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L181)

The main class of `@aiao/rxdb-plugin-search`.

Responsibilities:

- Validates the adapter at the `createRxDatabase` stage (fail-fast)
- Installs FTS5 + backfill + caches the searchable index at the `install()`
  stage (the timing is decided by the host per [RxDBPluginSearch.inject](#inject);
  the plugin itself does not wait on dependencies)
- Mounts the `search` / `searchCollection` entries on [RxDB](../../rxdb/classes/RxDB.md)
- Subscribes to `ENTITY_LOCAL_CREATE/UPDATE/REMOVE_EVENT` to dispatch silent re-queries to registered handles
- The shadow tables of writable checkouts each have their own full-text index
  (US-314 B2.5): built in the same transaction when the table set is created,
  backfilled when a table set without one is mounted; queries resolve table
  names by the table set this instance has mounted, and registered handles
  re-query after a mount switch

## Extends

- [`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md)

## Implements

- [`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md)

## Constructors

### Constructor

```ts
new RxDBPluginSearch(rxdb, options?): RxDBPluginSearch;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:292](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L292)

#### Parameters

| Parameter  | Type                                                          |
| ---------- | ------------------------------------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                          |
| `options?` | [`SearchPluginOptions`](../interfaces/SearchPluginOptions.md) |

#### Returns

`RxDBPluginSearch`

#### Overrides

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`constructor`](../../rxdb/classes/RxDBPluginBase.md#constructor)

## Properties

### inject \{#inject\}

```ts
readonly inject: readonly ["adapter:local"];
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:225](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L225)

Installed only after the local adapter is ready.

#### Remarks

Before this declaration, the waiting lived on the plugin itself: `#runInstall()`
first did `rxdb.connect(localAdapterName)` then
`firstValueFrom(adapterConnected$)`, while `RxDB.connect()` was itself waiting
for plugin installation to finish — both sides waiting on each other, dodging
the deadlock only via the timing convention "`adapterConnected$` must be set
before plugin installation". Handed to the host, `install()` being called
means the bootstrap chain (migration, table creation, indexes) has finished;
take the instance directly from [RxDB.localAdapterSync](../../rxdb/classes/RxDB.md#localadaptersync).

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`inject`](../../rxdb/interfaces/IRxDBPlugin.md#inject)

---

### lifecycle \{#lifecycle\}

```ts
readonly lifecycle: "scoped";
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:235](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L235)

Teardown is entirely handed to the scope.

#### Remarks

The old `SearchPluginPhase` state machine is gone: `installing` / `failed` are
accounted by the host scheduler, and `destroyed` is expressed by `scope.state`.
The cache reset moved from `destroy()` into one undo entry of the scope
(`search:state`), so the two-step teardown of "release the scope first, then
one more `destroy()`" converges into one step.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`lifecycle`](../../rxdb/interfaces/IRxDBPlugin.md#lifecycle)

---

### name \{#name\}

```ts
readonly name: Uncapitalize<string> = 'search';
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:236](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L236)

The plugin name, used for logging and host-side error attribution

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`name`](../../rxdb/interfaces/IRxDBPlugin.md#name)

---

### options \{#options\}

```ts
readonly options: SearchPluginOptions;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:238](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L238)

The plugin-level defaults (page size, debounce, snippet, excluded collections)

---

### rxdb \{#rxdb\}

```ts
protected readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-plugin.d.ts:183

#### Inherited from

[`RxDBPluginBase`](../../rxdb/classes/RxDBPluginBase.md).[`rxdb`](../../rxdb/classes/RxDBPluginBase.md#rxdb)

---

### worktreeTableSet \{#worktreetableset\}

```ts
readonly worktreeTableSet: WorktreeTableSetHooks;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:249](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L249)

The contribution to the writable checkout's table set (US-314 B2.5 / B2.6).

#### Remarks

`created`: the tables are just created; build full-text indexes for the member
tables and backfill inside the transaction that created them. A throw rolls
back the whole transaction — the checkout together with its indexes is either
fully built or leaves nothing behind. Not built when not installed (scope
absent, or installation failed): nothing is searchable then anyway; when that
table set is mounted later, backfill at the first search.

`fingerprint`: the signature of every installation plan on the backend and the
members (field and tokenizer versions), folded into the checkout's fingerprint —
when it changes, the whole set is rebuilt on mount and the indexes are rebuilt
along. Computed from the plans read at `install()`, regardless of whether the
installation succeeded: indexes missing after a failed installation are
backfilled by the first search.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`worktreeTableSet`](../../rxdb/interfaces/IRxDBPlugin.md#worktreetableset)

## Accessors

### ready \{#ready\}

#### Get Signature

```ts
get ready(): Promise<void>;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:288](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L288)

Resolves when the FTS5 installation completes; rejects on failure, letting host
apps wait on the critical path and handle fatal errors like
[SearchSchemaMismatchError](SearchSchemaMismatchError.md). The plugin does not
log on its own; the host decides error display and telemetry strategy by
explicitly `await`ing this promise.

##### Remarks

One deferred per connection epoch, with these states:

| Moment                                    | `ready`                                  |
| ----------------------------------------- | ---------------------------------------- |
| Before `connect()` / dependency not ready | **pending**                              |
| Installing                                | pending                                  |
| Installation succeeded                    | resolve                                  |
| Installation failed                       | reject (the original installation error) |
| Scope released (disconnect / rollback)    | reject (`destroyed`)                     |

The old convention of "reject before installed" being replaced by pending is
deliberate: once dependency scheduling landed, "not yet my turn to install" and
"cannot install" are no longer the same thing — the former is just not time
yet. Under the old convention there was a race window between `await connect()`
and `await ready` — with `connect()` in flight, `ready` had already rejected,
and the caller got an error unrelated to the real cause.

The returned promise is replaced each epoch. Holding the same reference across
a disconnect reads the result of **that epoch**; re-read `ready` after reconnecting.

##### Returns

`Promise`&lt;`void`&gt;

## Methods

### createHandle() \{#createhandle\}

```ts
createHandle(performSearch, options?): SearchHandle;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:404](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L404)

Creates a [SearchHandle](../interfaces/SearchHandle.md) by directly injecting `performSearch`.

For framework binding layers and integration tests (easy to mock the executor);
production paths should use [search](#search) / [searchCollection](#searchcollection).

#### Parameters

| Parameter       | Type                                                | Description                                                                                      |
| --------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `performSearch` | [`PerformSearch`](../type-aliases/PerformSearch.md) | The real query execution function; its inputs are the normalized query terms and the page number |
| `options?`      | [`SearchOptions`](../interfaces/SearchOptions.md)   | Per-call overrides (debounce / initialQuery)                                                     |

#### Returns

[`SearchHandle`](../interfaces/SearchHandle.md)

---

### install() \{#install\}

```ts
install(scope): Promise<void>;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:302](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L302)

Installs the plugin.

#### Parameters

| Parameter | Type                                                      | Description                                                                                                     |
| --------- | --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `scope`   | [`LifecycleScope`](../../utils/classes/LifecycleScope.md) | This connection epoch's plugin activation scope; one `acquire()` wraps only one acquisition step that may throw |

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Throwing (including a `Promise` rejection) counts as an installation failure:
the host first releases **the part already registered into `scope`** in reverse
order, then propagates the original error to `connect()`. Cleanup errors during
rollback are only logged and never overwrite the installation error.

An implementor not writing the parameter breaks no contract — `install()` and
`install(scope)` satisfy this interface equally.

#### Implementation of

[`IRxDBPlugin`](../../rxdb/interfaces/IRxDBPlugin.md).[`install`](../../rxdb/interfaces/IRxDBPlugin.md#install)

---

### search() \{#search\}

```ts
search(query, options?): SearchHandle;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:353](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L353)

The cross-collection aggregate search entry.

`query` can be a string (a one-shot query) or an `Observable<string>` (wired to
an input stream, with built-in debounce). `SearchOptions.collections` further
narrows the scope (accepting entity names or table names); containing unknown
names, or being empty after intersecting with the plugin-level
`excludedCollections`, throws (fail-fast).

#### Parameters

| Parameter  | Type                                              |
| ---------- | ------------------------------------------------- |
| `query`    | `string` \| `Observable`&lt;`string`&gt;          |
| `options?` | [`SearchOptions`](../interfaces/SearchOptions.md) |

#### Returns

[`SearchHandle`](../interfaces/SearchHandle.md)

#### Throws

When the plugin is not installed (before `db.connect()`) or the scope is
released — symmetric with [searchCollection](#searchcollection). Does **not**
degrade into an empty-result handle, see `#assertInstalled`.

#### Throws

The original installation error when `install()` failed.

---

### searchCollection() \{#searchcollection\}

```ts
searchCollection(
   collection,
   query,
   options?
): SearchHandle;
```

Defined in: [packages/rxdb-plugin-search/src/plugin.ts:378](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-search/src/plugin.ts#L378)

The search entry limited to a single collection (by entity name or table name).

If the given collection is not indexed (no `searchable` fields) or is excluded
by `excludedCollections`, it throws; the host should confirm installation via
[RxDBPluginSearch.ready](#ready) before calling.

#### Parameters

| Parameter    | Type                                              |
| ------------ | ------------------------------------------------- |
| `collection` | `string`                                          |
| `query`      | `string` \| `Observable`&lt;`string`&gt;          |
| `options?`   | [`SearchOptions`](../interfaces/SearchOptions.md) |

#### Returns

[`SearchHandle`](../interfaces/SearchHandle.md)

#### Throws

When the plugin is not installed (before `db.connect()`) or the scope is
released — symmetric with [search](#search). This guard runs before the
"not searchable" judgment, avoiding misreporting "the plugin is not installed"
as "this collection is not searchable".

#### Throws

The original installation error when `install()` failed.
