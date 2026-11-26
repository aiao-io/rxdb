# REPLAY_MARKER_TAGS

```ts
const REPLAY_MARKER_TAGS: object;
```

Defined in: [packages/rxdb-plugin-replay/src/markers.ts:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/markers.ts#L14)

The three marker tags this plugin writes into the recording.

## Type Declaration

### commit \{#commit\}

```ts
readonly commit: "rxdb-replay:commit" = 'rxdb-replay:commit';
```

The working tree wrote a new commit during recording.

### gap \{#gap\}

```ts
readonly gap: "rxdb-replay:gap" = 'rxdb-replay:gap';
```

Only the minimal temporary storage was recovered when continuing after a refresh; the last stretch of events before the refresh was lost.

### truncated \{#truncated\}

```ts
readonly truncated: "rxdb-replay:truncated" = 'rxdb-replay:truncated';
```

The session stopped because a limit was exceeded; no more events follow.
