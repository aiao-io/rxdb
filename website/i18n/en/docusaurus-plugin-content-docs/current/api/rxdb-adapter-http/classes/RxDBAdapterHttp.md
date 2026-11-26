# RxDBAdapterHttp

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L95)

QueryCache remote adapter backed by the user's own REST API.

## Remarks

**Transport belongs to this class, not to handlers.** A handler only does protocol mapping: `request()` produces the request description, `parse()` decodes the response body. Sending requests, injecting auth, extracting status codes, classifying errors, pagination and chunking all live on this side. If handlers sent requests themselves, the guarantor of contracts AC#12 / #13 / #16 would become the integrator, and this package could only degrade into documentation advice.

## Example

```typescript
const rxdb = new RxDB({
  dbName: 'app',
  entities: [Recipe],
  sync: `{ type: SyncType.QueryCache, local: { adapter: 'sqlite' }, remote: { adapter: 'http' } }`
});
// the read engine comes with the plugin (`@aiao/rxdb-plugin-querycache`); if it's missing, `connect()` rejects outright
rxdb.use(rxDBPluginQueryCache);
rxdb.adapter(
  'http',
  db =>
    new RxDBAdapterHttp(db, {
      baseUrl: 'https://api.example.com',
      handlers: {
        onFetchMetadata: {
          request: ctx => ({ url: `${ctx.entityName}/metadata`, method: 'POST', body: ctx }),
          parse: body => body as QueryCacheEntityMetadata[]
        },
        onFindByIds: {
          request: ctx => ({ url: `${ctx.entityName}`, method: 'POST', body: { ids: ctx.ids } }),
          parse: body => body as unknown[]
        }
      }
    })
);
```

## Extends

- [`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md)

## Implements

- [`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)

## Constructors

### Constructor

```ts
new RxDBAdapterHttp(rxdb, options): RxDBAdapterHttp;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:172](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L172)

#### Parameters

| Parameter | Type                                                        | Description                                               |
| --------- | ----------------------------------------------------------- | --------------------------------------------------------- |
| `rxdb`    | [`RxDB`](../../rxdb/classes/RxDB.md)                        | host RxDB instance                                        |
| `options` | [`HttpAdapterOptions`](../interfaces/HttpAdapterOptions.md) | baseUrl, handlers and optional numeric/auth configuration |

#### Returns

`RxDBAdapterHttp`

#### Throws

HttpConfigError empty baseUrl, missing a required handler, or any numeric option that is not a finite positive integer

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`constructor`](../../rxdb/classes/RxDBAdapterRemoteBase.md#constructor)

## Properties

### config \{#config\}

```ts
readonly config: HttpNumericConfig;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:124](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L124)

The validated numeric configuration, fixed at construction time

---

### create? \{#create\}

```ts
create?: <R>(entityName, data) => Observable<R>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:140](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L140)

Creates an entity. Only **exists** when `onCreate` is configured.

#### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

#### Parameters

| Parameter    | Type     |
| ------------ | -------- |
| `entityName` | `string` |
| `data`       | `R`      |

#### Returns

`Observable`&lt;`R`&gt;

#### Remarks

`QueryCacheEngine` feature-detects with `if (!this.remoteAdapter.create)`, so "unsupported" must manifest as **property absence**, not as a method that always throws — the latter would make the probe return `true` and turn AC#4's clear "Remote adapter does not support create" into a runtime surprise.

That's why only the type is `declare`d here; the body is attached on demand by `#installWriteDucks()` at construction time.

---

### delete? \{#delete\}

```ts
delete?: (entityName, ids) => Observable<void>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L146)

Deletes entities. Only exists when `onDelete` is configured, for the same reason as [RxDBAdapterHttp.create](#create).

#### Parameters

| Parameter    | Type                   |
| ------------ | ---------------------- |
| `entityName` | `string`               |
| `ids`        | `string` \| `string`[] |

#### Returns

`Observable`&lt;`void`&gt;

---

### name \{#name\}

```ts
readonly name: "http" = ADAPTER_NAME;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:121](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L121)

The adapter name, identical to the key used when registering with `RxDB.adapter()`; error messages and `getAdapter()` both identify the adapter by it

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`name`](../../rxdb/interfaces/IRxDBAdapter.md#name)

---

### options \{#options\}

```ts
readonly options: HttpAdapterOptions;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:174](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L174)

baseUrl, handlers and optional numeric/auth configuration

---

### repository\_cache \{#repository_cache\}

```ts
protected readonly repository_cache: Map<EntityType, RepositoryInstance<EntityType>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:349

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`repository_cache`](../../rxdb/classes/RxDBAdapterRemoteBase.md#repository_cache)

---

### repository\_map \{#repository_map\}

```ts
protected readonly repository_map: Map<string, AdapterRepositoryConstructor<RxDBAdapterHttp, RepositoryInstance<EntityType>>>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:348

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`repository_map`](../../rxdb/classes/RxDBAdapterRemoteBase.md#repository_map)

---

### rxdb \{#rxdb\}

```ts
readonly rxdb: RxDB;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:347

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`rxdb`](../../rxdb/classes/RxDBAdapterRemoteBase.md#rxdb)

---

### update? \{#update\}

```ts
update?: <R>(entityName, id, data) => Observable<R>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L143)

Updates an entity. Only exists when `onUpdate` is configured, for the same reason as [RxDBAdapterHttp.create](#create).

#### Type Parameters

| Type Parameter |
| -------------- |
| `R`            |

#### Parameters

| Parameter    | Type                 |
| ------------ | -------------------- |
| `entityName` | `string`             |
| `id`         | `string`             |
| `data`       | `Partial`&lt;`R`&gt; |

#### Returns

`Observable`&lt;`R`&gt;

## Accessors

### changeFeedEnabled \{#changefeedenabled\}

#### Get Signature

```ts
get changeFeedEnabled(): boolean;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:163](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L163)

Whether the change-notification channel **should** be running right now, flipped by [RxDBAdapterHttp.startChangeFeed](#startchangefeed) / [RxDBAdapterHttp.stopChangeFeed](#stopchangefeed).

##### Remarks

This is **intent**, not connection state: it stays `true` while the channel is backing off and reconnecting, or when the runtime has no `EventSource` at all. For the liveness of the connection itself, look at the two diagnostic callbacks `changeFeed.onOpen` (reports connected) and `changeFeed.onUnavailable` (reports failure; except for `malformed-message`, where the connection is still alive) — `EventSource` exposes no status code, and a boolean returned here can't answer "why is it not connected", it would only conflate two different problems into one.

(Sitting between the write ducks and the constructor is a lint `member-ordering` requirement: accessors come after fields and before the constructor. Semantically it belongs to the group of runtime switches below.)

##### Returns

`boolean`

Always `false` when `changeFeed` is not configured

## Methods

### backendId() \{#backendid\}

```ts
backendId(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:478](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L478)

#### Returns

`Promise`&lt;`string`&gt;

#### Throws

HttpChangelogUnsupportedError always

#### Remarks

The remote identity is only used to validate changelog cursors; v1 has no changelog, hence no cursor to validate. Returning a placeholder would make the sync plugin believe the remote identity has been verified.

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`backendId`](../../rxdb/classes/RxDBAdapterRemoteBase.md#backendid)

---

### branchExists()? \{#branchexists\}

```ts
branchExists ? branchId : Promise<boolean>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:944

#### Parameters

| Parameter  | Type     |
| ---------- | -------- |
| `branchId` | `string` |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`branchExists`](../../rxdb/classes/RxDBAdapterRemoteBase.md#branchexists)

---

### connect() \{#connect\}

```ts
connect(): Promise<IRxDBAdapter>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:210](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L210)

Establishes no long-lived connection; performs local validation only.

#### Returns

`Promise`&lt;[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md)&gt;

the adapter itself

#### Remarks

**Sends no probe request**: an unreachable remote at this moment doesn't mean the configuration is wrong — that's a query-time network error, left to `isNetworkError` to classify. Applications that want to confirm reachability at startup call [RxDBAdapterHttp.isTableExisted](#istableexisted) themselves; that's an explicit choice, not framework behavior.

**A long-lived connection exists only when `changeFeed` is configured**, and it is established last: a `connect()` whose validation failed shouldn't leave a live notification connection behind. The channel itself failing to connect doesn't affect this method's return — per US-023 AC#17 it only diagnoses, never throws.

The channel is driven by the **intent bit** [RxDBAdapterHttp.changeFeedEnabled](#changefeedenabled), not by "configured means on": a channel the caller manually stopped via [RxDBAdapterHttp.stopChangeFeed](#stopchangefeed) must not be silently resurrected by the next reconnect (backend switches and epoch transitions both land here).

#### Throws

HttpUnsupportedWireTypeError a registered entity declares bigint / binary fields

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`connect`](../../rxdb/interfaces/IRxDBAdapter.md#connect)

---

### disconnect() \{#disconnect\}

```ts
disconnect(): Promise<void>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:245](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L245)

Cancels in-flight requests.

#### Returns

`Promise`&lt;`void`&gt;

#### Remarks

Cancellation goes through the **error channel**: completing an Observable that never emitted would make core's `forkJoin` silently produce "zero remote rows" and mark the whole table orphaned — far more dangerous than throwing.

**Write requests already sent are not rolled back** — HTTP has no transactions, and pretending a rollback is possible is more dangerous than not rolling back.

The conditional-request cache is cleared along the way (AC#28): those responses are bound to the auth identity and remote state from before the disconnect; reusing them across a disconnect would let the first queries after reconnect read the world of the previous connection.

The change-notification channel is stopped too, **including any pending reconnect**: closing only the connection without canceling the timer would let the reconnect inside the backoff window re-establish the connection after the disconnect.

But [RxDBAdapterHttp.changeFeedEnabled](#changefeedenabled) is **left alone**: a disconnect is a lifecycle event, not the caller changing their mind. Clearing it too would let one reconnect eat the user's "I want notifications" choice.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`disconnect`](../../rxdb/interfaces/IRxDBAdapter.md#disconnect)

---

### fetchMetadata() \{#fetchmetadata\}

```ts
fetchMetadata(entityName, query): Observable<QueryCacheEntityMetadata[]>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:391](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L391)

Fetches metadata for all entities matching `query`.

#### Parameters

| Parameter    | Type                                                                 | Description                                              |
| ------------ | -------------------------------------------------------------------- | -------------------------------------------------------- |
| `entityName` | `string`                                                             | entity name                                              |
| `query`      | [`RuleGroup`](../../rxdb/type-aliases/RuleGroup.md)&lt;`unknown`&gt; | the query condition, passed through to the handler as-is |

#### Returns

`Observable`&lt;[`QueryCacheEntityMetadata`](../../rxdb/interfaces/QueryCacheEntityMetadata.md)[]&gt;

#### Remarks

**Emits exactly once and then completes** (AC#23). The whole pagination loop lives inside one `Promise`, which `from(promise)` satisfies naturally; per-page emission would leave the caller's `forkJoin` with only the last page, the earlier pages would be lost on the spot, and those ids would then be judged "deleted on the remote".

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`fetchMetadata`](../../rxdb/classes/RxDBAdapterRemoteBase.md#fetchmetadata)

---

### findByIds() \{#findbyids\}

```ts
findByIds<R>(entityName, ids): Observable<R[]>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:413](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L413)

Batch-fetches full rows by a list of ids.

#### Type Parameters

| Type Parameter                    |
| --------------------------------- |
| <a id="type-parameter-r"></a> `R` |

#### Parameters

| Parameter    | Type       | Description              |
| ------------ | ---------- | ------------------------ |
| `entityName` | `string`   | entity name              |
| `ids`        | `string`[] | the list of ids to fetch |

#### Returns

`Observable`&lt;`R`[]&gt;

#### Remarks

Same emission contract as [RxDBAdapterHttp.fetchMetadata](#fetchmetadata) (AC#33): all chunks merged, then emit exactly once and complete. What per-chunk emission would lose are the full rows destined for the local cache.

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`findByIds`](../../rxdb/classes/RxDBAdapterRemoteBase.md#findbyids)

---

### getChangeCount() \{#getchangecount\}

```ts
getChangeCount(): Promise<{
  count: number;
  latestChangeId: number;
}>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:494](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L494)

#### Returns

`Promise`&lt;\{
`count`: `number`;
`latestChangeId`: `number`;
\}&gt;

#### Throws

HttpChangelogUnsupportedError always (returning `0` would likewise be read as "no remote changes")

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`getChangeCount`](../../rxdb/classes/RxDBAdapterRemoteBase.md#getchangecount)

---

### getRepository() \{#getrepository\}

```ts
getRepository<E, RT>(): RT;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:442](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L442)

#### Type Parameters

| Type Parameter                                                                                                 | Default type                                                     |
| -------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| <a id="type-parameter-e"></a> `E` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md)              | -                                                                |
| <a id="type-parameter-rt"></a> `RT` _extends_ [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`E`&gt; | [`IRepository`](../../rxdb/interfaces/IRepository.md)&lt;`E`&gt; |

#### Returns

`RT`

#### Throws

HttpUnsupportedOperationError always

#### Remarks

The QueryCache's primary repository is assembled by core using the **local** adapter; there is nothing to return on this side.

This group doesn't even declare parameters (same as [RxDBAdapterHttp.pullChanges](#pullchanges)): a function with fewer parameters still satisfies `IRxDBAdapter`, while leaving an `_entities` that only exists to match the signature would make readers think it's used.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`getRepository`](../../rxdb/interfaces/IRxDBAdapter.md#getrepository)

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`getRepository`](../../rxdb/classes/RxDBAdapterRemoteBase.md#getrepository)

---

### isTableExisted() \{#istableexisted\}

```ts
isTableExisted(EntityType): Promise<boolean>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:347](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L347)

Answers by **remote resource reachability**, never fudges with a constant `true`.

#### Parameters

| Parameter    | Type                                                  | Description               |
| ------------ | ----------------------------------------------------- | ------------------------- |
| `EntityType` | [`EntityType`](../../rxdb/type-aliases/EntityType.md) | the entity class to check |

#### Returns

`Promise`&lt;`boolean`&gt;

#### Remarks

`2xx` → `true`, `404` → `false`, any other status code and transport failures → throw. Throwing rather than returning `false` is deliberate: "unknown" and "does not exist" must stay distinct; reading a 500 as "table doesn't exist" would let callers decide on a false answer.

When `onIsTableExisted` is not configured, reuses `onFetchMetadata` with a `limit: 1` probe.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`isTableExisted`](../../rxdb/interfaces/IRxDBAdapter.md#istableexisted)

---

### mergeChanges() \{#mergechanges\}

```ts
mergeChanges(): Promise<RemoteMergeResult>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:499](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L499)

#### Returns

`Promise`&lt;[`RemoteMergeResult`](../../rxdb/interfaces/RemoteMergeResult.md)&gt;

#### Throws

HttpChangelogUnsupportedError always

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`mergeChanges`](../../rxdb/classes/RxDBAdapterRemoteBase.md#mergechanges)

---

### mutations() \{#mutations\}

```ts
mutations<E>(): Promise<InstanceType<E>[]>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:463](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L463)

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-e-1"></a> `E` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`E`&gt;[]&gt;

#### Throws

HttpUnsupportedOperationError always

#### Remarks

Doesn't affect QueryCache bulk writes: once `EntityManager.mutations` classifies a batch as QueryCache, it takes `#mutations_query_cache`'s remote-then-local path and never comes through here.

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`mutations`](../../rxdb/interfaces/IRxDBAdapter.md#mutations)

---

### pullBranches()? \{#pullbranches\}

```ts
pullBranches?(): Promise<RemoteBranchInfo[]>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:945

#### Returns

`Promise`&lt;[`RemoteBranchInfo`](../../rxdb/interfaces/RemoteBranchInfo.md)[]&gt;

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pullBranches`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pullbranches)

---

### pullChanges() \{#pullchanges\}

```ts
pullChanges(): Promise<RemoteChange[]>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:489](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L489)

#### Returns

`Promise`&lt;[`RemoteChange`](../../rxdb/interfaces/RemoteChange.md)[]&gt;

#### Throws

HttpChangelogUnsupportedError always

#### Remarks

Returning an empty array **counts as failure**: Full-sync would read it as "no remote changes" and overwrite local knowledge. v1 has no changelog; an unsupported throw is the only honest behavior.

#### Overrides

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pullChanges`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pullchanges)

---

### pullChangesBatch()? \{#pullchangesbatch\}

```ts
pullChangesBatch?(
   requests,
   limit,
   branchIds?
): Promise<RemoteChange[]>;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:875

Batch-fetches change records for multiple entities (single HTTP request)

Each entity may have a different sinceId (watermark); server-side OR filtering fetches all entities' changes in a single request.

#### Parameters

| Parameter    | Type                                                              | Description                                                 |
| ------------ | ----------------------------------------------------------------- | ----------------------------------------------------------- |
| `requests`   | [`PullBatchRequest`](../../rxdb/interfaces/PullBatchRequest.md)[] | per-entity pull request (namespace + entity name + sinceId) |
| `limit`      | `number`                                                          | maximum number to pull                                      |
| `branchIds?` | `string`[]                                                        | list of branch IDs (ancestor branches supported)            |

#### Returns

`Promise`&lt;[`RemoteChange`](../../rxdb/interfaces/RemoteChange.md)[]&gt;

array of change records, ordered by id ASC

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pullChangesBatch`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pullchangesbatch)

---

### pushBranches()? \{#pushbranches\}

```ts
pushBranches ? branches : (
  Promise<{
    skipped: string[];
    synced: number;
  }>
);
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:940

#### Parameters

| Parameter  | Type                                  |
| ---------- | ------------------------------------- |
| `branches` | `Record`&lt;`string`, `unknown`&gt;[] |

#### Returns

`Promise`&lt;\{
`skipped`: `string`[];
`synced`: `number`;
\}&gt;

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`pushBranches`](../../rxdb/classes/RxDBAdapterRemoteBase.md#pushbranches)

---

### removeMany() \{#removemany\}

```ts
removeMany<E>(): Promise<InstanceType<E>[]>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:452](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L452)

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-e-2"></a> `E` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`E`&gt;[]&gt;

#### Throws

HttpUnsupportedOperationError always (same as [RxDBAdapterHttp.saveMany](#savemany))

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`removeMany`](../../rxdb/interfaces/IRxDBAdapter.md#removemany)

---

### repository() \{#repository\}

```ts
protected repository<RT>(repositoryName, RepositoryClass): void;
```

Defined in: packages/rxdb/dist/rxdb-adapter.d.ts:352

#### Type Parameters

| Type Parameter                                                                                                                                                                   |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-rt-1"></a> `RT` _extends_ [`RepositoryInstance`](../../rxdb/interfaces/RepositoryInstance.md)&lt;[`EntityType`](../../rxdb/type-aliases/EntityType.md)&gt; |

#### Parameters

| Parameter         | Type                                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `repositoryName`  | `string`                                                                                                                 |
| `RepositoryClass` | [`AdapterRepositoryConstructor`](../../rxdb/type-aliases/AdapterRepositoryConstructor.md)&lt;`RxDBAdapterHttp`, `RT`&gt; |

#### Returns

`void`

#### Inherited from

[`RxDBAdapterRemoteBase`](../../rxdb/classes/RxDBAdapterRemoteBase.md).[`repository`](../../rxdb/classes/RxDBAdapterRemoteBase.md#repository)

---

### saveMany() \{#savemany\}

```ts
saveMany<E>(): Promise<InstanceType<E>[]>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:447](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L447)

#### Type Parameters

| Type Parameter                                                                                      |
| --------------------------------------------------------------------------------------------------- |
| <a id="type-parameter-e-3"></a> `E` _extends_ [`EntityType`](../../rxdb/type-aliases/EntityType.md) |

#### Returns

`Promise`&lt;`InstanceType`&lt;`E`&gt;[]&gt;

#### Throws

HttpUnsupportedOperationError always (the Full/Filter write path; v1 has no Full-sync)

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`saveMany`](../../rxdb/interfaces/IRxDBAdapter.md#savemany)

---

### startChangeFeed() \{#startchangefeed\}

```ts
startChangeFeed(): void;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:277](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L277)

Connects the change-notification channel.

#### Returns

`void`

#### Remarks

Idempotent: if already running it just re-establishes the connection (`start()` itself "closes the previous one first"), never leaving a second one behind. After connecting it triggers a full invalidation as usual (D7) — "from now on I can receive changes" is the same sentence for the first connection and for reconnection.

**Connection state is checked first**, on the same basis as [RxDBAdapterHttp.version](#version): opening a live SSE on an already-`disconnect()`ed adapter is a real resource leak.

The bit checked here is `#connected`, not the one `#assertConnected` checks. **"Never `connect()`ed" and "already `disconnect()`ed" are the same thing for this method**: in both cases there has been no successful `connect()` yet, which means `#assertConfiguredEntitiesSupported()` hasn't run either — `new` + `startChangeFeed()` alone would bypass the wire-format validation, open a real connection on an adapter whose reachability is unknown, and run the D7 full invalidation against an entity table not yet confirmed usable.

#### Throws

HttpDisconnectedError never `connect()`ed, or already `disconnect()`ed

#### Throws

HttpUnsupportedOperationError `changeFeed` not configured

---

### stopChangeFeed() \{#stopchangefeed\}

```ts
stopChangeFeed(): void;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:299](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L299)

Disconnects the change-notification channel, **including any pending reconnect**.

#### Returns

`void`

#### Remarks

No one re-delivers remote changes that happened while disconnected; the full invalidation on the next [RxDBAdapterHttp.startChangeFeed](#startchangefeed) is where the catch-up happens.

Unlike [RxDBAdapterHttp.startChangeFeed](#startchangefeed), this method **doesn't check the open state**: on an already-`disconnect()`ed adapter the channel is already stopped, both paths lead to the same endpoint, and throwing for that would force a try block onto a plain "turn off the switch" cleanup. An idempotent stop isn't a fallback — it hides no difference.

#### Throws

HttpUnsupportedOperationError `changeFeed` not configured

---

### version() \{#version\}

```ts
version(): Promise<string>;
```

Defined in: [packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts:321](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-http/src/RxDBAdapterHttp.ts#L321)

Returns the **remote server** version.

#### Returns

`Promise`&lt;`string`&gt;

#### Remarks

Consistent with the sqlite / pglite / supabase adapters (all return the backend engine version). HTTP has no built-in RPC, so it relies on the optional `onVersion` handler; when unconfigured it throws rather than falling back to this package's `package.json` version — that would be passing off the adapter version as the backend version.

**Disconnect state is checked first**: on an already-`disconnect()`ed adapter, "no `onVersion` configured" is not the answer the caller should see right now — the configuration problem will still be there on the next connect, while the lifecycle problem is the truth of this particular call. The reverse order (checking the handler first) would also make the `#assertConnected` below unreachable on the missing-handler path, which is one of the two reasons it exists (the other being `findByIds` with an empty id list).

#### Throws

HttpDisconnectedError the adapter is disconnected

#### Throws

HttpUnsupportedOperationError `onVersion` not configured

#### Implementation of

[`IRxDBAdapter`](../../rxdb/interfaces/IRxDBAdapter.md).[`version`](../../rxdb/interfaces/IRxDBAdapter.md#version)
