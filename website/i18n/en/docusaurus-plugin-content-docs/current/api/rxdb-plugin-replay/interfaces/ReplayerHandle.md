# ReplayerHandle

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:31](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L31)

Handle returned by [mountReplayer](../functions/mountReplayer.md). In the non-ready state `play` / `pause` / `seek` are no-ops, and everything is a no-op after `destroy()`.

## Methods

### destroy() \{#destroy\}

```ts
destroy(): void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:41](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L41)

Stops playback, destroys the rrweb replay, and empties the host element. Idempotent.

#### Returns

`void`

***

### pause() \{#pause\}

```ts
pause(): void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:37](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L37)

Pauses at the current moment.

#### Returns

`void`

***

### play() \{#play\}

```ts
play(): void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:35](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L35)

Plays from the current moment; restarts from the beginning when already at the end.

#### Returns

`void`

***

### seek() \{#seek\}

```ts
seek(timeMs): void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:39](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L39)

Jumps to `timeMs` relative to the session start (out-of-range values clamp to the bounds); when called during loading, it lands on the last seeked moment once loading completes.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `timeMs` | `number` |

#### Returns

`void`

***

### update() \{#update\}

```ts
update(options): void;
```

Defined in: [packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts:33](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/replayer/mount-replayer.ts#L33)

Reloads with a different `replay` or `sessionId`; changing only `initialTime` is equivalent to `seek()`.

#### Parameters

| Parameter | Type |
| ------ | ------ |
| `options` | `Partial`&lt;`Pick`&lt;[`ReplayerOptions`](ReplayerOptions.md), `"replay"` \| `"sessionId"` \| `"initialTime"`&gt;&gt; |

#### Returns

`void`
