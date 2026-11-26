# ReplayerCommitRestoreEvent

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:25](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L25)

Result of clicking a commit marker to restore; `reason` is `'error'` when `restoreToCommit()` throws.

## Properties

### marker \{#marker\}

```ts
readonly marker: ReplayCommitMarker;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:26](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L26)

---

### result \{#result\}

```ts
readonly result:
  | ReplayRestoreResult
  | {
  error: Error;
  ok: false;
  reason: "error";
};
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:27](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L27)
