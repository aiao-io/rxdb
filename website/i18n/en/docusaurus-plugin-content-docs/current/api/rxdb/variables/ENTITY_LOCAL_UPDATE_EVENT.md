# ENTITY_LOCAL_UPDATE_EVENT

```ts
const ENTITY_LOCAL_UPDATE_EVENT: 'ENTITY_LOCAL_UPDATE';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L19)

A local entity was successfully updated (`type: 'UPDATE'`); the payload carries both `patch` and `inversePatch`, containing only the changed fields.
