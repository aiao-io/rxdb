# SYSTEM_ENTITIES

```ts
const SYSTEM_ENTITIES: readonly EntityType[] = SYSTEM_ENTITY_REGISTRY;
```

Defined in: [packages/rxdb/src/system/system-entities.ts:48](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-entities.ts#L48)

The identity of every system table this process has seen

## Remarks

This is a list for **judgment**, not for injection: it answers "is this class one of the system tables", not "which
tables should be created for which database". The latter is per-instance; see [CORE\_SYSTEM\_ENTITIES](CORE_SYSTEM_ENTITIES.md).

**The core only ships four.** The ten tables of epic-006 "local working tree and commit history" follow
`@aiao/rxdb-plugin-working-tree` and are appended via [registerSystemEntities](../functions/registerSystemEntities.md) only when
that package is installed.

There is only this one judgment list. Previously every place that needed to "exclude system tables" copied the class
names itself, and the cost of missing one was not a compile error but a runtime misjudgment.

**This is a live view, not a snapshot.** Tables appended by plugins via
[registerSystemEntities](../functions/registerSystemEntities.md) appear here directly. Do not `map` it into a derived constant at
module load time — that would permanently exclude plugin tables from the derived set, and the symptom is not a compile
error (see [getSystemEntityNames](../functions/getSystemEntityNames.md)).
