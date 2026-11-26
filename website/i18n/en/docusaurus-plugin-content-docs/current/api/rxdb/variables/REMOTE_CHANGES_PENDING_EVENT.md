# ~~Variable: REMOTE_CHANGES_PENDING_EVENT~~

```ts
const REMOTE_CHANGES_PENDING_EVENT: 'REMOTE_CHANGES_PENDING';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:120](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L120)

There are remote changes waiting to be pulled.

## Deprecated

Kept only to avoid breaking the export surface: it is not in [RxDBEventMap](../interfaces/RxDBEventMap.md), and no dispatch site exists anywhere in the repo — subscribing to it never delivers anything. To observe remote changes, use [REMOTE\_ENTITY\_INVALIDATED\_EVENT](REMOTE_ENTITY_INVALIDATED_EVENT.md).
