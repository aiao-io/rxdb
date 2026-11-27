# Worktree

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:65](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L65)

A worktree's registration row.

## Remarks

Declares no relations: when a branch or commit is deleted, a read-only worktree remains a snapshot from its creation
moment and should not be taken away by a foreign key cascade; a writable worktree that lost the branch it holds can
no longer be mounted and is reclaimed by `prune()`, again without relying on foreign keys.

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

The target branch for a branch view; the branch the commit lives on for a commit view

---

### commitId \{#commitid\}

```ts
commitId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:79](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L79)

The commit id for a commit view; `null` for a branch view

---

### createdAt \{#createdat\}

```ts
createdAt: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:109](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L109)

Registration time

---

### dbName \{#dbname\}

```ts
dbName: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:91](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L91)

The snapshot database's logical database name (handed to the snapshot instance as `dbName`), used to locate the
database during reclamation; `null` for a writable worktree, which has no snapshot database

---

### id \{#id\}

```ts
id: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:67](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L67)

The worktree id

---

### kind \{#kind\}

```ts
kind: WorktreeKind;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L73)

The kind of HEAD

---

### lastAccessedAt \{#lastaccessedat\}

```ts
lastAccessedAt: Date;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:112](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L112)

The time of the last open or refresh

---

### mode \{#mode\}

```ts
mode: WorktreeMode;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:70](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L70)

Read-only or writable

---

### name \{#name\}

```ts
name: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:97](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L97)

The name (GitHub Desktop's Worktree name); `null` for a read-only worktree

---

### owner \{#owner\}

```ts
owner: WorktreeOwner;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:100](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L100)

Ownership

---

### schemaFingerprint \{#schemafingerprint\}

```ts
schemaFingerprint: string;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:106](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L106)

The structural fingerprint of the copied entities (for a writable worktree, the members of that table set);
once the app's entity structure changes, a persistent worktree can no longer be opened directly

---

### sourceBranchId \{#sourcebranchid\}

```ts
sourceBranchId: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:82](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L82)

The main database's active branch when the snapshot was built (seeding, for a writable worktree); `null` until built

---

### sourceChangeId \{#sourcechangeid\}

```ts
sourceChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:85](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L85)

Which change the active branch was at when the snapshot was built (seeding); `null` when there were no local
changes or until built

---

### state \{#state\}

```ts
state: WorktreeState;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L103)

Whether it has been built

---

### tableSetSuffix \{#tablesetsuffix\}

```ts
tableSetSuffix: string | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:94](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L94)

The suffix of a writable worktree's shadow table set (its holding key is derived from it); `null` for a read-only worktree

---

### targetChangeId \{#targetchangeid\}

```ts
targetChangeId: number | null;
```

Defined in: [packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts:88](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-working-tree/src/checkout/worktree.entity.ts#L88)

Which change on the target branch the snapshot (seeding) stopped at; `null` when there were no local changes or until built
