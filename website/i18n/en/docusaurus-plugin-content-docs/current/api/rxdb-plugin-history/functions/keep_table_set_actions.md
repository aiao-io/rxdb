# keep_table_set_actions()

```ts
function keep_table_set_actions(rxdb, actions, tableSet): SwitchVersionActions;
```

Defined in: [packages/rxdb-plugin-history/src/table-set-scope.ts:52](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/table-set-scope.ts#L52)

**`Internal`**

The increment keeps only entities managed by this table set; the rule is table\_set\_scope.

## Parameters

| Parameter  | Type                                                                    | Description                                 |
| ---------- | ----------------------------------------------------------------------- | ------------------------------------------- |
| `rxdb`     | [`RxDB`](../../rxdb/classes/RxDB.md)                                    | The instance                                |
| `actions`  | [`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md) | The increment of a branch switch or seeding |
| `tableSet` | [`WorktreeTableSet`](../../rxdb/classes/WorktreeTableSet.md)            | The table set to land in                    |

## Returns

[`SwitchVersionActions`](../../rxdb/interfaces/SwitchVersionActions.md)

The main table set is returned as-is; a shadow table set only contains member entities
