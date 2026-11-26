# exclusionTriggerNames()

```ts
function exclusionTriggerNames(constraintName): readonly [string, string];
```

Defined in: [packages/rxdb/src/entity/exclusion-constraint.ts:278](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/entity/exclusion-constraint.ts#L278)

The names of the two triggers for one exclusion on the SQLite side: the constraint name plus `_i` (insert) / `_u` (update), still starting with `ex_` and included in drift comparison.

## Parameters

| Parameter | Type |
| ------ | ------ |
| `constraintName` | `string` |

## Returns

readonly \[`string`, `string`\]
