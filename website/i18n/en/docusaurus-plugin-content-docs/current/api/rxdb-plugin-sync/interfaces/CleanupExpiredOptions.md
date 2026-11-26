# CleanupExpiredOptions

Defined in: [packages/rxdb-plugin-sync/src/cleanup-expired.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/cleanup-expired.ts#L38)

Expired data cleanup options

## Properties

### dryRun? \{#dryrun\}

```ts
dryRun?: boolean;
```

Defined in: [packages/rxdb-plugin-sync/src/cleanup-expired.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/cleanup-expired.ts#L49)

Dry-run mode, only returning the number that would be deleted

#### Default

```ts
false;
```

---

### filter? \{#filter\}

```ts
filter?: RuleGroup;
```

Defined in: [packages/rxdb-plugin-sync/src/cleanup-expired.ts:43](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-sync/src/cleanup-expired.ts#L43)

The filter condition (optional)
If not provided, obtained from the entity metadata's sync.remote.filter()
