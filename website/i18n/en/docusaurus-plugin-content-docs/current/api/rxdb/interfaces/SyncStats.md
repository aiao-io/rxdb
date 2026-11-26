# SyncStats

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:142](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L142)

Sync statistics

## Properties

### durationMs \{#durationms\}

```ts
durationMs: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:164](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L164)

Elapsed time (milliseconds)

---

### freshCount \{#freshcount\}

```ts
freshCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:150](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L150)

Number of fresh items (no sync needed)

---

### heldCount \{#heldcount\}

```ts
heldCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:160](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L160)

Number of rows skipped this round because they are still held in the outbound queue.

#### Remarks

Does not overlap with `missingCount` / `staleCount` / `orphanCount`: those three report actions that **actually ran**, while skipped rows are counted only here. If it never returns to zero, the outbound queue is stuck — that is the problem to look at.

---

### missingCount \{#missingcount\}

```ts
missingCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:146](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L146)

Number of missing items (need to be pulled)

---

### orphanCount \{#orphancount\}

```ts
orphanCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:152](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L152)

Number of orphans (present locally, absent remotely), excluding those held by the outbound queue and not deleted this round

---

### pulledCount \{#pulledcount\}

```ts
pulledCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:162](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L162)

Number of items actually pulled

---

### remoteCount \{#remotecount\}

```ts
remoteCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:144](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L144)

Number of remote metadata items

---

### staleCount \{#stalecount\}

```ts
staleCount: number;
```

Defined in: [packages/rxdb/src/repository/query-cache.interface.ts:148](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb/src/repository/query-cache.interface.ts#L148)

Number of stale items (need to be updated)
