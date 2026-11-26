# registerSystemEntities()

```ts
function registerSystemEntities(entities): void;
```

Defined in: [packages/rxdb/src/system/system-entities.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/system-entities.ts#L85)

Registers system tables contributed by plugins.

## Parameters

| Parameter  | Type                                                     | Description                                                 |
| ---------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| `entities` | readonly [`EntityType`](../type-aliases/EntityType.md)[] | The plugin's system entity classes, in table creation order |

## Returns

`void`

## Remarks

**A system table identity is a property of the "entity class", not of "a database"**, so the registry is module-level and only ever grows.
This is exactly why [isSystemEntity](isSystemEntity.md) can keep a pure-function signature — it has cross-package consumers
(`RxDBAdapterHttp` uses it to decide sync behavior), and switching to per-instance lookup would ripple into call sites outside the package.

Multiple instances do not pollute each other, but that is **not** guaranteed by this function: the guarantee comes from the table-creation side computing per instance
(`RxDB.systemEntities` = [CORE\_SYSTEM\_ENTITIES](../variables/CORE_SYSTEM_ENTITIES.md) + the contributions this instance has `use()`d).
The registry is only read by judgments like "is this class a system table"; recognizing a few extra identities has no behavioral difference for a library without that plugin installed —
those classes can never enter its `config.entities` anyway.

Idempotent by identity: registering the same table again is a no-op, so re-installing plugins across `disconnect()` → `connect()` does not make
the registry grow unboundedly (same reasoning as the per-table judgment in [SchemaManager.init](../interfaces/SchemaManager.md#init)).

Must be called **before** `connect()`. The table-creation bootstrap reads the registry only once; tables registered afterwards will never be created.
