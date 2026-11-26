# IMutationContext

Defined in: [packages/rxdb/src/repository/query.interface.ts:167](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L167)

Operation context.

## Extends

- [`RxDBContext`](RxDBContext.md)

## Extended by

- [`InsertSqlOptions`](../../rxdb-adapter-sqlite-core/interfaces/InsertSqlOptions.md)

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

#### Inherited from

[`RxDBContext`](RxDBContext.md).[`clientId`](RxDBContext.md#clientid)

---

### createdAt? \{#createdat\}

```ts
createdAt?: Date;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:178](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L178)

---

### returning? \{#returning\}

```ts
returning?: false;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:171](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L171)

Whether to return data.

---

### updatedAt? \{#updatedat\}

```ts
updatedAt?: Date;
```

Defined in: [packages/rxdb/src/repository/query.interface.ts:176](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query.interface.ts#L176)

Custom update time.

---

### userId? \{#userid\}

```ts
userId?: string;
```

Defined in: [packages/rxdb/src/rxdb.interface.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb.interface.ts#L62)

The currently logged-in user ID.

The adapter uses it to fill the `createdBy` / `updatedBy` audit fields when writing entity rows
(only written if the entity declares these two columns). Sync does not do row-level filtering by it;
to sync only a subset of rows, use `SyncType.Filter`'s `remote.filter()`.

#### Inherited from

[`RxDBContext`](RxDBContext.md).[`userId`](RxDBContext.md#userid)
