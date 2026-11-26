# QueryCacheOutboxProvider

Defined in: [packages/rxdb/src/repository/query-cache-outbox.interface.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-outbox.interface.ts#L31)

Query outbox provider — registered by a plugin via `RxDB.queryCacheOutbox()` inside `install(scope)`.

## Remarks

Only exposes the one question the core actually needs to ask. `flushQueryCacheOutbox` /
`countQueryCacheOutbox` are not here: their callers (the sync listener, the DevTools panel) are already on the
plugin side, and the core does not need to know them.

## Methods

### pendingWriteIds() \{#pendingwriteids\}

```ts
pendingWriteIds(namespace, entity): Promise<ReadonlySet<string>>;
```

Defined in: [packages/rxdb/src/repository/query-cache-outbox.interface.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache-outbox.interface.ts#L39)

Gets the entity ids of a QueryCache repository that are currently **occupied by the outbox queue**.

#### Parameters

| Parameter   | Type     | Description                     |
| ----------- | -------- | ------------------------------- |
| `namespace` | `string` | Namespace                       |
| `entity`    | `string` | The entity name in the metadata |

#### Returns

`Promise`&lt;`ReadonlySet`&lt;`string`&gt;&gt;

The entity ids in the queue that have not yet been pushed back to the remote; an empty set when the queue is empty.
