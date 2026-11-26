# EntitySyncOverride

Defined in: [packages/rxdb/src/entity/sync-override.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-override.ts#L26)

An instance-level entity sync override entry.

## Remarks

`sync` must be a **complete** `SyncOptions`: once selected it replaces the entity decorator and database default configuration as a whole,
with no field-by-field merging — after overriding `QueryCache + local + remote` with `None + local`, the effective configuration has no remote.

The target is selected by entity **class reference**, not by name: same-name entities in different namespaces are two targets.

## Example

```ts
new RxDB({
  dbName: 'server',
  entities: [Recipe],
  sync: { type: SyncType.None, local: { adapter: 'pglite' } },
  syncOverrides: [{ entity: Recipe, sync: { type: SyncType.None, local: { adapter: 'pglite' } } }]
});
```

## Properties

### entity \{#entity\}

```ts
readonly entity: EntityType;
```

Defined in: [packages/rxdb/src/entity/sync-override.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-override.ts#L28)

The override target: a business entity class registered in `entities`

---

### sync \{#sync\}

```ts
readonly sync: SyncOptions;
```

Defined in: [packages/rxdb/src/entity/sync-override.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/sync-override.ts#L30)

The complete sync configuration this instance uses for this entity
