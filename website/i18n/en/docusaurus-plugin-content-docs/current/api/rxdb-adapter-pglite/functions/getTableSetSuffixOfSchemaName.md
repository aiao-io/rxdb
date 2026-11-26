# getTableSetSuffixOfSchemaName()

```ts
function getTableSetSuffixOfSchemaName(schemaName): string | undefined;
```

Defined in: [packages/rxdb-adapter-pglite/src/table-name-resolver.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table-name-resolver.ts#L91)

Recognizes which shadow table set a catalog schema name belongs to: it is a match when the segment after the last `$` has the shape of a table set suffix (US-314 B2.6).

## Parameters

| Parameter    | Type     | Description                         |
| ------------ | -------- | ----------------------------------- |
| `schemaName` | `string` | The schema name from `pg_namespace` |

## Returns

`string` \| `undefined`

The table set suffix; returns `undefined` for schemas that are not shadow table sets

## Remarks

Only the shape is checked: if an entity's namespace in the config happens to end with `$wt_…`, a suffix will be recognized there too, and the caller must exclude it using the namespace.
