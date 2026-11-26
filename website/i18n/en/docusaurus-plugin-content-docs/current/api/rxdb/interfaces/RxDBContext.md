# RxDBContext

Defined in: [packages/rxdb/src/rxdb.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L55)

RxDB environment context

Used to share the "global environment variables" within the RxDB singleton; the fields are all **optional** —
sync code skips unfilled fields with `undefined` (a typical case: no `userId` when not logged in).

## Extended by

- [`IMutationContext`](IMutationContext.md)

## Properties

### clientId? \{#clientid\}

```ts
clientId?: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L73)

Unique client ID

#### Remarks

**Manual assignment by business code is strongly discouraged**: when `clientId` is absent, `RxDB.init()`
automatically generates a UUID and fixes it as part of the singleton lifecycle. If a manually assigned string collides
with another tab, the "own-message filter" of pull/push breaks, causing this tab to misjudge the changes it just
pushed as someone else's and pull them back.

***

### userId? \{#userid\}

```ts
userId?: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L62)

The ID of the currently logged-in user

Adapters use it to fill the `createdBy` / `updatedBy` audit fields when writing entity rows (only written if the entity declares those two columns).
Sync does not do row-level filtering by it; to sync only a subset of rows, use `remote.filter()` of `SyncType.Filter`.
