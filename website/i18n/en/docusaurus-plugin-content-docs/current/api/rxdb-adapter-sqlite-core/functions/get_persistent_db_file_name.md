# get_persistent_db_file_name()

```ts
function get_persistent_db_file_name(dbName): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/sqlite-client.utils.ts#L100)

Normalizes a database name into a persistent file path.

Strips leading and trailing whitespace, appends the `.sqlite3` extension and the root path prefix automatically,
so the same dbName yields a consistent file name across different backends.

## Parameters

| Parameter | Type     | Description                                                                                                         |
| --------- | -------- | ------------------------------------------------------------------------------------------------------------------- |
| `dbName`  | `string` | The database logical name, must not contain `/` or `\` @returns a path starting with `/` and ending with `.sqlite3` |

## Returns

`string`

## Remarks

OPFS's file name space is flat; no directory separator normalization is done here.
Earlier, `/` and `\` were all replaced with `_`, so `a/b`, `a\b`, `a_b` landed on the same physical file
`/a_b.sqlite3` — two logically different databases overwriting each other's data, with no diagnostic signal at all.
Normalization produces a **deterministic collision**; there is no encoding that both preserves separators and avoids collisions,
so it is rejected outright at the entry. Database names without separators produce file paths byte-identical to the historical implementation; existing data is unaffected.

## Throws

When dbName contains directory separators
