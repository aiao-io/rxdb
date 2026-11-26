# Oo1Capi

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L62)

Minimal contract of `sqlite3.capi`: only the part needed to register the update hook is kept here.

## Methods

### sqlite3\_update\_hook() \{#sqlite3_update_hook\}

```ts
sqlite3_update_hook(
   db, 
   xUpdate, 
   userCtx
): number;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/oo1-types.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/oo1-types.ts#L63)

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `db` | `number` \| [`Oo1Database`](Oo1Database.md) |
| `xUpdate` | (`userCtx`, `op`, `dbName`, `tableName`, `newRowId`) => `void` |
| `userCtx` | `number` |

#### Returns

`number`
