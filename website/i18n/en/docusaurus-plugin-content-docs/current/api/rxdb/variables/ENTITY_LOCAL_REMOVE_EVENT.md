# ENTITY_LOCAL_REMOVE_EVENT

```ts
const ENTITY_LOCAL_REMOVE_EVENT: 'ENTITY_LOCAL_REMOVE';
```

Defined in: [packages/rxdb/src/rxdb-events.ts:22](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L22)

A local entity was successfully deleted (`type: 'DELETE'`); the payload carries only `inversePatch` — `patch` is `null`.
