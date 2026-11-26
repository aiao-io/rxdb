# ENTITY_REMOTE_REMOVE_EVENT

```ts
const ENTITY_REMOTE_REMOVE_EVENT: 'ENTITY_REMOTE_REMOVE';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L38)

Entity deletion pulled from the remote side; the payload is the full row `data` from before the deletion, see [ENTITY\_REMOTE\_CREATE\_EVENT](ENTITY_REMOTE_CREATE_EVENT.md).
