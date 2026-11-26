# RxDBOptions

Defined in: [packages/rxdb/src/rxdb.interface.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L83)

Top-level RxDB configuration.

The shape consumed by the `RxDB` constructor. **dbName + entities** are initialization prerequisites;
the remaining fields fall back to sensible defaults when omitted: no `migrations` is equivalent to an empty array;
`sync` is required because an RxDB that never syncs has almost no business value.

## Properties

### context? \{#context\}

```ts
context?: RxDBContext;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L167)

Environment context.

`userId` is used to fill the `createdBy` / `updatedBy` audit fields, and `clientId` is used to recognize changes originating from this client during sync.
At runtime the whole object can be replaced via the `RxDB.context` setter (`clientId` is merged and preserved).

---

### dbName \{#dbname\}

```ts
dbName: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L91)

Database name.

#### Remarks

The namespace of the same physical SQLite file. RxDB automatically appends an `@<RXDB_DB_NAME_SUFFIX>`
suffix to avoid colliding with older databases as versions evolve — what the business side passes in is the user-readable "logical name".

---

### entities \{#entities\}

```ts
entities: EntityType[];
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L100)

All entities.

**The same type may appear only once** in the list; the decorators deduplicate but do not guarantee order.
Many-to-many junction tables (see `./entity/many-to-many-entity.ts`) do not need to appear here —
`SchemaManager.init()` appends them automatically while resolving relations.

---

### migrations? \{#migrations\}

```ts
migrations?: MigrationType[];
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:134](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L134)

Upgrade scripts.

Executed in `name.localeCompare` order; ones that have already run are skipped;
idempotency is controlled by the records in the `RxDBMigration` table.

---

### multiInstance? \{#multiinstance\}

```ts
multiInstance?: boolean;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L109)

Whether to enable database event coordination between multiple JavaScript realms.

#### Remarks

Defaults to `true`; coordinates multiple browser tabs via `BroadcastChannel` and Web Locks.
The WeChat Mini Program logic layer has only a single realm and lacks these Web APIs, so it must be explicitly set to `false`.

---

### readOnly? \{#readonly\}

```ts
readOnly?: boolean;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:126](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L126)

Read-only instance.

#### Remarks

When `true`, the public write entry points (`Repository.create/update/remove/reorder`, the `EntityManager` batch writes and
`notifyExternalUpdate`, and the entity instances' `save()` / `remove()`) throw [RxDBReadOnlyError](../classes/RxDBReadOnlyError.md)
before the write-permission check. Like the US-027 permissions, this is fail-fast only: the adapter and executor layers do not enforce it. Defaults to `false`.

A read-only instance is treated as a view next to a writable instance: when one entity class is registered on both
(core system entities are registered on every instance), static calls such as `RxDBBranch.find()` resolve to the writable
one and no longer report a multi-instance error.

A bare construction without context goes through the same resolution: calling `new RxDBBranch()` and then `save()` inside
code running in a read-only instance assigns the entity to the writable instance, and the write lands in **its** database —
the read-only instance's write guard never sees it. To create an entity on the read-only instance, go through its
`entityManager.instantiate()` / `createEntityRef()`.

---

### sync \{#sync\}

```ts
sync: SyncOptions;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:141](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L141)

Default sync configuration.

Each repository's [SyncType](../enumerations/SyncType.md) inherits from this, and undeclared fields fall through to the global defaults.

---

### syncOverrides? \{#syncoverrides\}

```ts
syncOverrides?: readonly EntitySyncOverride[];
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:159](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L159)

This instance's sync configuration overrides for specific entities.

#### Remarks

Precedence: **this override \> the entity decorator's `sync` \> the default `sync` above**. Each override provides a complete
`SyncOptions`; once selected it replaces the whole object without field merging. An override belongs only to this instance
and does not modify entity metadata, so the same entity class can follow different strategies on different instances
(e.g. browser QueryCache, server-side purely local).

Validated and snapshotted at construction: the target must be a business entity in `entities` (system tables,
auto-generated junction entities, and unregistered entities are all rejected), the same entity may not appear twice,
and `sync` must satisfy the required fields of the selected `type` (both sides for Full / Filter / QueryCache,
and the `remote.filter` function for Filter); violations throw [RxDBSyncOverrideError](../classes/RxDBSyncOverrideError.md).
Mutating the passed object afterwards does not affect this instance.

Overrides do not create adapters or install plugins: adapters are still registered only from the default `sync`,
and the adapter name on either side of an override must match the corresponding side of the default `sync`;
QueryCache and other strategies in an override still require the library-level adapters and corresponding plugins on both sides as usual.
