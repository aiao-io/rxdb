# find_switch_branch_step()

```ts
function find_switch_branch_step(options): SwitchBranchStep[];
```

Defined in: [packages/rxdb-plugin-history/src/find-switch-branch-step.ts:143](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/find-switch-branch-step.ts#L143)

**`Internal`**

Computes the switch path between two nodes in the tree

## Parameters

| Parameter | Type | Description |
| ------ | ------ | ------ |
| `options` | `FindBranchPathOptions` | The start branch, the target branch, the current change ids of both sides, and the **full** branch set |

## Returns

[`SwitchBranchStep`](../interfaces/SwitchBranchStep.md)[]

Steps ordered by execution; an empty array when both sides stop at the same change id

## Throws

RxDBError When the parent chain has a cycle or points at a nonexistent branch (via [find\_branch\_path\_to\_root](find_branch_path_to_root.md))

## Remarks

Four rules:

1. when the two nodes share an ancestor, the path is "current node → common ancestor → target node"
2. without a common ancestor, the path is "current node → root → target node"
3. every node on the path computes the change range of its own segment, i.e. `fromChangeId → toChangeId`
4. `changeId` increases on every branch, so the **reverse-restoring** steps have `fromChangeId > toChangeId`,
   while forward-applying ones are the opposite — the direction is expressed by the magnitude relation of these two numbers, with no second direction field on the step

There are two **early returns** that skip parent-chain traversal — an empty step list when the change ids are equal, and a single step for the same branch with different change ids —
so this function is not a checkpoint of parent-chain integrity; see [find\_branch\_path\_to\_root](find_branch_path_to_root.md) for the rationale.
