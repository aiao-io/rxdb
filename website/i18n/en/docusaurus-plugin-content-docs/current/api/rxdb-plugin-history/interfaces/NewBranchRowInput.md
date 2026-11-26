# NewBranchRowInput

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L15)

Input of [write\_new\_branch](../functions/write_new_branch.md): a new branch's position in the tree, plus an optional named commit.

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L17)

The new branch's id; the caller has already confirmed it is usable and absent locally

---

### fromChangeId \{#fromchangeid\}

```ts
readonly fromChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L21)

The fork point: a change id on the parent branch; `null` stops at the parent branch's own fork point

---

### fromCommitId? \{#fromcommitid\}

```ts
readonly fromCommitId?: string;
```

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:23](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L23)

The named source commit, passed to the contributors as-is (see `RxDBBranchCreationContext.fromCommitId`)

---

### parentId \{#parentid\}

```ts
readonly parentId: string;
```

Defined in: [packages/rxdb-plugin-history/src/create-branch.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-history/src/create-branch.ts#L19)

The parent branch id; the caller has already confirmed it exists in this transaction
