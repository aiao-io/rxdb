# CommitChangeUnitContent

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L77)

The part of the unit content that goes into the digest — exactly the nine columns `CommitChangeSet` persists.

## Remarks

Shaped as a single interface so computeChangeUnitFingerprint's parameter says plainly "which fields go into the digest".
Adding a field to this interface = changing the criterion of every existing fingerprint in the database, and the `UNIT_DOMAIN` version number **must** be bumped at the same time.

## Properties

### entity \{#entity\}

```ts
readonly entity: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L85)

The entity name

***

### entityId \{#entityid\}

```ts
readonly entityId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:87](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L87)

The entity primary key

***

### inversePatch \{#inversepatch\}

```ts
readonly inversePatch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:93](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L93)

The reverse field change package, used for restore; `null` for NEW, which has no reverse content

***

### namespace \{#namespace\}

```ts
readonly namespace: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L83)

The entity namespace

***

### operation \{#operation\}

```ts
readonly operation: CommitChangeUnitOperation;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:89](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L89)

The operation type

***

### origin \{#origin\}

```ts
readonly origin: CommitChangeUnitOrigin;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:95](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L95)

The change origin; uncommitted changes produced by remote sync are `remote_sync`

***

### patch \{#patch\}

```ts
readonly patch: Record<string, unknown> | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L91)

The forward field change package; `null` for DELETE, which has no forward content

***

### transactionId \{#transactionid\}

```ts
readonly transactionId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:81](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L81)

The owning transaction id; `null` for non-transactional writes

***

### unitId \{#unitid\}

```ts
readonly unitId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/commit/change-unit.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/commit/change-unit.ts#L79)

The unit id; multiple rows of a complete transaction share the same value — splitting it would split one atomic write into several independent changes
