# rxDBPluginReplay

```ts
const rxDBPluginReplay: Plugin<RxDBReplayOptions>;
```

Defined in: [packages/rxdb-plugin-replay/src/plugin.ts:103](https://github.com/aiao-io/rxdb/blob/b5232040240cf1ccfbab0ebf9ba882a4af8268a0/packages/rxdb-plugin-replay/src/plugin.ts#L103)

Recording/replay plugin factory: `rxdb.use(rxDBPluginReplay, { createRecordingDb })`.

## Remarks

Repeated `use()` on the same database returns the already-installed instance (options are not compared). Invalid options throw synchronously; the plugin is not registered and `rxdb.replay` is not attached.
