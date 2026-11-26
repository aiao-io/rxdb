# InsertSqlOptions

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/insert\_sql.ts:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts#L24)

Options for generating insert SQL.

## Extends

- [`IMutationContext`](../../rxdb/interfaces/IMutationContext.md)

## Properties

### clientId? \{#clientid\}

```ts
clientId?: string;
```

Defined in: packages/rxdb/dist/rxdb.interface.d.ts:69

Unique client ID

#### Remarks

**Business code is strongly discouraged from writing this manually**: when `clientId` is omitted, `RxDB.init()` generates a UUID automatically and fixes it as part of the singleton lifecycle. If a manually assigned string collides with another tab, pull/push "self-message filtering" breaks, causing this tab to misjudge the changes it just pushed as someone else's and pull them back.

#### Inherited from

[`IMutationContext`](../../rxdb/interfaces/IMutationContext.md).[`clientId`](../../rxdb/interfaces/IMutationContext.md#clientid)

***

### createdAt? \{#createdat\}

```ts
createdAt?: Date;
```

Defined in: packages/rxdb/dist/repository/query.interface.d.ts:109

#### Inherited from

[`IMutationContext`](../../rxdb/interfaces/IMutationContext.md).[`createdAt`](../../rxdb/interfaces/IMutationContext.md#createdat)

***

### encryption? \{#encryption\}

```ts
encryption?: EncryptionContext;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/insert\_sql.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts#L26)

***

### returning? \{#returning\}

```ts
returning?: false;
```

Defined in: packages/rxdb/dist/repository/query.interface.d.ts:104

Whether to return data

#### Inherited from

[`IMutationContext`](../../rxdb/interfaces/IMutationContext.md).[`returning`](../../rxdb/interfaces/IMutationContext.md#returning)

***

### updatedAt? \{#updatedat\}

```ts
updatedAt?: Date;
```

Defined in: packages/rxdb/dist/repository/query.interface.d.ts:108

Custom update time

#### Inherited from

[`IMutationContext`](../../rxdb/interfaces/IMutationContext.md).[`updatedAt`](../../rxdb/interfaces/IMutationContext.md#updatedat)

***

### useReplace? \{#usereplace\}

```ts
useReplace?: boolean;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/entity/insert\_sql.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/entity/insert_sql.ts#L25)

***

### userId? \{#userid\}

```ts
userId?: string;
```

Defined in: packages/rxdb/dist/rxdb.interface.d.ts:59

Currently logged-in user ID

When the adapter writes entity rows, it uses this to fill the `createdBy` / `updatedBy` audit fields (written only when the entity declares those two columns). Sync does not use it for row-level filtering; to sync only part of the rows, use `remote.filter()` of `SyncType.Filter`.

#### Inherited from

[`IMutationContext`](../../rxdb/interfaces/IMutationContext.md).[`userId`](../../rxdb/interfaces/IMutationContext.md#userid)
