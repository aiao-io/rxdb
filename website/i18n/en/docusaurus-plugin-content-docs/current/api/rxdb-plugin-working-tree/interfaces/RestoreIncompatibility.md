# RestoreIncompatibility

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts:117](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/restore-precheck.ts#L117)

A stable description of the first incompatible node (FR-050).

## Remarks

All four are indispensable: without `commitId` the user does not know which node to inspect; without `direction` they do not know whether to look at `patch` or `inversePatch`; without `namespace` / `entity` they do not know which table; without `manifest` they do not know whether to upgrade the client or downgrade the data.

**Carries no patch content.** This object goes into logs and reports, and a patch may hold ciphertext of encrypted columns (FR-043).

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

The target entity name of this ChangeSet

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

The target entity namespace of this ChangeSet
