# WorkingTreeStatus

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:49](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L49)

Everything one `status()` answers (contracts/core-api.md §3).

## Remarks

The three revision fields ([WorkingTreeStatus.activationRevision](#activationrevision) /
[WorkingTreeStatus.headRevision](#headrevision) / [WorkingTreeStatus.workingTreeRevision](#workingtreerevision))
are indispensable: they are exactly the three positions `commit()` / `discard()` require the caller to capture. Leave one out and the caller can never construct a commit that won't hit `CommitConflict`.

## Properties

### activationRevision \{#activationrevision\}

```ts
readonly activationRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:69](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L69)

One of the capture positions: the branch activation revision

***

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:51](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L51)

The current active branch id

***

### byOrigin \{#byorigin\}

```ts
readonly byOrigin: WorkingTreeOriginBreakdown;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:66](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L66)

The distribution of uncommitted entries by origin; `remote_sync` is **not exempt** (hard ruling 6)

***

### clean \{#clean\}

```ts
readonly clean: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:57](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L57)

There are no uncommitted entries

***

### conflicted \{#conflicted\}

```ts
readonly conflicted: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:63](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L63)

There is an unfinished restore session, but the revision it captured has already diverged

***

### entryCount \{#entrycount\}

```ts
readonly entryCount: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:54](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L54)

The number of uncommitted entries, taken from the redundant column

***

### headRevision \{#headrevision\}

```ts
readonly headRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:72](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L72)

One of the capture positions: the HEAD advance revision

***

### restoring \{#restoring\}

```ts
readonly restoring: boolean;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L60)

There is an unfinished restore session, and the two revisions it captured still match

***

### workingTreeRevision \{#workingtreerevision\}

```ts
readonly workingTreeRevision: number;
```

Defined in: [packages/rxdb-plugin-working-tree/src/working-tree/status.ts:75](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/working-tree/status.ts#L75)

One of the capture positions: the working tree revision
