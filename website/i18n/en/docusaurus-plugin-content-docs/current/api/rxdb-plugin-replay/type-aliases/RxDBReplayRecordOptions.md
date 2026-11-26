# RxDBReplayRecordOptions

```ts
type RxDBReplayRecordOptions = Pick<
  recordOptions<eventWithTime>,
  | 'maskAllInputs'
  | 'maskInputOptions'
  | 'maskTextSelector'
  | 'maskTextClass'
  | 'blockSelector'
  | 'blockClass'
  | 'ignoreSelector'
>;
```

Defined in: [packages/rxdb-plugin-replay/src/options.ts:12](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/options.ts#L12)

Subset of masking / blocking options passed through to rrweb `record()`; their meaning follows the rrweb documentation.
