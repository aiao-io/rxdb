# RecordDeletePredicate

```ts
type RecordDeletePredicate = (record) => boolean;
```

Defined in: [packages/rxdb-model/src/entity-table/columns/column-utils.ts:662](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-model/src/entity-table/columns/column-utils.ts#L662)

Decides whether a row can be deleted; called per row by `actionsColumn`

## Parameters

| Parameter | Type                                                  |
| --------- | ----------------------------------------------------- |
| `record`  | `Readonly`&lt;`Record`&lt;`string`, `unknown`&gt;&gt; |

## Returns

`boolean`
