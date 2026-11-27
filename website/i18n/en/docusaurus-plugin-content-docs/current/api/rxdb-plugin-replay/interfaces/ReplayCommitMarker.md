# ReplayCommitMarker

Defined in: [packages/rxdb-plugin-replay/src/types.ts:73](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L73)

A commit marker in the recording (`listCommitMarkers()`).

## Properties

### branchId \{#branchid\}

```ts
readonly branchId: string;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:78](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L78)

---

### commitId \{#commitid\}

```ts
readonly commitId: string;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:77](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L77)

---

### seq \{#seq\}

```ts
readonly seq: number;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:74](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L74)

---

### timestamp \{#timestamp\}

```ts
readonly timestamp: number;
```

Defined in: [packages/rxdb-plugin-replay/src/types.ts:76](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/types.ts#L76)

Timestamp of the marker event (epoch ms), i.e. its position on the replay timeline.
