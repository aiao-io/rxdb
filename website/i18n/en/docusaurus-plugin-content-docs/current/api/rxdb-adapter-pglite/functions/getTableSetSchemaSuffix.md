# getTableSetSchemaSuffix()

```ts
function getTableSetSchemaSuffix(tableSet): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table-name-resolver.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table-name-resolver.ts#L80)

The schema name suffix of a shadow table set: `$<suffix>`. Schemas in the catalog whose names end with it all belong to this table set.

## Parameters

| Parameter  | Type                                                         | Description      |
| ---------- | ------------------------------------------------------------ | ---------------- |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Shadow table set |

## Returns

`string`

The schema name suffix

## Remarks

Dropping a table set finds schemas via the catalog (US-314 B1.5), covering ones that were created halfway and members already removed from the config. The leading `$` ensures one suffix cannot match another suffix that merely ends with it. Comparison is by suffix, not `LIKE`: the underscore in `wt_` is a wildcard in `LIKE`.
