# get_persistent_db_file_name()

```ts
function get_persistent_db_file_name(dbName): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L100)

Normalizes a database name into a persistent file path.

Strips leading and trailing whitespace, automatically appends the `.sqlite3` extension and the root path prefix,
so the same dbName yields a consistent file name across backends.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `dbName` | `string` | Database logical name; must not contain `/` or `\` @returns a path starting with `/` and ending with `.sqlite3` |

## Returns

`string`

## Remarks

OPFS's file name space is flat, so no directory separator normalization is done here.
Earlier `/` and `\` were all replaced with `_`, so `a/b`, `a\b`, and `a_b` landed on the same physical file
`/a_b.sqlite3` — two logically different databases overwrote each other's data with no diagnostic signal at all.
Normalization produces **deterministic collisions**, and no encoding exists that preserves the separators without colliding,
so it rejects at the entry point directly. File paths of database names without separators match the historical implementation verbatim; existing data is unaffected.

## Throws

When dbName contains directory separators
