# REPLAY_BLOCK_SELECTOR

```ts
const REPLAY_BLOCK_SELECTOR: '[data-rxdb-replay-block]' = '[data-rxdb-replay-block]';
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:9](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L9)

Selector always merged into `record.blockSelector`: add the `data-rxdb-replay-block` attribute to an element and
only a same-size placeholder block remains in the recording. Applications can mark sensitive areas without understanding rrweb.
