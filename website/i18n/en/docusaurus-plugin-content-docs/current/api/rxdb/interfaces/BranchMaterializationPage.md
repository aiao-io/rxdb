# BranchMaterializationPage

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:42](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L42)

A page already persisted into staging; `pageIndex` is the page order it received when persisted.

## Extends

- [`BranchMaterializationPagePayload`](BranchMaterializationPagePayload.md)

## Properties

### fingerprint \{#fingerprint\}

```ts
readonly fingerprint: string;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:38](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L38)

The value computed by [branchMaterializationPageFingerprint](../functions/branchMaterializationPageFingerprint.md) over `payload`

#### Inherited from

[`BranchMaterializationPagePayload`](BranchMaterializationPagePayload.md).[`fingerprint`](BranchMaterializationPagePayload.md#fingerprint)

---

### pageIndex \{#pageindex\}

```ts
readonly pageIndex: number;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:44](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L44)

Dense page order starting from 0

---

### payload \{#payload\}

```ts
readonly payload: Record<string, unknown>;
```

Defined in: [packages/rxdb/src/sync-contract/branch-materialization-source.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/sync-contract/branch-materialization-source.ts#L35)

The content of this page; may only contain JSON-expressible values, read back as-is after being persisted

#### Inherited from

[`BranchMaterializationPagePayload`](BranchMaterializationPagePayload.md).[`payload`](BranchMaterializationPagePayload.md#payload)
