# RecordDeletePredicate

```ts
type RecordDeletePredicate = (record) => boolean;
```

Defined in: packages/rxdb-model/dist/entity-table/columns/column-utils.d.ts:182

Determines whether a row can be deleted; called per row by `actionsColumn`

## Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `record`  | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; |

## Returns

`boolean`
