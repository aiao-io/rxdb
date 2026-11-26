# Worktree

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L65)

The registration row of a checkout.

## Remarks

Declares no relations: when a branch or commit is deleted, a read-only checkout is still a snapshot from the moment it was built and should not be carried away by foreign-key cascades;
a writable checkout that loses its held branch can no longer mount, and is reclaimed by `prune()` instead, also without foreign keys.

## Constructors

### Constructor

```ts
new Worktree(): Worktree;
```

#### Returns

`Worktree`

## Properties

### branchId \{#branchid\}

```ts
branchId: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L76)

Branch view: the target branch; commit view: the branch the commit is on

***

### commitId \{#commitid\}

```ts
commitId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L79)

Commit id of the commit view; `null` for a branch view

***

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L109)

Registration time

***

### dbName \{#dbname\}

```ts
dbName: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L91)

Logical database name of the snapshot database (handed to the snapshot instance as `dbName`), used to find the database on reclaim; a writable checkout has no snapshot database, so it is `null`

***

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L67)

Checkout id

***

### kind \{#kind\}

```ts
kind: WorktreeKind;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L73)

Kind of the HEAD

***

### lastAccessedAt \{#lastaccessedat\}

```ts
lastAccessedAt: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L112)

Time of the last open or refresh

***

### mode \{#mode\}

```ts
mode: WorktreeMode;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L70)

Read-only or writable

***

### name \{#name\}

```ts
name: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L97)

Name (GitHub Desktop's Worktree name); `null` for a read-only checkout

***

### owner \{#owner\}

```ts
owner: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L100)

Ownership

***

### schemaFingerprint \{#schemafingerprint\}

```ts
schemaFingerprint: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L106)

Structure fingerprint of the replicated entities (for a writable checkout, the members of that table set); once the app's entity structure changes, a persistent checkout can no longer be opened directly

***

### sourceBranchId \{#sourcebranchid\}

```ts
sourceBranchId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L82)

The main database's active branch when the snapshot was built (for a writable checkout, when it was seeded); `null` before it finishes building

***

### sourceChangeId \{#sourcechangeid\}

```ts
sourceChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L85)

Which change the active branch stopped at when the snapshot was built (seeded); `null` when there are no own changes or before it finishes building

***

### state \{#state\}

```ts
state: WorktreeState;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L103)

Whether it has finished building

***

### tableSetSuffix \{#tablesetsuffix\}

```ts
tableSetSuffix: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L94)

Suffix of the writable checkout's shadow table set (the holding key is derived from it); `null` for a read-only checkout

***

### targetChangeId \{#targetchangeid\}

```ts
targetChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L88)

Which change of the target branch the snapshot (seed) stopped at; `null` when there are no own changes or before it finishes building
