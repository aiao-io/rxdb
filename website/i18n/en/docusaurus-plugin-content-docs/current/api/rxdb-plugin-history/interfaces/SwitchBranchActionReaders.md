# SwitchBranchActionReaders

Defined in: [packages/rxdb-plugin-history/src/switch-branch-actions.ts:28](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/switch-branch-actions.ts#L28)

The minimal repository capabilities needed to compute switch-branch actions.

## Remarks

Written as a structural interface for the same reason as BranchChangeReader: both the local repository and the `IRepository`
given by a transaction executor satisfy it, and the two sides' `find` inputs are the same type anyway.

## Properties

### branchRepository \{#branchrepository\}

```ts
readonly branchRepository: object;
```

Defined in: [packages/rxdb-plugin-history/src/switch-branch-actions.ts:30](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/switch-branch-actions.ts#L30)

Reads branch rows

#### find()

```ts
find(options): Promise<RxDBBranch[]>;
```

Queries branches by condition

##### Parameters

| Parameter | Type                                                                                                                                                                                            | Description   |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `options` | [`FindOptions`](../../rxdb/interfaces/FindOptions.md)&lt;_typeof_ [`RxDBBranch`](../../rxdb/classes/RxDBBranch.md), [`RxDBBranchRuleGroup`](../../rxdb/type-aliases/RxDBBranchRuleGroup.md)&gt; | Query options |

##### Returns

`Promise`&lt;[`RxDBBranch`](../../rxdb/classes/RxDBBranch.md)[]&gt;

The matching branch rows

---

### changeRepository \{#changerepository\}

```ts
readonly changeRepository: BranchChangeReader;
```

Defined in: [packages/rxdb-plugin-history/src/switch-branch-actions.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/switch-branch-actions.ts#L41)

Reads change rows; see BranchChangeReader
