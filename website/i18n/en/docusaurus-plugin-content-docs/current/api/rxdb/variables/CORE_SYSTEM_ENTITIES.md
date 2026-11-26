# CORE_SYSTEM_ENTITIES

```ts
const CORE_SYSTEM_ENTITIES: readonly EntityType[];
```

Defined in: [packages/rxdb/src/system/system-entities.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-entities.ts#L19)

System tables shipped with the core; every database has them.

## Remarks

**This is a snapshot and does not grow with plugins** — which is exactly why it is the starting point on the **injection** side: the system tables of each database = these four + the ones contributed by the plugins that database has `use()`d (see `RxDB.systemEntities`). Injecting the growing [SYSTEM\_ENTITIES](SYSTEM_ENTITIES.md) would make every database get those tables — and eat their migrations — as long as any single database in the process has installed a contributor.

The order is the table creation order: `RxDBChange` references `RxDBBranch`.
