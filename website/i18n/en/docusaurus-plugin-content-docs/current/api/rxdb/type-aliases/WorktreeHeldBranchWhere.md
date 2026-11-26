# WorktreeHeldBranchWhere

```ts
type WorktreeHeldBranchWhere = 
  | {
  combinator: "and";
  rules: [{
     field: "activated";
     operator: "=";
     value: true;
  }];
}
  | {
  combinator: "and";
  rules: [{
     field: "activeKey";
     operator: "=";
     value: string;
  }];
};
```

Defined in: [packages/rxdb/src/system/worktree-table-set.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/system/worktree-table-set.ts#L67)

The shape of [WorktreeTableSet.heldBranchWhere](../classes/WorktreeTableSet.md#heldbranchwhere): a condition group with
exactly one rule

## Remarks

Written as a concrete literal shape, not as the branch table's rule-group type: it must be handed to both the
system-table repository (`RxDBBranchRuleGroup`) and the generic repository (`RuleGroup<RxDBBranch>`), and those two
types are not mutually assignable, while the concrete shape is assignable to both sides.
