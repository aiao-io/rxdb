# ENTITY_LOCAL_NEW_EVENT

```ts
const ENTITY_LOCAL_NEW_EVENT: "ENTITY_LOCAL_NEW";
```

Defined in: [packages/rxdb/src/rxdb-events.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-events.ts#L13)

The entity was just `new`ed and is **not yet persisted** (`type: 'NEW'`).

## Remarks

The difference from [ENTITY\_LOCAL\_CREATE\_EVENT](ENTITY_LOCAL_CREATE_EVENT.md) is "has it entered the database": this one is emitted in the constructor, when the entity has no database-assigned fields yet and may never be saved. Use it when the UI wants to optimistically insert a draft row into a list; use CREATE for counting real data.
