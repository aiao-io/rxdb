# EntitySyncResolver

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L30)

The **single** resolution entry point for an entity's effective sync configuration.

## Remarks

The priority is fixed: **the instance's explicit override for that entity \> the entity decorator's `sync` \> the database default `sync`**, and it is implemented in exactly one place, [createEntitySyncResolver](../functions/createEntitySyncResolver.md). Every sync consumer in core and plugins (primary adapter selection, metadata validation, repository construction, bulk-write routing, push/pull scheduling, sync state) reads through it — the moment each reads `metadata.sync` back on its own, the same entity would belong to two different strategies in different subsystems.

Each RxDB instance holds its own copy ([RxDB.entitySync](../classes/RxDB.md#entitysync)); overrides take effect only for that instance.

## Properties

### databaseSync \{#databasesync\}

```ts
readonly databaseSync: SyncOptions | undefined;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:32](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L32)

The database-level default `sync` (`rxdb.config.sync`)

## Methods

### resolve() \{#resolve\}

```ts
resolve(target): SyncOptions | undefined;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:45](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L45)

Resolves the effective sync configuration of the target entity.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`EntitySyncTarget`](../type-aliases/EntitySyncTarget.md) | An entity class or entity metadata |

#### Returns

[`SyncOptions`](../type-aliases/SyncOptions.md) \| `undefined`

The effective configuration; `undefined` when neither the entity nor the database has one

#### Remarks

Returns the selected configuration as-is, without the inheritance special case of [EntitySyncResolver.resolveType](#resolvetype): when inheriting the database default `None + local + remote`, the `type` here is still `None`, while `resolveType` classifies it as `full`. To determine the sync type, use `resolveType`, not the `.type` here.

***

### resolveType() \{#resolvetype\}

```ts
resolveType(target): RepositorySyncType;
```

Defined in: [packages/rxdb/src/sync-contract/entity-sync-resolver.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/entity-sync-resolver.ts#L57)

Resolves the effective sync type of the target entity.

#### Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `target` | [`EntitySyncTarget`](../type-aliases/EntitySyncTarget.md) | An entity class or entity metadata |

#### Returns

[`RepositorySyncType`](../type-aliases/RepositorySyncType.md)

The sync type, classified by the same measure as [getSyncType](../functions/getSyncType.md)

#### Remarks

The `None + local + remote ⇒ full` special case applies only when "inheriting the database default configuration"; overrides are **explicit** declarations just like the decorator, and are classified literally.
