# ReplayerProps

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L10)

The props of [Replayer](../variables/Replayer.md): inputs share names with `mountReplayer`, and the two callbacks correspond to the core view's `onTimeChange` / `onCommitRestore`.

## Properties

### initialTime? \{#initialtime\}

```ts
readonly initialTime?: number;
```

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:16](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L16)

The moment to land on after loading completes (ms relative to the session start, default 0); changing it afterwards is equivalent to `seek()`.

---

### onCommitRestore? \{#oncommitrestore\}

```ts
readonly onCommitRestore?: (event) => void;
```

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:20](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L20)

The restore result after clicking a commit marker (success, one of the four rejections, or a thrown error).

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

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:18](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L18)

Fired when playback / seeking changes the replay time.

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

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L12)

The recording facade (`rxdb.replay`). Switching instances reloads.

---

### sessionId \{#sessionid\}

```ts
readonly sessionId: string;
```

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:14](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L14)

The session to replay. Switching sessions reloads without rebuilding the component.
