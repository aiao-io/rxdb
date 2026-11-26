# ReplayerOptions

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:11](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L11)

Input of the replayer (`git show 2e820521:specs/005-us-909-session-replay/contracts/replayer-component.md` §1).

## Properties

### initialTime? \{#initialtime\}

```ts
readonly initialTime?: number;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:17](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L17)

Moment to land on once ready: ms relative to the session start, default 0.

---

### onCommitRestore? \{#oncommitrestore\}

```ts
readonly onCommitRestore?: (event) => void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:21](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L21)

Result after clicking a commit marker to restore.

#### Parameters

| Parameter | Type                                                          |
| --------- | ------------------------------------------------------------- |
| `event`   | [`ReplayerCommitRestoreEvent`](ReplayerCommitRestoreEvent.md) |

#### Returns

`void`

---

### onTimeChange? \{#ontimechange\}

```ts
readonly onTimeChange?: (timeMs) => void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:19](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L19)

Time changes (seeks, frame-by-frame during playback, finished playback).

#### Parameters

| Parameter | Type     |
| --------- | -------- |
| `timeMs`  | `number` |

#### Returns

`void`

---

### replay \{#replay\}

```ts
readonly replay: ReplayManager;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:13](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L13)

Source for reading events, reading markers, and restoring to a commit; usually `rxdb.replay`.

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:15](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L15)

The session to replay.
