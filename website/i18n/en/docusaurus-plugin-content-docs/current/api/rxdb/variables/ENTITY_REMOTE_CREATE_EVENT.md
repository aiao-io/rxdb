# ENTITY_REMOTE_CREATE_EVENT

```ts
const ENTITY_REMOTE_CREATE_EVENT: 'ENTITY_REMOTE_CREATE';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L32)

Entity creation pulled from the remote side.

## Remarks

The three `ENTITY_REMOTE_*` events and their corresponding `ENTITY_LOCAL_*` counterparts are **two separate sets**, because their payload shapes differ: remote events carry the full row `data` without `patch` / `inversePatch` — remote changes do not participate in local undo/redo, so inverse patches are meaningless here.
