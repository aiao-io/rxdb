# RxDBBranchSwitchFailureContext

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:190](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L190)

The context passed to [RxDBSystemContribution.settleBranchSwitchFailure](RxDBSystemContribution.md#settlebranchswitchfailure)

## Properties

### currentBranchId \{#currentbranchid\}

```ts
readonly currentBranchId: string | null;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:192](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L192)

The current branch id; this failure did not switch away, so it is still the active one

---

### error \{#error\}

```ts
readonly error: unknown;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:198](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L198)

The error that made this switch fail; contributors recognize it by the types they know and do nothing when they cannot

---

### targetBranchId \{#targetbranchid\}

```ts
readonly targetBranchId: string;
```

Defined in: [packages/rxdb/src/rxdb-plugin-system.ts:195](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/rxdb-plugin-system.ts#L195)

The id of the target branch this switch failed to reach
