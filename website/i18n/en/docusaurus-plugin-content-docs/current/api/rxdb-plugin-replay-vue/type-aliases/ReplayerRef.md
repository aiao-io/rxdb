# ReplayerRef

```ts
type ReplayerRef = Pick<ReplayerHandle, 'play' | 'pause' | 'seek'>;
```

Defined in: [rxdb-plugin-replay-vue/src/replayer.ts:10](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay-vue/src/replayer.ts#L10)

The commands obtained via the template `ref` (`expose`); calls before loading completes are no-ops (`seek` records the target time).
