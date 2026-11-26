# generateSwitchBranchSql()

```ts
function generateSwitchBranchSql(adapter, branchId): string;
```

Defined in: [packages/rxdb-adapter-sqlite-core/src/version/switch\_branch.ts:108](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-adapter-sqlite-core/src/version/switch_branch.ts#L108)

Generates the SQL for switching branches (one whole block assembled by [generateSwitchBranchStatements](generateSwitchBranchStatements.md)).

## Parameters

| Parameter | Type |
| ------ | ------ |
| `adapter` | [`RxDBAdapterSqliteBase`](../classes/RxDBAdapterSqliteBase.md) |
| `branchId` | `string` |

## Returns

`string`

## Remarks

Only for callers that **do not read a result set**: concatenation makes the rows of the second `RETURNING` unrecoverable on some backends; see [generateSwitchBranchStatements](generateSwitchBranchStatements.md) for the reason. Execute the statements one by one if you need the rows. *
**The other backend has a parallel implementation** (`packages/rxdb-adapter-pglite/src/version/switch_branch.ts`). The **mechanisms on both sides are already identical** (both are "extinguish first, then light up" — two UPDATEs with `RETURNING`, see above); the remaining divergence is only in the **statement collection protocol**: the sqlite side hands out an array of statements (callers that need rows execute them one by one; only callers that do not need rows use the `join('')` variant), while the pglite side hands out one whole string separated by `---STATEMENT_SEPARATOR---`. Unification requires agreeing on this protocol first, and the two adapters do not depend on each other — which package the shared layer should live in is itself undecided; this is the same determination as for `version/switch-result.utils.ts` (those two files' `@fileoverview` comments record the concrete reasons why "extracting them leaves only a shell"). The deferred record is in `requirements/roadmap.md` under "epic-006 deferred architecture items".

Until unified, **any** change to these two UPDATEs must be mirrored on both sides: the unique index on `activeKey` is the only mechanical guarantee of "at most one active branch" (see `packages/rxdb/src/system/branch.ts` for the definition), and one missing `RETURNING` means the rows flipped on that side never enter event dispatch.
