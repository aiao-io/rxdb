# RxDBSyncOverrideErrorReason

```ts
type RxDBSyncOverrideErrorReason = 
  | "unregistered"
  | "system-entity"
  | "duplicate"
  | "invalid-entry"
  | "invalid-sync";
```

Defined in: [packages/rxdb/src/entity/sync-override.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-override.ts#L43)

Reasons an override entry is invalid.

- `unregistered`: the target is not in this instance's `entities` (including auto-generated relation join entities)
- `system-entity`: the target is a system table injected by RxDB or a plugin
- `duplicate`: the same entity appears in more than one override
- `invalid-entry`: `syncOverrides` is not an array, the array has holes, an entry is not an object, or `entity` is not an entity class
- `invalid-sync`: `sync` is `null`, not an object, missing or misspelled `type`, an adapter option has the wrong shape,
  Full / Filter / QueryCache is missing one side, `remote.filter` of Filter is not a function, or an adapter named on
  one side of the override declaration was not registered at the database level
