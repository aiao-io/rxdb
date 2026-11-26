# DevToolsSnapshotPage

Defined in: [provider/snapshot.ts:56](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L56)

One page of snapshot records.

## Properties

### complete \{#complete\}

```ts
readonly complete: boolean;
```

Defined in: [provider/snapshot.ts:64](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L64)

`true` only when this page is the last one; **only when it is true may the panel conclude on
the "two kinds of missing"**.

---

### offset \{#offset\}

```ts
readonly offset: number;
```

Defined in: [provider/snapshot.ts:62](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L62)

Starting index of this page within the full set of records.

---

### records \{#records\}

```ts
readonly records: readonly DevToolsSnapshotRecord[];
```

Defined in: [provider/snapshot.ts:60](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L60)

The records of this page, preserving the `(logicalPath, id)` order at materialization time.

---

### snapshotId \{#snapshotid\}

```ts
readonly snapshotId: string;
```

Defined in: [provider/snapshot.ts:58](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-devtools/src/provider/snapshot.ts#L58)

The identity of the snapshot this page belongs to; subsequent pagination must echo it back
unchanged.
