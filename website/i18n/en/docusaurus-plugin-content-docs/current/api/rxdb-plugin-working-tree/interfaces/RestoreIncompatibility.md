# RestoreIncompatibility

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L117)

The stable description of the first incompatible node (FR-050).

## Remarks

All four pieces are indispensable: without `commitId` the user doesn't know which node to inspect; without `direction` they don't know whether to look at `patch` or `inversePatch`; without `namespace` / `entity` they don't know which table; without `manifest` they don't know whether to upgrade the client or downgrade the data.

**Does not carry patch content.** This object goes into logs and reports, and the patch may hold ciphertext of encrypted columns (FR-043).

## Properties

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:119](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L119)

The **first** incompatible commit id in replay order

***

### direction \{#direction\}

```ts
readonly direction: "reverse";
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:122](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L122)

The replay direction of this step, see [RestoreReplayDirection](../type-aliases/RestoreReplayDirection.md)

***

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:128](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L128)

The ChangeSet's target entity name

***

### manifest \{#manifest\}

```ts
readonly manifest: RestoreVersionManifest;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:131](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L131)

The version manifest, see [RestoreVersionManifest](RestoreVersionManifest.md)

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:125](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L125)

The ChangeSet's target entity namespace
