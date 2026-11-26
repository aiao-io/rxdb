# getChangeTriggerFunctionName()

```ts
function getChangeTriggerFunctionName(metadata, tableSet): string;
```

Defined in: [packages/rxdb-adapter-pglite/src/table-name-resolver.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-pglite/src/table-name-resolver.ts#L117)

The fully qualified name of the entity change trigger function: `"<schema>"."<table>_change_trigger_fn"`.

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `metadata` | [`EntityMetadata`](../../rxdb/type-aliases/EntityMetadata.md) | Entity metadata |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md) | Table set |

## Returns

`string`

The double-quoted function name, safe to insert into SQL directly

## Remarks

Functions are partitioned by schema: if it hung under the logical namespace, the shadow table set's `CREATE OR REPLACE FUNCTION` would silently replace the main table set's copy (whose branch id is a hard-coded literal), and all subsequent writes from the main checkout would be recorded under another branch's name.
