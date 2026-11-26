# SYSTEM_ENTITY_PERMISSIONS

```ts
const SYSTEM_ENTITY_PERMISSIONS: object;
```

Defined in: [packages/rxdb/src/entity/entity-permissions.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/entity-permissions.ts#L31)

Permission declaration for system tables: all three operations allow only system writes.

## Type Declaration

### create \{#create\}

```ts
readonly create: "system" = 'system';
```

### delete \{#delete\}

```ts
readonly delete: "system" = 'system';
```

### update \{#update\}

```ts
readonly update: "system" = 'system';
```

## Remarks

System tables contributed by the core and by plugins must all declare it explicitly (or a key-by-key equivalent literal); `RxDB.init()` verifies it table by table, see [assertSystemEntityPermissions](../functions/assertSystemEntityPermissions.md).
