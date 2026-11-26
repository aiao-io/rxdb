# get_init_sql()

```ts
function get_init_sql(cacheSize, useOpfs): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:145](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L145)

Generates the database connection initialization PRAGMA SQL.

OPFS persistent scenarios enable WAL + NORMAL synchronous (balancing durability and performance); non-persistent (in-memory / temporary) scenarios use MEMORY journal + OFF synchronous for throughput.

## Parameters

| Parameter   | Type      | Description                      |
| ----------- | --------- | -------------------------------- |
| `cacheSize` | `number`  | SQLite page cache size (KB)      |
| `useOpfs`   | `boolean` | Whether the OPFS backend is used |

## Returns

`string`

The concatenated multi-statement PRAGMA SQL
