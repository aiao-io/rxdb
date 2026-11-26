# BranchMaterializationPagePayload

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L33)

One page of snapshot handed over by the source side: the payload persisted as-is plus its fingerprint.

## Extended by

- [`BranchMaterializationPage`](BranchMaterializationPage.md)

## Properties

### fingerprint \{#fingerprint\}

```ts
readonly fingerprint: string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L38)

The value computed from `payload` by [branchMaterializationPageFingerprint](../functions/branchMaterializationPageFingerprint.md).

***

### payload \{#payload\}

```ts
readonly payload: Record<string, unknown>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L35)

The content of this page; may only contain JSON-expressible values and is read back exactly as persisted.
