# ReplayerRef

```ts
type ReplayerRef = Pick<ReplayerHandle, "play" | "pause" | "seek">;
```

Defined in: [rxdb-plugin-replay-react/src/replayer.tsx:24](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-react/src/replayer.tsx#L24)

The command handle obtained via `ref`; calls before loading completes are no-ops (`seek` records the target time).
