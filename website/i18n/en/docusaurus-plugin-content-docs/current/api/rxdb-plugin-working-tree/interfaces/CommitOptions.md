# CommitOptions

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts:59](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L59)

The input of one `commit()` call (contracts/core-api.md §4).

## Remarks

**Both `authorId` and `operationId` are required.** If the author were optional, one history would contain commits
both with and without authors, and the latter can never be attributed in a multi-device scenario; if the operation id were optional,
the idempotency key could only be synthesized from content, and "two commits of the same content" would be judged as the same one (see
`commit/commit-idempotency.ts`).

**No selection parameter** — this is v1 hard ruling 1, not an unfinished signature (FR-041).

## Extends

- [`WorkingTreeCredentials`](WorkingTreeCredentials.md)

## Properties

### authorId \{#authorid\}

```ts
readonly authorId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts:61](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L61)

The commit author; lands in `Commit.author` of the immutable history

***

### expectedBranch \{#expectedbranch\}

```ts
readonly expectedBranch: ActiveBranchToken;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:80](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L80)

The active branch identity at capture time

#### Inherited from

[`WorkingTreeCredentials`](WorkingTreeCredentials.md).[`expectedBranch`](WorkingTreeCredentials.md#expectedbranch)

***

### expectedHeadRevision \{#expectedheadrevision\}

```ts
readonly expectedHeadRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:83](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L83)

The HEAD advance revision at capture time

#### Inherited from

[`WorkingTreeCredentials`](WorkingTreeCredentials.md).[`expectedHeadRevision`](WorkingTreeCredentials.md#expectedheadrevision)

***

### expectedWorkingTreeRevision \{#expectedworkingtreerevision\}

```ts
readonly expectedWorkingTreeRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts:86](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-conflict.ts#L86)

The working tree revision at capture time

#### Inherited from

[`WorkingTreeCredentials`](WorkingTreeCredentials.md).[`expectedWorkingTreeRevision`](WorkingTreeCredentials.md#expectedworkingtreerevision)

***

### operationId \{#operationid\}

```ts
readonly operationId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/commit-command.ts#L64)

The caller's operation id; retries of the same logical commit must carry the same value
