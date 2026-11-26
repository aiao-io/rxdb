# getSchemaName()

```ts
function getSchemaName(metadata, tableSet): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table-name-resolver.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table-name-resolver.ts#L65)

The schema an entity lives in within a given table set.

## Parameters

| Parameter  | Type                                                          | Description     |
| ---------- | ------------------------------------------------------------- | --------------- |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)  | Table set       |

## Returns

`string`

The unquoted schema name: the namespace for the main table set or when there is no replica, otherwise the shadow schema that keeps the full table set suffix

## Remarks

When the PostgreSQL 63-byte limit is exceeded, only the namespace is truncated and its hash is appended: same-prefix namespaces remain distinguishable, while the full `$<suffix>` is preserved for catalog deletion and system migrations. Truncation follows UTF-8 code points, so Chinese characters are never split into invalid bytes.
