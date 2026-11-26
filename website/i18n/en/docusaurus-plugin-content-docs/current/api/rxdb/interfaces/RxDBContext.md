# RxDBContext

Defined in: [packages/rxdb/src/rxdb.interface.ts:55](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L55)

RxDB environment context.

Used to share "global environment variables" within the RxDB singleton; the fields are all **optional** —
sync code skips unfilled fields as `undefined` (a typical scenario: no `userId` when not logged in).

## Extended by

- [`IMutationContext`](IMutationContext.md)

## Properties

### clientId? \{#clientid\}

```ts
clientId?: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L73)

Unique client ID.

#### Remarks

**Business code is strongly advised not to write this manually**: when `clientId` is omitted, `RxDB.init()`
auto-generates a UUID and pins it as part of the singleton lifecycle. If a manually assigned string collides
with another tab's, the "own-message filtering" in pull/push breaks, causing this tab to mistake the changes
it just pushed for someone else's and pull them back.

***

### userId? \{#userid\}

```ts
userId?: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L62)

The currently logged-in user ID.

The adapter uses it to fill the `createdBy` / `updatedBy` audit fields when writing entity rows
(only written if the entity declares these two columns). Sync does not do row-level filtering by it;
to sync only a subset of rows, use `SyncType.Filter`'s `remote.filter()`.
