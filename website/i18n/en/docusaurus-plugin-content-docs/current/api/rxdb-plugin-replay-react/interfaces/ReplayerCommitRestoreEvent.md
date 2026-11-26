# ReplayerCommitRestoreEvent

Defined in: rxdb-plugin-replay/dist/replayer/mount-replayer.d.ts:16

The result of restoring after clicking a commit marker; `reason` is `'error'` when `restoreToCommit()` threw.

## Properties

### marker \{#marker\}

```ts
readonly marker: ReplayCommitMarker;
```

Defined in: rxdb-plugin-replay/dist/replayer/mount-replayer.d.ts:17

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

Defined in: rxdb-plugin-replay/dist/replayer/mount-replayer.d.ts:18
