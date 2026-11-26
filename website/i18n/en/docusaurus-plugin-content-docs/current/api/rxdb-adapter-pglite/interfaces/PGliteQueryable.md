# PGliteQueryable

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L26)

The minimal interface that can execute read-only queries: both the PGlite instance and [IPGliteClient](IPGliteClient.md) satisfy it.

## Methods

### query() \{#query\}

```ts
query<T>(query, params?): Promise<Results<T>>;
```

Defined in: [packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/backup/pglite-backup-compat.ts#L27)

#### Type Parameters

| Type Parameter |
| ------ |
| <a id="type-parameter-t"></a> `T` |

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `query` | `string` |
| `params?` | `unknown`[] |

#### Returns

`Promise`&lt;`Results`&lt;`T`&gt;&gt;
