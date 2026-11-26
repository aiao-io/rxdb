# QueryCacheEngineFactory

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L125)

QueryCache read engine factory — plugins register through `RxDB.queryCacheEngine()` inside `install(scope)`.

## Remarks

When the slot is empty, entities declaring `SyncType.QueryCache` are blocked by
`RxDBMissingPluginError` during `connect()`, **no silent degradation to local reads** (US-025 B3) — silent degradation would disguise
"plugin not installed" as "no data on the remote", the same reason `RxDBQueryCacheCapabilityError` refuses degradation.

## Methods

### createSession() \{#createsession\}

```ts
createSession<T>(context): QueryCacheSession<T>;
```

Defined in: [packages/rxdb/src/repository/query-cache-engine.interface.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-engine.interface.ts#L131)

Builds a session for one QueryCache entity.

#### Type Parameters

| Type Parameter                                                                            |
| ----------------------------------------------------------------------------------------- |
| <a id="type-parameter-t"></a> `T` _extends_ [`EntityType`](../type-aliases/EntityType.md) |

#### Parameters

| Parameter | Type                                                                 | Description                                                                               |
| --------- | -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `context` | [`QueryCacheSessionContext`](QueryCacheSessionContext.md)&lt;`T`&gt; | Everything core has prepared, see [QueryCacheSessionContext](QueryCacheSessionContext.md) |

#### Returns

[`QueryCacheSession`](QueryCacheSession.md)&lt;`T`&gt;
